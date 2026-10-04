/**
 * 重新抓取回归测试所需的 fixtures。
 *
 * 仓库里不包含这些数据（Steam 商店页 HTML 属于 Valve 的内容，不宜放进公开仓库），
 * 所以克隆之后先跑这个脚本把数据拉回来，再跑 selftest。
 *
 *   node fetch_fixtures.mjs      # 抓取
 *   node selftest.mjs            # 回归测试
 *   node selftest.mjs --live     # 额外的真实网络端到端测试
 *
 * 走代理时（例如 Clash）：
 *   $env:NODE_USE_ENV_PROXY=1; $env:HTTPS_PROXY='http://127.0.0.1:7897'
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as S from '../steam-insight/src/lib/steam.js';
import * as TP from '../steam-insight/src/lib/sources.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'fixtures');
fs.mkdirSync(OUT, { recursive: true });

// 商店页需要 age-gate cookie，否则会被 302 到 /agecheck/ 而读不到 DRM 声明
const AGE_COOKIE =
  'birthtime=628473600; mature_content=1; lastagecheckage=1-January-2000; wants_mature_content=1';
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const rawFetch = globalThis.fetch;

/** 模拟浏览器：商店页带年龄 cookie，HLTB 带真实 UA（其 token 绑定 UA） */
function browserFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : input.url;
  const headers = { ...(init.headers || {}) };
  if (url.includes('store.steampowered.com/app/')) headers.Cookie = AGE_COOKIE;
  if (url.includes('howlongtobeat.com')) headers['User-Agent'] = BROWSER_UA;
  return rawFetch(input, { ...init, headers });
}

const report = [];

async function saveText(name, url, init) {
  try {
    const res = await browserFetch(url, init);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    fs.writeFileSync(path.join(OUT, name), text, 'utf8');
    report.push([name, '✅', `${text.length} 字节`]);
    return text;
  } catch (err) {
    report.push([name, '❌', err.message]);
    return null;
  }
}

async function saveJson(name, url) {
  const text = await saveText(name, url);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    report[report.length - 1] = [name, '❌', 'JSON 解析失败'];
    return null;
  }
}

/* ------------------------------------------------------------------ */

console.log('开始抓取 fixtures …\n');

// Steam 官方接口
await saveJson('t_full.json', S.appDetailsUrl(1245620, 'cn', 'schinese'));
await saveJson('deck.json', S.deckCompatUrl(1245620, 'schinese'));

// 商店页：一个无 D 加密、一个有（互为反例），以及年龄门槛页
await saveText('eldenring.html', S.storePageUrl(1245620, 'cn', 'schinese'));
await saveText('wukong.html', S.storePageUrl(2358720, 'cn', 'schinese'));
await saveText(
  'agecheck.html',
  'https://store.steampowered.com/agecheck/app/1245620/?cc=cn&l=schinese'
);

// 第三方公开数据
await saveJson('protondb_elden.json', TP.protonUrl(1245620));
const sigls = await saveJson('xgp_sigls.json', TP.xgpSiglUrl());
if (sigls) {
  const ids = TP.parseSiglsIds(sigls).slice(0, 3);
  if (ids.length) await saveJson('xgp_detail.json', TP.xgpProductsUrl(ids));
}
await saveJson('awacy_games.json', TP.AWACY_URLS[0]);

// HowLongToBeat：两步，token 绑定 IP + UA
try {
  const initText = await saveText('_hltb_init.tmp', TP.hltbInitUrl(), {
    headers: { Accept: 'application/json' },
  });
  const token = initText ? JSON.parse(initText).token : null;
  fs.rmSync(path.join(OUT, '_hltb_init.tmp'), { force: true });
  if (!token) throw new Error('拿不到 token');
  await saveText('hltb_search.json', TP.HLTB_SEARCH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
    body: JSON.stringify(TP.hltbSearchBody('Elden Ring')),
  });
} catch (err) {
  report.push(['hltb_search.json', '❌', `HLTB 被拦截或限流：${err.message}`]);
}

/* ------------------------------------------------------------------ */

console.log(report.map(([n, s, d]) => `  ${s}  ${n.padEnd(22)} ${d}`).join('\n'));

const failed = report.filter(([, s]) => s === '❌');
console.log(`\n完成：成功 ${report.length - failed.length} 个，失败 ${failed.length} 个`);
if (failed.length) {
  console.log('失败的项不影响其他测试，可稍后重跑本脚本补齐（HLTB 常因 CDN 限流失败）。');
}
