// Steam 官方接口的 URL 构造与纯解析函数（不依赖 DOM，可在 Node 下测试）

import {
  DECK_CATEGORY_LABEL,
  DECK_TOKEN_LABEL,
  DENUVO_PATTERN,
  FAMILY_SHARING_CATEGORY_ID,
  LAUNCHER_KEYWORDS,
} from './constants.js';

export const STORE_HOST = 'https://store.steampowered.com';
export const API_HOST = 'https://api.steampowered.com';

/**
 * 公开的 appdetails 接口一次只接受一个 appid（传多个会 400），
 * 所以这里带上 filters 把体积从 ~17KB 压到 ~8.6KB。
 */
export const APP_DETAILS_FILTERS = [
  'basic',
  'categories',
  'price_overview',
  'dlc',
  'supported_languages',
  'release_date',
  'developers',
  'publishers',
  'recommendations',
  'platforms',
].join(',');

export function appDetailsUrl(appid, cc = 'cn', lang = 'schinese') {
  return (
    `${STORE_HOST}/api/appdetails?appids=${encodeURIComponent(appid)}` +
    `&cc=${cc}&l=${lang}&filters=${APP_DETAILS_FILTERS}`
  );
}

export function storePageUrl(appid, cc = 'cn', lang = 'schinese') {
  return `${STORE_HOST}/app/${appid}/?cc=${cc}&l=${lang}`;
}

export function deckCompatUrl(appid, lang = 'schinese') {
  return `${STORE_HOST}/saleaction/ajaxgetdeckappcompatibilityreport?nAppID=${appid}&l=${lang}`;
}

export function familyTokenUrl() {
  return `${STORE_HOST}/pointssummary/ajaxgetasyncconfig`;
}

export function familyGroupUrl(accessToken) {
  return `${API_HOST}/IFamilyGroupsService/GetFamilyGroupForUser/v1/?access_token=${encodeURIComponent(
    accessToken
  )}`;
}

export function familySharedLibraryUrl(accessToken, groupId) {
  const q = new URLSearchParams({
    access_token: accessToken,
    family_groupid: String(groupId ?? 0),
    include_own: 'true',
    include_excluded: 'true',
    include_free: 'true',
    include_non_games: 'true',
    language: 'schinese',
  });
  return `${API_HOST}/IFamilyGroupsService/GetSharedLibraryApps/v1/?${q.toString()}`;
}

/* ------------------------------------------------------------------ */
/* appdetails                                                          */
/* ------------------------------------------------------------------ */

/** 从 appdetails 响应里取出 data（含 success 判断） */
export function pickAppData(json, appid) {
  const entry = json?.[String(appid)];
  if (!entry || entry.success !== true || !entry.data) return null;
  return entry.data;
}

export function parseAppDetails(data) {
  if (!data) return null;
  const categories = (data.categories || []).map((c) => ({ id: c.id, label: c.description }));
  return {
    appid: data.steam_appid,
    name: data.name,
    type: data.type,
    isFree: !!data.is_free,
    dlcIds: Array.isArray(data.dlc) ? data.dlc.map(Number) : [],
    categories,
    familySharing: categories.some((c) => c.id === FAMILY_SHARING_CATEGORY_ID),
    languages: parseSupportedLanguages(data.supported_languages),
    price: parsePrice(data.price_overview),
    releaseDate: data.release_date
      ? { date: data.release_date.date, comingSoon: !!data.release_date.coming_soon }
      : null,
    developers: data.developers || [],
    publishers: data.publishers || [],
    platforms: data.platforms || null,
    header: data.header_image || null,
    shortDescription: data.short_description || '',
    recommendations: data.recommendations?.total ?? null,
  };
}

export function parsePrice(priceOverview) {
  if (!priceOverview) return null;
  return {
    currency: priceOverview.currency,
    initial: priceOverview.initial,
    final: priceOverview.final,
    discountPercent: priceOverview.discount_percent || 0,
    initialFormatted: priceOverview.initial_formatted || '',
    finalFormatted: priceOverview.final_formatted || '',
  };
}

/**
 * appdetails.supported_languages 是一段 HTML：
 *   "英语<strong>*</strong>, 法语, ... 简体中文, ...<br><strong>*</strong>具有完全音频支持的语言"
 * 带 * 的语言表示有完整音频支持。
 */
export function parseSupportedLanguages(html) {
  const result = {
    languages: [],
    hasSimplifiedChinese: false,
    hasTraditionalChinese: false,
    hasChineseAudio: false,
  };
  if (!html || typeof html !== 'string') return result;

  const firstChunk = html.split('<br')[0];
  const parts = firstChunk
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const part of parts) {
    const fullAudio = /<strong>\s*\*/.test(part);
    const name = part
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!name) continue;
    result.languages.push({ name, fullAudio });
  }

  const zh = result.languages.find((l) => l.name.includes('简体中文'));
  const zhTw = result.languages.find((l) => l.name.includes('繁体中文'));
  result.hasSimplifiedChinese = !!zh;
  result.hasTraditionalChinese = !!zhTw;
  result.hasChineseAudio = !!(zh && zh.fullAudio);
  return result;
}

/* ------------------------------------------------------------------ */
/* Steam Deck 兼容性                                                   */
/* ------------------------------------------------------------------ */

export function parseDeckReport(json) {
  const r = json?.results;
  if (!r) return null;
  const category = typeof r.resolved_category === 'number' ? r.resolved_category : 0;
  return {
    category,
    label: DECK_CATEGORY_LABEL[category] ?? '未知',
    items: (r.resolved_items || []).map((i) => ({
      token: i.loc_token,
      label: DECK_TOKEN_LABEL[i.loc_token] || '检查项',
      pass: i.display_type === 4,
    })),
    steamosCategory: r.steamos_resolved_category ?? null,
    machineCategory: r.machine_resolved_category ?? null,
  };
}

/* ------------------------------------------------------------------ */
/* 商店页 DOM：第三方 DRM / Denuvo / 启动器                             */
/* ------------------------------------------------------------------ */

export function stripTags(html) {
  return String(html)
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|li)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/** 从 `<div class="DRM_notice">` 起始位置做 div 配平，取出内部 HTML */
function readBalancedDiv(html, from) {
  const re = /<div\b|<\/div\s*>/gi;
  re.lastIndex = from;
  let depth = 1;
  let m;
  while ((m = re.exec(html))) {
    if (m[0].startsWith('</')) {
      depth -= 1;
      if (depth === 0) return html.slice(from, m.index);
    } else {
      depth += 1;
    }
  }
  return html.slice(from, from + 1500);
}

/** 取出商店页里所有 DRM_notice 的纯文本 */
export function extractDrmNoticeTexts(html) {
  const texts = [];
  if (!html) return texts;
  const re = /<div[^>]*class="[^"]*\bDRM_notice\b[^"]*"[^>]*>/gi;
  let m;
  while ((m = re.exec(html))) {
    const inner = readBalancedDiv(html, m.index + m[0].length);
    const text = stripTags(inner);
    if (text) texts.push(text);
  }
  return texts;
}

/**
 * 分析 DRM 文案。
 * 中文页文案形如：`包含第三方 DRM: Denuvo`；英文页形如 `Incorporates 3rd-party DRM: Denuvo Anti-tamper`
 */
export function analyzeDrmTexts(texts) {
  const joined = (texts || []).join('\n');
  const drmList = [];
  const re = /DRM\s*[:：]\s*([^\n]+)/gi;
  let m;
  while ((m = re.exec(joined))) {
    const value = m[1].trim().replace(/[。.;；]+$/, '');
    if (value && !drmList.includes(value)) drmList.push(value);
  }

  const launchers = [];
  for (const { match, label } of LAUNCHER_KEYWORDS) {
    if (match.test(joined) && !launchers.includes(label)) launchers.push(label);
  }

  const eula = /最终用户许可协议|End User License Agreement|EULA/i.test(joined);

  return {
    denuvo: DENUVO_PATTERN.test(joined) || drmList.some((d) => DENUVO_PATTERN.test(d)),
    drmList,
    launchers,
    eula,
    rawTexts: texts || [],
  };
}

/** 商店页返回年龄验证页时，几乎拿不到有效内容 */
export function looksLikeAgeGate(html) {
  if (!html) return true;
  if (html.length < 4000) return true;
  return /agecheck|年龄验证|请输入您的出生日期/i.test(html) && !/DRM_notice|game_area_purchase/i.test(html);
}

/** 被 302 到 /agecheck/ 时，响应 URL 会变成年龄验证页地址 */
export function isAgeCheckUrl(url) {
  return typeof url === 'string' && /\/agecheck\//.test(url);
}

/* ------------------------------------------------------------------ */
/* 家庭组                                                              */
/* ------------------------------------------------------------------ */

export function parseFamilyToken(json) {
  if (json?.success === 1 && json?.data?.webapi_token) return json.data.webapi_token;
  return null;
}

export function parseFamilyGroupId(json) {
  const r = json?.response;
  if (!r) return { ok: false, reason: 'no_response' };
  if (r.is_not_member_of_any_group) return { ok: false, reason: 'not_in_any_group' };
  if (r.family_groupid) return { ok: true, groupId: String(r.family_groupid) };
  return { ok: false, reason: 'no_group_id' };
}

/**
 * 在家庭共享库里查找某个 appid。
 * exclude_reason === 0 表示 Included（可共享）。
 */
export function lookupSharedLibrary(apps, appid, mySteamId) {
  if (!Array.isArray(apps)) return { state: 'unknown' };
  const target = Number(appid);
  const hits = apps.filter((a) => Number(a.appid) === target);
  if (!hits.length) return { state: 'not_in_family' };

  const hit = hits[0];
  const owners = (hit.owner_steamids || []).map(String);
  const excludeReason = Number(hit.exclude_reason ?? 0);
  const ownedByOthers = owners.some((id) => String(id) !== String(mySteamId));

  if (excludeReason !== 0) {
    return {
      state: 'excluded',
      excludeReason,
      owners,
      excludeLabel: EXCLUDE_REASON_LABEL[excludeReason] || `排除原因 ${excludeReason}`,
    };
  }
  if (ownedByOthers) {
    return { state: 'in_family', owners, excludeReason: 0 };
  }
  return { state: 'owned_by_me', owners, excludeReason: 0 };
}

export const EXCLUDE_REASON_LABEL = {
  1: '发行商禁止家庭共享',
  2: '许可类型不支持共享',
  3: '免费游戏',
  4: '许可为私有',
  5: '区域限制',
  6: '应用类型不符',
  7: '不可退款 DLC',
  8: '尚未发售',
};

/* ------------------------------------------------------------------ */
/* 杂项                                                                */
/* ------------------------------------------------------------------ */

function base64Decode(str) {
  try {
    const normalized = String(str).replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized + '='.repeat((4 - (normalized.length % 4)) % 4);
    return atob(padded);
  } catch {
    return null;
  }
}

/**
 * webapi_token 里内嵌了 SteamID，可以直接解出来，免去额外请求。
 * token 可能是标准三段 JWT，也可能只是一段 base64 JSON。
 */
export function extractSteamIdFromToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.includes('.') ? token.split('.') : [token];
  for (const part of parts) {
    const decoded = base64Decode(part);
    if (!decoded) continue;
    const m = decoded.match(/\b7656119\d{10}\b/);
    if (m) return m[0];
    const m2 = decoded.match(/"sub"\s*:\s*"(\d{17})"/);
    if (m2) return m2[1];
  }
  return null;
}

export function extractAppIdFromUrl(url) {
  const m = String(url || '').match(/\/app\/(\d+)(?:\/|$|\?)/);
  return m ? Number(m[1]) : null;
}

export function formatPlaytime(minutes) {
  if (!minutes && minutes !== 0) return null;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} 分钟`;
  return m ? `${h} 小时 ${m} 分` : `${h} 小时`;
}
