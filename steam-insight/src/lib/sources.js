// 第三方数据源：Xbox Game Pass / AreWeAntiCheatYet / ProtonDB / HowLongToBeat
// 全部为纯函数或 URL 构造，便于在 Node 下做单元测试。

import {
  AWACY_STATUS_LABEL,
  KERNEL_LEVEL_ANTICHEATS,
  PROTON_TIER_LABEL,
} from './constants.js';

/* ------------------------------------------------------------------ */
/* URL                                                                 */
/* ------------------------------------------------------------------ */

/** AreWeAntiCheatYet 主库地址（第一个直连失败时用第二个 jsDelivr 镜像） */
export const AWACY_URLS = [
  'https://raw.githubusercontent.com/AreWeAntiCheatYet/AreWeAntiCheatYet/master/games.json',
  'https://cdn.jsdelivr.net/gh/AreWeAntiCheatYet/AreWeAntiCheatYet@master/games.json',
];

/** PC Game Pass 全量库 SIGL */
export const XGP_SIGL_PC_ALL = '609d944c-d395-4c0a-9ea4-e9f39b52c1ad';
/** PC Game Pass 订阅 BigID */
export const XGP_SUBSCRIPTION_PC = 'CFQ7TTC0KGQ8';
/** Game Pass Ultimate 订阅 BigID */
export const XGP_SUBSCRIPTION_ULTIMATE = 'CFQ7TTC0KHS0';

export function xgpSiglUrl(
  siglId = XGP_SIGL_PC_ALL,
  subscriptionContext = XGP_SUBSCRIPTION_PC
) {
  // 注意：platformContext 只接受 pc，传 console 会 400
  return (
    `https://catalog.gamepass.com/sigls/v3?id=${siglId}` +
    `&language=en-us&market=US&platformContext=pc&subscriptionContext=${subscriptionContext}`
  );
}

/** v2 兜底：不带 platform/subscription 参数 */
export function xgpSiglV2Url(siglId = XGP_SIGL_PC_ALL) {
  return `https://catalog.gamepass.com/sigls/v2?id=${siglId}&language=en-us&market=US`;
}

/** 微软展示目录，单次实测可传 200 个 bigId */
export function xgpProductsUrl(bigIds, market = 'US', language = 'en-us') {
  return (
    `https://displaycatalog.mp.microsoft.com/v7.0/products?bigIds=${bigIds.join(',')}` +
    `&market=${market}&languages=${language}`
  );
}

export function protonUrl(appid) {
  return `https://www.protondb.com/api/v1/reports/summaries/${appid}.json`;
}

export function hltbInitUrl() {
  return `https://howlongtobeat.com/api/search/site/init?t=${Date.now()}`;
}

export const HLTB_SEARCH_URL = 'https://howlongtobeat.com/api/search/site';
export const HLTB_REFERER = 'https://howlongtobeat.com/';

/** HLTB 搜索请求体（已实测可用） */
export function hltbSearchBody(name, page = 1, size = 10) {
  const terms = String(name)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8);
  return {
    searchType: 'games',
    searchTerms: terms,
    searchPage: page,
    size,
    searchOptions: {
      games: {
        userId: 0,
        platform: '',
        sortCategory: 'popular',
        rangeCategory: 'main',
        rangeTime: { min: null, max: null },
        gameplay: { perspective: '', flow: '', genre: '' },
        year: '',
        modifier: '',
      },
      users: { sortCategory: 'postcount' },
      lists: { sortCategory: 'follows' },
      filter: '',
      sort: 0,
      randomizer: 0,
    },
    useCache: true,
  };
}

/* ------------------------------------------------------------------ */
/* 名称归一化                                                          */
/* ------------------------------------------------------------------ */

const ROMAN = [
  [/\bviii\b/g, '8'], [/\bvii\b/g, '7'], [/\biii\b/g, '3'], [/\biv\b/g, '4'],
  [/\bvi\b/g, '6'], [/\bix\b/g, '9'], [/\bv\b/g, '5'], [/\bii\b/g, '2'], [/\bx\b/g, '10'],
];

/**
 * 归一化游戏名，用于跨平台名称匹配：
 * 小写、去商标符号、去括号后缀（Game Preview / Windows / 版本说明）、去标点、
 * 去开头冠词、罗马数字转阿拉伯数字。
 */
export function normalizeTitle(raw) {
  if (!raw) return '';
  let s = String(raw).toLowerCase();
  s = s.replace(/[\u2122\u00ae\u00a9]/g, ' ');
  s = s.replace(/[（(\[][^)）\]]*[)）\]]/g, ' '); // (Game Preview) / [Windows]
  s = s.replace(/\bedition\b|\bversion\b|\bgame preview\b/g, ' ');
  s = s.replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/^(the|a|an)\s+/, '');
  for (const [re, num] of ROMAN) s = s.replace(re, num);
  return s.trim();
}

/* ------------------------------------------------------------------ */
/* AreWeAntiCheatYet                                                   */
/* ------------------------------------------------------------------ */

/** games.json（数组）→ { steamAppId: entry } */
export function buildAwacyIndex(games) {
  const map = {};
  if (!Array.isArray(games)) return { map, count: 0 };
  for (const g of games) {
    const steam = g?.storeIds?.steam;
    if (!steam) continue;
    const key = String(steam);
    // 同名条目只保留第一条（数据里偶有重复）
    if (map[key]) continue;
    map[key] = {
      name: g.name || '',
      status: g.status || 'Unknown',
      anticheats: Array.isArray(g.anticheats) ? g.anticheats.filter(Boolean) : [],
      reference: g.reference || '',
      native: !!g.native,
      notes: Array.isArray(g.notes) ? g.notes.map((n) => (Array.isArray(n) ? n[0] : n)).filter(Boolean) : [],
      dateChanged: g.dateChanged || '',
    };
  }
  return { map, count: Object.keys(map).length };
}

export function isKernelAnticheat(anticheats) {
  if (!Array.isArray(anticheats)) return false;
  return anticheats.some((a) =>
    KERNEL_LEVEL_ANTICHEATS.some((k) => String(a).toLowerCase().includes(k.toLowerCase()))
  );
}

/** 查反作弊记录；无记录返回 null（表示"未知"，不是"没有反作弊"） */
export function lookupAwacy(index, appid) {
  const hit = index?.map?.[String(appid)];
  if (!hit) return null;
  return {
    name: hit.name,
    status: hit.status,
    statusLabel: AWACY_STATUS_LABEL[hit.status] || hit.status,
    anticheats: hit.anticheats,
    kernel: isKernelAnticheat(hit.anticheats),
    native: hit.native,
    reference: hit.reference,
    notes: hit.notes,
    dateChanged: hit.dateChanged,
  };
}

/* ------------------------------------------------------------------ */
/* Xbox Game Pass                                                      */
/* ------------------------------------------------------------------ */

/** sigls 响应（第一项是元数据）→ bigId 数组 */
export function parseSiglsIds(json) {
  if (!Array.isArray(json)) return [];
  const ids = [];
  for (const item of json) {
    if (item && typeof item === 'object' && typeof item.id === 'string') ids.push(item.id);
  }
  return ids;
}

/** displaycatalog 响应 → 精简条目数组 */
export function parseXgpProducts(json) {
  const out = [];
  const products = json?.Products;
  if (!Array.isArray(products)) return out;
  for (const p of products) {
    const loc = p?.LocalizedProperties?.[0];
    const title = loc?.ProductTitle;
    if (!title) continue;
    out.push({
      productId: p.ProductId,
      title,
      publisher: loc?.PublisherName || '',
      developer: loc?.DeveloperName || '',
    });
  }
  return out;
}

/** 条目数组 → { byTitle: Map-ish, titles: [] } */
export function buildXgpIndex(entries) {
  const byTitle = {};
  const titles = [];
  for (const e of entries || []) {
    const key = normalizeTitle(e.title);
    if (!key) continue;
    titles.push(e.title);
    if (!byTitle[key]) byTitle[key] = e;
  }
  return { byTitle, titles, count: Object.keys(byTitle).length };
}

/**
 * 在 Game Pass 索引里找游戏。
 * 完全归一化命中 → match='exact'；包含关系且公共长度足够 → match='approx'（页面会标"疑似"）
 */
export function lookupXgp(index, name) {
  if (!index || !index.byTitle) return { on: null, reason: 'index_unavailable' };
  const key = normalizeTitle(name);
  if (!key) return { on: null, reason: 'no_name' };

  const exact = index.byTitle[key];
  if (exact) return { on: true, match: 'exact', matchedTitle: exact.title, publisher: exact.publisher };

  let best = null;
  for (const [k, entry] of Object.entries(index.byTitle)) {
    if (k.length < 8 || key.length < 8) continue;
    if (k.includes(key) || key.includes(k)) {
      const common = Math.min(k.length, key.length);
      if (!best || common > best.common) best = { common, entry, key: k };
    }
  }
  if (best) {
    return {
      on: true,
      match: 'approx',
      matchedTitle: best.entry.title,
      publisher: best.entry.publisher,
    };
  }
  return { on: false, match: 'none' };
}

/* ------------------------------------------------------------------ */
/* ProtonDB                                                            */
/* ------------------------------------------------------------------ */

export function parseProton(json) {
  if (!json || typeof json !== 'object' || !json.tier) return null;
  return {
    tier: json.tier,
    tierLabel: PROTON_TIER_LABEL[json.tier] || json.tier,
    trendingTier: json.trendingTier || null,
    trendingLabel: PROTON_TIER_LABEL[json.trendingTier] || json.trendingTier || '—',
    bestReportedTier: json.bestReportedTier || null,
    total: typeof json.total === 'number' ? json.total : null,
    score: typeof json.score === 'number' ? json.score : null,
    confidence: json.confidence || null,
  };
}

/* ------------------------------------------------------------------ */
/* HowLongToBeat                                                       */
/* ------------------------------------------------------------------ */

const HLTB_TYPE_ORDER = { game: 0, dlc: 1, mod: 2, hack: 3, multi: 4 };

/**
 * 从 HLTB 搜索结果里挑选最匹配的一条。
 * 时长单位：秒。
 */
export function parseHltbSearch(json, expectedName) {
  const list = Array.isArray(json?.data) ? json.data : null;
  if (!list || !list.length) return null;

  const want = normalizeTitle(expectedName);
  const scored = list
    .map((item, i) => {
      const key = normalizeTitle(item.game_name);
      let score = 0;
      if (key && key === want) score += 100;
      else if (key && want && (key.includes(want) || want.includes(key))) score += 50;
      score += 10 - Math.min(10, i); // 热门优先
      const typeRank = HLTB_TYPE_ORDER[item.game_type] ?? 5;
      score += (5 - typeRank) * 4;
      return { item, score, exact: key === want };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best) return null;
  const it = best.item;
  return {
    gameId: it.game_id,
    name: it.game_name,
    type: it.game_type || 'game',
    match: best.exact ? 'exact' : 'approx',
    main: num(it.comp_main),
    mainExtra: num(it.comp_plus),
    completionist: num(it.comp_100),
    all: num(it.comp_all),
    mainCount: num(it.comp_main_count),
    releaseWorld: it.release_world || null,
  };
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** 秒 → 小时字符串（统一保留一位小数，避免同一时长在不同位置显示不一致） */
export function secondsToHours(seconds) {
  if (!seconds) return null;
  return `${Math.round((seconds / 3600) * 10) / 10} 小时`;
}
