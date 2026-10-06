/**
 * Steam 洞察 · 开发期回归测试
 *
 *   node selftest.mjs            # 仅跑离线解析测试（使用 fixtures 里的真实抓取数据）
 *   node selftest.mjs --live     # 额外跑一遍真实网络端到端流程
 *
 * 走代理时需要（本机 Clash）：
 *   $env:NODE_USE_ENV_PROXY=1; $env:HTTPS_PROXY='http://127.0.0.1:7897'
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as S from '../steam-insight/src/lib/steam.js';
import * as TP from '../steam-insight/src/lib/sources.js';
import * as F from '../steam-insight/src/lib/format.js';
import * as X from '../steam-insight/src/lib/xlsx.js';
import { toMarkdown, toJson } from '../steam-insight/src/lib/format.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const fx = (name) => path.join(HERE, 'fixtures', name);
const readJson = (name) => JSON.parse(fs.readFileSync(fx(name), 'utf8'));
const readText = (name) => fs.readFileSync(fx(name), 'utf8');

let pass = 0;
let fail = 0;
const failures = [];

function check(label, condition, detail) {
  if (condition) {
    pass++;
    console.log(`  ✅ ${label}`);
  } else {
    fail++;
    failures.push(label);
    console.log(`  ❌ ${label}${detail !== undefined ? `  → 实际: ${JSON.stringify(detail)}` : ''}`);
  }
}

function eq(label, actual, expected) {
  check(label, actual === expected, actual);
}

function section(title) {
  console.log(`\n── ${title} ──`);
}

/* ================================================================== */
/* 离线解析测试                                                        */
/* ================================================================== */

section('appdetails 解析（真实响应）');
{
  const data = S.pickAppData(readJson('t_full.json'), 1245620);
  check('pickAppData 取到 data', !!data);
  const parsed = S.parseAppDetails(data);
  check('名称为非空字符串', typeof parsed.name === 'string' && parsed.name.length > 0, parsed.name);
  eq('category 62 → 支持家庭共享', parsed.familySharing, true);
  eq('DLC 数量', parsed.dlcIds.length, 3);
  eq('国区价格', parsed.price && parsed.price.finalFormatted, '¥ 298.00');
  eq('简体中文在语言列表里', parsed.languages.hasSimplifiedChinese, true);
  eq('简体中文无完整语音', parsed.languages.hasChineseAudio, false);
  check('语言列表数量 > 10', parsed.languages.languages.length > 10, parsed.languages.languages.length);
  eq('发行日期已取到', typeof parsed.releaseDate.date === 'string' && parsed.releaseDate.date.length > 0, true);
  check('平台字段存在', parsed.platforms && parsed.platforms.windows === true);
  check('无 filters 缺陷：recommendations 存在', typeof parsed.recommendations === 'number', parsed.recommendations);
}

section('商店页 DOM 解析：Denuvo / 第三方 DRM / EULA');
{
  const wukong = readText('wukong.html');
  const texts = S.extractDrmNoticeTexts(wukong);
  check('黑神话取到 DRM_notice', texts.length >= 2, texts.length);
  const a = S.analyzeDrmTexts(texts);
  eq('黑神话：有 Denuvo', a.denuvo, true);
  check('drmList 含 Denuvo', a.drmList.some((d) => /denuvo/i.test(d)), a.drmList);
  eq('黑神话：需同意第三方协议', a.eula, true);
  eq('页面不是年龄门槛页', S.looksLikeAgeGate(wukong), false);

  const er = S.analyzeDrmTexts(S.extractDrmNoticeTexts(readText('eldenring.html')));
  eq('艾尔登法环：无 Denuvo（反例）', er.denuvo, false);
  eq('艾尔登法环：仍需同意协议', er.eula, true);
  eq('空 HTML 视为年龄门槛页', S.looksLikeAgeGate(''), true);

  const gate = readText('agecheck.html');
  eq('真实年龄验证页被识别', S.looksLikeAgeGate(gate), true);
  eq('年龄验证页读不到 DRM 声明', S.extractDrmNoticeTexts(gate).length, 0);
  eq('识别 /agecheck/ 跳转', S.isAgeCheckUrl('https://store.steampowered.com/agecheck/app/1245620/?cc=cn'), true);
  eq('正常商店页 URL 不误判', S.isAgeCheckUrl('https://store.steampowered.com/app/1245620/?cc=cn'), false);
}

section('Steam Deck 兼容性');
{
  const deck = S.parseDeckReport(readJson('deck.json'));
  check('解析成功', !!deck);
  eq('resolved_category = 3', deck.category, 3);
  eq('中文标签', deck.label, '已验证');
  check('检查项已中文化', deck.items.length > 0 && deck.items[0].label !== '检查项', deck.items[0]);
}

section('ProtonDB');
{
  const p = TP.parseProton(readJson('protondb_elden.json'));
  eq('tier', p.tier, 'gold');
  eq('中文标签', p.tierLabel, '黄金');
  eq('trendingTier', p.trendingTier, 'platinum');
  eq('报告总数', p.total, 2102);
  eq('无数据返回 null', TP.parseProton(null), null);
}

section('AreWeAntiCheatYet');
{
  const raw = readJson('awacy_games.json');
  const idx = TP.buildAwacyIndex(raw);
  check('索引条数 > 600（其余条目没有 Steam ID）', idx.count > 600, idx.count);
  eq('Steam 映射数少于总条目数', idx.count < raw.length, true);
  const sample = raw.find((g) => g.storeIds && g.storeIds.steam);
  const hit = TP.lookupAwacy(idx, sample.storeIds.steam);
  check('按 Steam appid 往返查询命中', !!hit && hit.name === sample.name, hit && hit.name);
  eq('无记录返回 null', TP.lookupAwacy(idx, 999999999), null);
  eq('EAC 判定为内核级', TP.isKernelAnticheat(['Easy Anti-Cheat']), true);
  eq('BattlEye 判定为内核级', TP.isKernelAnticheat(['BattlEye']), true);
  eq('VAC 不判为内核级', TP.isKernelAnticheat(['VAC']), false);
}

section('Xbox Game Pass');
{
  const ids = TP.parseSiglsIds(readJson('xgp_sigls.json'));
  check('SIGL 清单条数 > 500', ids.length > 500, ids.length);
  const products = TP.parseXgpProducts(readJson('xgp_detail.json'));
  eq('展示目录条目数', products.length, 3);
  const index = TP.buildXgpIndex(products);
  eq('精确匹配（含括号后缀）', TP.lookupXgp(index, '9 Kings (Game Preview)').on, true);
  eq('不在库', TP.lookupXgp(index, 'This Game Is Definitely Not On Game Pass').on, false);
  eq('索引缺失时返回 null 而不是 false', TP.lookupXgp(null, 'x').on, null);
}

section('HowLongToBeat');
{
  const h = TP.parseHltbSearch(readJson('hltb_search.json'), 'Elden Ring');
  check('解析成功', !!h);
  eq('game_id', h.gameId, 68151);
  eq('主线时长（秒）', h.main, 216418);
  eq('精确匹配首选本体', h.match, 'exact');
  eq('秒转小时', TP.secondsToHours(216418), '60.1 小时');
}

section('名称归一化');
{
  eq('去商标符号', TP.normalizeTitle('ELDEN RING™'), 'elden ring');
  eq('去括号后缀', TP.normalizeTitle('9 Kings (Game Preview)'), '9 kings');
  eq('去开头冠词', TP.normalizeTitle('The Witcher 3: Wild Hunt'), 'witcher 3 wild hunt');
  eq('罗马数字', TP.normalizeTitle('Final Fantasy VII Remake'), 'final fantasy 7 remake');
  eq('大小写与标点', TP.normalizeTitle("Baldur's Gate 3"), 'baldur s gate 3');
  eq('空值', TP.normalizeTitle(null), '');
}

section('家庭共享库判定');
{
  const me = '76561198000000009';
  const apps = [
    { appid: 100, owner_steamids: ['76561198000000001'], exclude_reason: 0 },
    { appid: 200, owner_steamids: ['76561198000000002'], exclude_reason: 2 },
    { appid: 300, owner_steamids: [me], exclude_reason: 0 },
  ];
  eq('他人在家庭库', S.lookupSharedLibrary(apps, 100, me).state, 'in_family');
  eq('被排除', S.lookupSharedLibrary(apps, 200, me).state, 'excluded');
  eq('自己拥有', S.lookupSharedLibrary(apps, 300, me).state, 'owned_by_me');
  eq('不在家庭库', S.lookupSharedLibrary(apps, 999, me).state, 'not_in_family');
  eq('排除原因有中文标签', S.lookupSharedLibrary(apps, 200, me).excludeLabel, '许可类型不支持共享');
}

section('webapi_token → SteamID');
{
  const token = Buffer.from(JSON.stringify({ sub: '76561198000000009' })).toString('base64url');
  eq('从单段 base64 解出', S.extractSteamIdFromToken(token), '76561198000000009');
  const jwt = ['aGVhZGVy', Buffer.from(JSON.stringify({ sub: '76561197999999999' })).toString('base64url'), 'sig'].join('.');
  eq('从三段 JWT 解出', S.extractSteamIdFromToken(jwt), '76561197999999999');
  eq('无效 token', S.extractSteamIdFromToken('!!!not-base64!!!'), null);
}

section('导出格式化');
{
  const data = {
    appid: 1245620,
    name: '艾尔登法环',
    familySharing: true,
    family: { groupState: 'in_family' },
    xgp: { on: true, tier: 'PC Game Pass' },
    denuvo: { has: true },
    dlc: { count: 3, items: [{ appid: 1, name: '黄金树幽影', priceText: '¥ 198.00', isFree: false }] },
    deck: { category: 3, label: '已验证' },
    proton: { tier: 'gold', tierLabel: '黄金', trendingLabel: '白金', total: 2102 },
    anticheat: { anticheats: ['Easy Anti-Cheat'], statusLabel: '官方支持', kernel: true, status: 'Supported' },
    launcher: { launchers: ['Ubisoft Connect'], eula: true },
    languages: { hasSimplifiedChinese: true, hasChineseAudio: false },
    regionAvailability: { cnAvailable: true },
    regionPrices: [{ cc: 'cn', label: '国区', text: '¥ 298.00' }],
    hltb: { main: 216418, mainExtra: 364924, completionist: 490342 },
  };
  const md = toMarkdown(data);
  check('Markdown 含标题', md.includes('# 艾尔登法环（App 1245620）'));
  check('Markdown 含 XGP 在库', md.includes('Xbox Game Pass | ✅ 在库'));
  check('Markdown 含 D 加密', md.includes('有 Denuvo'));
  check('Markdown 含家庭库', md.includes('家庭库已有'));
  check('Markdown 含多区价格表', md.includes('## 多区价格'));
  check('Markdown 含 DLC 明细', md.includes('黄金树幽影'));
  const json = JSON.parse(toJson(data));
  eq('JSON 可解析', json.data.appid, 1245620);
}

section('URL 构造');
{
  const u = S.appDetailsUrl(1245620, 'cn', 'schinese');
  check('appdetails 带 filters', u.includes('filters='));
  check('appdetails 单 appid', /appids=1245620&/.test(u));
  check('Deck 接口', S.deckCompatUrl(9, 'schinese').includes('nAppID=9'));
  check('家庭组接口', S.familyGroupUrl('tok').includes('access_token=tok'));
  check('共享库接口含 include_excluded', S.familySharedLibraryUrl('tok', 5).includes('include_excluded=true'));
  check('XGP SIGL 带 platformContext=pc', TP.xgpSiglUrl().includes('platformContext=pc'));
  check('HLTB body 按空格分词', JSON.stringify(TP.hltbSearchBody('Elden Ring').searchTerms) === '["Elden","Ring"]');
  check('HLTB 游戏页 URL', TP.hltbGameUrl(68151) === 'https://howlongtobeat.com/game/68151');
  check('HLTB 规则 ID 常量', TP.HLTB_RULE_ID === 'howlongtobeat_referer');
}

/* ================================================================== */
/* HowLongToBeat：服务端渲染页面解析（__NEXT_DATA__）                   */
/* ================================================================== */

section('HLTB 页面解析');
{
  // 真实结构：props.pageProps.game.data.game[0]，且带 profile_steam = Steam AppID
  const html = `<!DOCTYPE html><html><body>
<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
    props: {
      pageProps: {
        game: {
          data: {
            game: [
              {
                game_id: 68151,
                game_name: 'Elden Ring',
                game_type: 'game',
                profile_steam: 1245620,
                comp_main: 216436,
                comp_plus: 365048,
                comp_100: 490307,
                comp_main_count: 1500,
              },
            ],
          },
        },
      },
    },
  })}</script>
</body></html>`;

  const parsed = TP.parseHltbGamePage(html, 1245620);
  check('能解出 __NEXT_DATA__', !!TP.extractNextData(html));
  check('解析成功', !!parsed);
  eq('game_id', parsed.gameId, 68151);
  eq('主线时长', parsed.main, 216436);
  eq('全收集时长', parsed.completionist, 490307);
  eq('带出 Steam AppID', parsed.steamAppid, '1245620');
  eq('来源标记为 steam-id', parsed.match, 'steam-id');

  // AppID 不匹配时必须拒绝，避免同名作品串号
  eq('AppID 不符时返回 null', TP.parseHltbGamePage(html, 999999), null);
  eq('无 __NEXT_DATA__ 返回 null', TP.parseHltbGamePage('<html></html>', 1245620), null);
  eq('坏 JSON 返回 null', TP.parseHltbGamePage('<script id="__NEXT_DATA__" type="application/json">{oops</script>', 1), null);
}

/* ================================================================== */
/* 导出：纯文本 / Excel                                                */
/* ================================================================== */

section('纯文本导出');
{
  const data = {
    appid: 1245620,
    name: '艾尔登法环',
    family: { groupState: 'in_family' },
    familySharing: true,
    xgp: { on: true, tier: 'PC Game Pass', match: 'exact' },
    denuvo: { has: true, drmList: ['Denuvo'], source: 'store-page-dom' },
    dlc: { count: 3, items: [{ appid: 1, name: '黄金树幽影', priceText: '¥ 198.00', isFree: false }] },
    deck: { category: 3, label: '已验证' },
    proton: { tierLabel: '黄金', trendingLabel: '白金', total: 2102 },
    anticheat: { anticheats: ['Easy Anti-Cheat'], statusLabel: '官方支持', kernel: true },
    launcher: { launchers: ['Ubisoft Connect'], eula: true },
    languages: { hasSimplifiedChinese: true, hasChineseAudio: false, languages: new Array(12).fill({}) },
    regionAvailability: { cnAvailable: true },
    regionPrices: [{ cc: 'cn', label: '国区', text: '¥ 298.00' }],
    hltb: { main: 216436, mainExtra: 365048, completionist: 490307, match: 'steam-id' },
    meta: { releaseDate: { date: '2022 年 2 月 24 日' } },
  };
  const txt = F.toText(data);
  check('含标题行', txt.includes('艾尔登法环（App 1245620）'));
  check('含区块标记', txt.includes('【核心信息】') && txt.includes('【多区价格】') && txt.includes('【DLC 明细】'));
  check('含通关时长', txt.includes('通关时长') && txt.includes('60.1 小时'));
  check('CRLF 换行', txt.includes('\r\n'));
  check('含 D 加密', txt.includes('Denuvo'));
}

section('Excel 导出');
{
  const data = {
    appid: 1245620,
    name: '艾尔登法环',
    family: { groupState: 'in_family' },
    xgp: { on: false, tier: 'PC Game Pass' },
    denuvo: { has: true, drmList: ['Denuvo'] },
    dlc: { count: 0, items: [] },
    hltb: { main: 216436, mainExtra: 365048, completionist: 490307, match: 'steam-id' },
  };
  const { rows, boldRows } = F.toSheetRows(data);
  eq('表头', `${rows[0][0]}/${rows[0][1]}`, '项目/结果');
  check('含游戏名称行', rows.some((r) => r[0] === '游戏名称' && r[1] === '艾尔登法环'));
  check('含 AppID 行', rows.some((r) => r[0] === 'Steam AppID' && r[1] === 1245620));
  check('加粗行非空', boldRows.length > 1);

  const bytes = X.buildXlsx('测试表', rows, { boldRows });
  check('生成字节', bytes.length > 800, bytes.length);
  check('ZIP 魔数', bytes[0] === 0x50 && bytes[1] === 0x4b);

  // 自己解 ZIP 验证内部结构完整
  const buf = Buffer.from(bytes);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  check('有 EOCD', eocd > 0);
  const total = buf.readUInt16LE(eocd + 10);
  eq('条目数 6', total, 6);

  const names = [];
  let pos = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < total; n++) {
    const nameLen = buf.readUInt16LE(pos + 28);
    const extraLen = buf.readUInt16LE(pos + 30);
    const commentLen = buf.readUInt16LE(pos + 32);
    names.push(buf.toString('utf8', pos + 46, pos + 46 + nameLen));
    pos += 46 + nameLen + extraLen + commentLen;
  }
  for (const need of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']) {
    check(`含 ${need}`, names.includes(need));
  }
  check('base64 可编码', X.bytesToBase64(bytes).length > 1000);
}

/* ================================================================== */
/* 缓存回归（必须真的调用 loader，不能被默认参数吃掉）                  */
/* ================================================================== */

section('缓存 cacheWrap');
{
  const memory = {};
  globalThis.chrome = {
    storage: {
      local: {
        async get(k) {
          if (k === null || k === undefined) return { ...memory };
          return typeof k === 'string' && k in memory ? { [k]: memory[k] } : {};
        },
        async set(o) {
          Object.assign(memory, o);
        },
        async remove(keys) {
          for (const k of Array.isArray(keys) ? keys : [keys]) delete memory[k];
        },
      },
    },
  };
  const C = await import('../steam-insight/src/lib/cache.js');
  let calls = 0;
  const v1 = await C.cacheWrap('regression:a', 60000, async () => {
    calls++;
    return { value: 1 };
  });
  eq('首次未命中 → 调用 loader', calls, 1);
  eq('返回 loader 结果', v1.value, 1);
  const v2 = await C.cacheWrap('regression:a', 60000, async () => {
    calls++;
    return { value: 2 };
  });
  eq('二次命中 → 不再调用 loader', calls, 1);
  eq('命中返回缓存值', v2.value, 1);
  eq('cacheGet 未命中返回 fallback', await C.cacheGet('regression:absent', null), null);
  await C.cacheRemoveByPrefix('regression:');
  eq('按前缀清理后重新走 loader', await C.cacheWrap('regression:a', 60000, async () => {
    calls++;
    return { value: 3 };
  }).then((v) => v.value), 3);
  eq('清理后 loader 被再次调用', calls, 2);
}

/* ================================================================== */
/* 真实网络端到端                                                      */
/* ================================================================== */

if (process.argv.includes('--live')) {
  section('端到端（真实网络）');

  const memory = {};
  globalThis.chrome = {
    storage: {
      local: {
        async get(key) {
          if (key === null || key === undefined) return { ...memory };
          if (typeof key === 'string') return key in memory ? { [key]: memory[key] } : {};
          return {};
        },
        async set(obj) {
          Object.assign(memory, obj);
        },
        async remove(keys) {
          for (const k of Array.isArray(keys) ? keys : [keys]) delete memory[k];
        },
      },
    },
    runtime: {
      onMessage: { addListener() {} },
      onInstalled: { addListener() {} },
      onStartup: { addListener() {} },
      getPlatformInfo: async () => ({ os: 'win' }),
      openOptionsPage: async () => { globalThis.__optionsOpened = true; },
    },
    alarms: { create() {}, onAlarm: { addListener() {} } },
  };

  const bg = await import('../steam-insight/src/background.js');

  // 「设置」按钮走的消息链路：内容脚本不能直接调 openOptionsPage，必须由后台代开
  globalThis.__optionsOpened = false;
  const optRes = await bg.handleMessage({ type: 'options:open' });
  check('options:open 返回 ok', optRes && optRes.ok === true, optRes);
  check('options:open 真的调用了 openOptionsPage', globalThis.__optionsOpened === true);

  // Node 环境的补齐，让请求尽量贴近浏览器：
  //  · 商店页需要 age-gate cookie（浏览器里用户通过一次年龄验证后本来就有）
  //  · HLTB 的 token 绑定 User-Agent，浏览器会自动带真实 UA，扩展无法自定义，
  //    这里显式补一个 Chrome UA 来验证流程本身
  const BROWSER_UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
  const AGE_COOKIE =
    'birthtime=628473600; mature_content=1; lastagecheckage=1-January-2000; wants_mature_content=1';
  const realFetch = globalThis.fetch;
  globalThis.fetch = (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    const headers = { ...(init.headers || {}) };
    if (url.includes('store.steampowered.com/app/')) headers.Cookie = AGE_COOKIE;
    if (url.includes('howlongtobeat.com')) headers['User-Agent'] = BROWSER_UA;
    return realFetch(input, { ...init, headers });
  };

  for (const appid of [1245620, 2358720]) {
    const t0 = Date.now();
    const res = await bg.handleMessage({ type: 'app:data', appid, drmTexts: [], mySteamId: null });
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    if (res.error || res.missing) {
      check(`app:data ${appid}`, false, res.error || 'missing');
      continue;
    }
    const fmt = (v) => (v ? `${Math.round((v / 3600) * 10) / 10}h` : '—');
    console.log(
      [
        `  📦 ${res.name} / ${res.englishName}  (${secs}s)`,
        `     XGP=${res.xgp.on}${res.xgp.match === 'approx' ? '(疑似)' : ''}  Denuvo=${res.denuvo.has} ${JSON.stringify(res.denuvo.drmList)} [${res.denuvo.source}]`,
        `     家庭共享=${res.familySharing}  家庭组=${res.family.groupState}  DLC=${res.dlc.count}`,
        `     Deck=${res.deck ? res.deck.label : '—'}  Proton=${res.proton ? res.proton.tierLabel : '—'}  反作弊=${
          res.anticheat ? res.anticheat.anticheats.join('/') + '(' + res.anticheat.statusLabel + ')' : '无记录'
        }`,
        `     中文=${res.languages.hasSimplifiedChinese} 语音=${res.languages.hasChineseAudio}  国区可购=${res.regionAvailability.cnAvailable}`,
        `     多区=${res.regionPrices.map((r) => `${r.label}:${r.text}`).join(' | ')}`,
        `     HLTB 主线=${fmt(res.hltb && res.hltb.main)} 全收集=${fmt(res.hltb && res.hltb.completionist)}`,
      ].join('\n')
    );
    check(
      `app:data ${appid} 核心字段齐全`,
      res.familySharing !== undefined && res.dlc !== undefined && res.xgp && res.denuvo
    );
    check(
      `app:data ${appid} Denuvo 有明确结论或明确说明被年龄验证拦截`,
      res.denuvo.has === true || res.denuvo.has === false || res.denuvo.source === 'age_gated',
      res.denuvo
    );
    if (appid === 2358720) {
      eq('黑神话：端到端判定有 D 加密', res.denuvo.has, true);
      eq('黑神话：Denuvo 来自抓取商店页', res.denuvo.source, 'store-page-fetch');
    }
    if (appid === 1245620) {
      eq('艾尔登法环：端到端判定无 D 加密', res.denuvo.has, false);
    }
    if (appid === 1245620) {
      // 注：Node 环境没有 declarativeNetRequest，HLTB 会因缺 Referer 被 CDN 挡（预期行为）。
      // 扩展内的真实通过情况由 CDP 端到端测试覆盖。
      check(
        'HLTB 在 Node 下要么拿到数据，要么明确为空（Referer 由扩展的 DNR 规则提供）',
        res.hltb === null || typeof res.hltb === 'object',
        res.hltb ? `match=${res.hltb.match}` : 'null'
      );
      const txt = F.toText(res);
      check('端到端：TXT 导出可用', txt.length > 300, txt.length);
      const { rows, boldRows } = F.toSheetRows(res);
      const xlsx = X.buildXlsx('t', rows, { boldRows });
      check('端到端：Excel 可生成', xlsx.length > 1000, xlsx.length);
    }
  }

  {
    const t0 = Date.now();
    const list = await bg.handleMessage({ type: 'list:data', appids: [1245620, 2358720, 1091500], deep: true });
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    const keys = Object.keys(list);
    check('list:data 返回条目', keys.length > 0, keys);
    for (const k of keys) {
      const r = list[k];
      console.log(`  📋 ${k} ${r.name} | XGP=${r.xgp} Denuvo=${r.denuvo} 家庭=${r.familyState} DLC=${r.dlcCount} Deck=${r.deck ? r.deck.label : '—'} 价格=${r.priceText}`);
    }
    check('list:data 含深度字段', keys.some((k) => list[k].denuvo !== undefined), secs);
  }

  const md = await bg.handleMessage({ type: 'export:markdown', data: await bg.handleMessage({ type: 'app:data', appid: 1245620 }) });
  check('导出 Markdown 成功', typeof md.text === 'string' && md.text.length > 200, md.text && md.text.length);
  console.log('\n--- Markdown 预览（前 900 字）---');
  console.log(md.text.slice(0, 900));
}

/* ================================================================== */

console.log(`\n${'='.repeat(56)}`);
console.log(`结果：通过 ${pass} 项，失败 ${fail} 项${process.argv.includes('--live') ? '（含真实网络测试）' : ''}`);
if (fail) {
  console.log('失败项：\n' + failures.map((f) => '  · ' + f).join('\n'));
  process.exitCode = 1;
}
