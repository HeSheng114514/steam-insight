// 背景 Service Worker：所有网络请求、缓存与数据聚合都在这里完成，
// 内容脚本只负责读页面 DOM 与渲染。

import { DEFAULT_SETTINGS, REGION_PRESETS, TTL } from './lib/constants.js';
import {
  cacheGet,
  cacheKeys,
  cacheRemoveByPrefix,
  cacheSet,
  cacheWrap,
  clearAllCache,
  pruneExpired,
} from './lib/cache.js';
import { fetchJson, fetchText, fetchWithRetry, mapLimit, sleep } from './lib/net.js';
import { toJson, toMarkdown, toSheetRows, toText } from './lib/format.js';
import { buildXlsx, bytesToBase64 } from './lib/xlsx.js';
import * as S from './lib/steam.js';
import * as TP from './lib/sources.js';

/* ------------------------------------------------------------------ */
/* 设置                                                                */
/* ------------------------------------------------------------------ */

async function getSettings() {
  const got = await chrome.storage.local.get('settings');
  return { ...DEFAULT_SETTINGS, ...(got.settings || {}) };
}

async function setSettings(patch) {
  const next = { ...(await getSettings()), ...(patch || {}) };
  await chrome.storage.local.set({ settings: next });
  return next;
}

chrome.runtime.onInstalled.addListener(async () => {
  const got = await chrome.storage.local.get('settings');
  if (!got.settings) await chrome.storage.local.set({ settings: { ...DEFAULT_SETTINGS } });
  chrome.alarms.create('prune', { periodInMinutes: 60 });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('prune', { periodInMinutes: 60 });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'prune') pruneExpired();
});

/* ------------------------------------------------------------------ */
/* 通用：带缓存的抓取                                                  */
/* ------------------------------------------------------------------ */

/**
 * 成功用 ttlOk，失败/缺失用 ttlFail（避免一次网络抖动被当成"没有数据"缓存一整天）。
 * loader 返回 { missing:true, permanent:true } 表示"确实不存在"（例如 404），按成功 TTL 缓存。
 */
async function cachedFetch(key, ttlOk, loader) {
  const cached = await cacheGet(key);
  if (cached) return cached;
  let value = null;
  try {
    value = await loader();
  } catch {
    value = null;
  }
  const result = value && typeof value === 'object' ? value : { missing: true };
  const failed = !value || (result.missing === true && result.permanent !== true);
  await cacheSet(key, result, failed ? TTL.fail : ttlOk);
  return result;
}

/** 返回状态码与最终 URL（用于识别商店页被 302 到 /agecheck/） */
async function requestText(url, options = {}, cfg = {}) {
  try {
    const res = await fetchWithRetry(url, options, { retries: 1, timeout: 20000, ...cfg });
    return { ok: res.ok, status: res.status, text: await res.text(), finalUrl: res.url || url };
  } catch {
    return { ok: false, status: 0, text: null, finalUrl: url };
  }
}

/* ------------------------------------------------------------------ */
/* Steam 官方接口                                                      */
/* ------------------------------------------------------------------ */

/** 解析后的 appdetails（带缓存） */
async function getAppDetails(appid, cc, lang) {
  return cachedFetch(`appdetails:${appid}:${cc}:${lang}`, TTL.appDetails, async () => {
    const json = await fetchJson(S.appDetailsUrl(appid, cc, lang));
    const data = S.pickAppData(json, appid);
    return data ? S.parseAppDetails(data) : { missing: true, appid };
  });
}

async function getDeck(appid, lang) {
  return cachedFetch(`deck:${appid}:${lang}`, TTL.deck, async () => {
    const json = await fetchJson(S.deckCompatUrl(appid, lang));
    return S.parseDeckReport(json) || { missing: true };
  });
}

async function getDrmFromStorePage(appid, cc, lang) {
  return cachedFetch(`drm:${appid}:${cc}:${lang}`, TTL.storePageHtml, async () => {
    const res = await requestText(S.storePageUrl(appid, cc, lang), { credentials: 'include' });
    if (!res.ok || !res.text) return { missing: true };
    if (S.isAgeCheckUrl(res.finalUrl) || S.looksLikeAgeGate(res.text)) {
      return { missing: true, ageGated: true };
    }
    return S.analyzeDrmTexts(S.extractDrmNoticeTexts(res.text));
  });
}

const DLC_LIST_LIMIT = 40;

/** DLC 只能逐个 appid 查（appdetails 不支持批量），并发 4 且全部走缓存 */
async function getDlcItems(dlcIds, cc, lang) {
  const ids = (dlcIds || []).slice(0, DLC_LIST_LIMIT);
  const items = await mapLimit(ids, 4, async (id) => {
    const parsed = await getAppDetails(id, cc, lang);
    if (!parsed || parsed.missing) return null;
    return {
      appid: id,
      name: parsed.name,
      isFree: parsed.isFree,
      priceText: describePrice(parsed),
    };
  });
  return items.filter(Boolean);
}

function describePrice(detail) {
  if (!detail || detail.missing) return null;
  if (detail.isFree) return '免费';
  if (detail.price) {
    const p = detail.price;
    return p.discountPercent > 0
      ? `${p.finalFormatted}（-${p.discountPercent}%）`
      : p.finalFormatted;
  }
  if (detail.releaseDate?.comingSoon) return '未发售';
  return '该区无价格';
}

/* ------------------------------------------------------------------ */
/* 第三方索引                                                          */
/* ------------------------------------------------------------------ */

async function getAwacyIndex() {
  return cacheWrap('awacy:index:v1', TTL.awacyIndex, async () => {
    for (const url of TP.AWACY_URLS) {
      const games = await fetchJson(url);
      if (Array.isArray(games) && games.length) {
        const { map, count } = TP.buildAwacyIndex(games);
        if (count > 0) return { builtAt: Date.now(), count, map, failed: false };
      }
    }
    return { builtAt: Date.now(), count: 0, map: {}, failed: true };
  });
}

let xgpBuilding = null;

/**
 * MV3 的 Service Worker 空闲 30 秒会被回收，而 XGP 索引首次构建要下载 30 MB 左右，
 * 期间用一次轻量调用保活。
 */
function startKeepAlive() {
  const id = setInterval(() => {
    try {
      chrome.runtime.getPlatformInfo(() => {});
    } catch {
      /* 忽略 */
    }
  }, 20000);
  return () => clearInterval(id);
}

async function getXgpIndex() {
  const cached = await cacheGet('xgp:index:v1');
  if (cached) return cached;
  if (xgpBuilding) return xgpBuilding;
  xgpBuilding = (async () => {
    const stopKeepAlive = startKeepAlive();
    try {
      let ids = TP.parseSiglsIds(await fetchJson(TP.xgpSiglUrl()));
      if (!ids.length) ids = TP.parseSiglsIds(await fetchJson(TP.xgpSiglV2Url()));
      if (!ids.length) {
        return { builtAt: Date.now(), count: 0, byTitle: {}, titles: [], failed: true };
      }
      const batches = [];
      for (let i = 0; i < ids.length; i += 200) batches.push(ids.slice(i, i + 200));
      // 并行下载，缩短整体耗时，降低被回收的概率
      const pages = await mapLimit(batches, 3, async (batch) => {
        const json = await fetchJson(TP.xgpProductsUrl(batch), {}, { timeout: 60000, retries: 1 });
        return TP.parseXgpProducts(json);
      });
      const entries = pages.filter(Boolean).flat();
      const index = { builtAt: Date.now(), failed: entries.length === 0, ...TP.buildXgpIndex(entries) };
      if (!index.failed) await cacheSet('xgp:index:v1', index, TTL.xgpIndex);
      return index;
    } finally {
      stopKeepAlive();
    }
  })();
  try {
    return await xgpBuilding;
  } finally {
    xgpBuilding = null;
  }
}

let hltbToken = null;
let hltbTokenAt = 0;

async function getHltbToken(force = false) {
  if (!force && hltbToken && Date.now() - hltbTokenAt < 5 * 60 * 1000) return hltbToken;
  const res = await requestText(
    TP.hltbInitUrl(),
    { headers: { Accept: 'application/json' } },
    { retries: 0, timeout: 20000 }
  );
  if (res.ok && res.text) {
    try {
      const json = JSON.parse(res.text);
      if (json?.token) {
        hltbToken = json.token;
        hltbTokenAt = Date.now();
        return hltbToken;
      }
    } catch {
      /* 落到返回 null，由调用方降级 */
    }
  }
  return null;
}

/**
 * HLTB 通关时长。
 *
 * 关键：HLTB 的 CDN 要求 Referer 必须是它自己的域，否则稳定 403
 * （只带 UA 时 403，加 Referer 立刻 200，已实测）。Referer 是浏览器接管的
 * 禁止请求头，fetch 设不了，靠 manifest 里的 declarativeNetRequest 规则注入。
 *
 * 拿到 gameId 后，再抓一次游戏页用 profile_steam（= Steam AppID）核对，
 * 避免同名作品串号；核对不上时在候选里换一个。
 */
async function getHltb(name, appid = null) {
  if (!name) return null;
  const key = `hltb:${TP.normalizeTitle(name)}`;
  return cachedFetch(key, TTL.hltb, async () => {
    let candidates = [];

    for (let attempt = 0; attempt < 2 && !candidates.length; attempt++) {
      const token = await getHltbToken(attempt > 0);
      if (!token) {
        hltbToken = null;
        continue;
      }
      const res = await requestText(
        TP.HLTB_SEARCH_URL,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-auth-token': token },
          body: JSON.stringify(TP.hltbSearchBody(name)),
        },
        { retries: 0, timeout: 20000 }
      );
      if (!res.ok || !res.text) {
        hltbToken = null;
        continue;
      }
      let json = null;
      try {
        json = JSON.parse(res.text);
      } catch {
        hltbToken = null;
        continue;
      }
      if (Array.isArray(json?.data) && json.data.length) {
        candidates = json.data;
      } else if (json && json.count === 0) {
        return { missing: true, permanent: true }; // 确实不在库里
      } else {
        hltbToken = null;
      }
    }

    if (!candidates.length) return { missing: true };

    // 用解析器的打分逻辑选定首选
    const first = TP.parseHltbSearch({ data: candidates }, name);
    if (!first) return { missing: true };

    // 没有 Steam AppID 可比对时，直接采用名称匹配结果
    if (!appid) return first;

    // 有 AppID：抓游戏页核对 profile_steam
    const order = [first.gameId, ...candidates.map((c) => c.game_id).filter((id) => id !== first.gameId)];
    for (const gameId of order.slice(0, 4)) {
      const page = await requestText(
        TP.hltbGameUrl(gameId),
        { headers: TP.HLTB_BROWSER_HEADERS },
        { retries: 0, timeout: 20000 }
      );
      if (!page.ok || !page.text) continue;
      const verified = TP.parseHltbGamePage(page.text, appid);
      if (verified) return verified;
    }

    // 核对不上就退回名称匹配结果，但标注为近似
    return { ...first, match: 'approx' };
  });
}

async function getProton(appid) {
  return cachedFetch(`proton:${appid}`, TTL.proton, async () => {
    const res = await requestText(TP.protonUrl(appid));
    if (res.status === 404) return { missing: true, permanent: true }; // 该游戏没有报告
    if (!res.ok || !res.text) return { missing: true };
    try {
      return TP.parseProton(JSON.parse(res.text)) || { missing: true, permanent: true };
    } catch {
      return { missing: true };
    }
  });
}

/* ------------------------------------------------------------------ */
/* 家庭组                                                              */
/* ------------------------------------------------------------------ */

async function getFamilyToken() {
  try {
    const json = await fetchJson(S.familyTokenUrl(), { credentials: 'include' }, { retries: 0, timeout: 12000 });
    return S.parseFamilyToken(json);
  } catch {
    return null;
  }
}

async function fetchMySteamIdFromCommunity() {
  const html = await fetchText('https://steamcommunity.com/my/', { credentials: 'include' }, { retries: 0 });
  if (!html) return null;
  const m =
    html.match(/g_steamID\s*=\s*"(\d{17})"/) ||
    html.match(/"steamid"\s*:\s*"(\d{17})"/) ||
    html.match(/\b(7656119\d{10})\b/);
  return m ? m[1] : null;
}

async function getFamilyLibrary({ force = false, mySteamId = null } = {}) {
  if (!force) {
    const cached = await cacheGet('family:library:v1');
    if (cached) return cached;
  }

  const token = await getFamilyToken();
  if (!token) {
    return finalize({ state: 'not_logged_in' });
  }

  const self = mySteamId || S.extractSteamIdFromToken(token) || (await fetchMySteamIdFromCommunity());

  const groupJson = await fetchJson(S.familyGroupUrl(token), {}, { retries: 0, timeout: 15000 });
  const group = S.parseFamilyGroupId(groupJson);
  if (!group.ok) {
    return finalize({ state: group.reason === 'not_in_any_group' ? 'not_in_any_group' : 'unknown' });
  }

  const libJson = await fetchJson(
    S.familySharedLibraryUrl(token, group.groupId),
    {},
    { retries: 0, timeout: 25000 }
  );
  const rawApps = libJson?.response?.apps;
  if (!Array.isArray(rawApps)) {
    return finalize({ state: 'unknown' });
  }

  // 只保留判定需要的字段，控制缓存体积
  const apps = rawApps.map((a) => ({
    appid: Number(a.appid),
    owner_steamids: Array.isArray(a.owner_steamids) ? a.owner_steamids.map(String) : [],
    exclude_reason: Number(a.exclude_reason ?? 0),
    name: a.name || '',
  }));

  return finalize({ state: 'ok', groupId: group.groupId, mySteamId: self, apps });

  function finalize(value) {
    const result = { ...value, fetchedAt: Date.now() };
    // 未登录 / 未加入家庭组也要缓存（短 TTL），否则每次打开详情页都会白跑一次 token 请求
    cacheSet('family:library:v1', result, value.state === 'ok' ? TTL.familyLibrary : TTL.fail);
    return result;
  }
}

/* ------------------------------------------------------------------ */
/* 单个游戏的完整数据                                                  */
/* ------------------------------------------------------------------ */

async function getAppData(appid, opts = {}) {
  const settings = await getSettings();
  const lang = settings.storeLanguage || 'schinese';
  appid = Number(appid);

  const cn = await getAppDetails(appid, 'cn', lang);
  if (!cn || cn.missing) {
    return { appid, missing: true, generatedAt: Date.now() };
  }

  const us = await getAppDetails(appid, 'us', 'english');
  const englishName = us && !us.missing ? us.name : cn.name;

  const wantXgp = settings.fetchXgp && opts.needXgp !== false;
  const wantAc = settings.fetchAnticheat;
  const wantProton = settings.fetchProton;
  const wantHltb = settings.fetchHltb;
  const wantDeck = true;

  const jobs = {
    deck: wantDeck ? getDeck(appid, lang) : Promise.resolve(null),
    proton: wantProton ? getProton(appid) : Promise.resolve(null),
    awacyIndex: wantAc ? getAwacyIndex() : Promise.resolve(null),
    xgpIndex: wantXgp ? getXgpIndex() : Promise.resolve(null),
    hltb: wantHltb ? getHltb(englishName, appid) : Promise.resolve(null),
    dlc: cn.dlcIds?.length ? getDlcItems(cn.dlcIds, 'cn', lang) : Promise.resolve([]),
    family: settings.fetchFamilyGroup
      ? getFamilyLibrary({ mySteamId: opts.mySteamId })
      : Promise.resolve(null),
  };

  const [deckRaw, protonRaw, awacyIndex, xgpIndex, hltbRaw, dlcItems, familyLib] =
    await Promise.all([
      jobs.deck,
      jobs.proton,
      jobs.awacyIndex,
      jobs.xgpIndex,
      jobs.hltb,
      jobs.dlc,
      jobs.family,
    ]);

  // 多区价格
  const regionList = Array.isArray(settings.regions) && settings.regions.length
    ? settings.regions
    : DEFAULT_SETTINGS.regions;
  const regionPrices = await mapLimit(regionList, 3, async (cc) => {
    const label = REGION_PRESETS.find((r) => r.cc === cc)?.label || cc.toUpperCase();
    if (cc === 'cn') {
      return { cc, label, text: describePrice(cn) || '—', isFree: !!cn.isFree, price: cn.price || null };
    }
    const d = await getAppDetails(appid, cc, 'english');
    return {
      cc,
      label,
      text: describePrice(d) || '不可用',
      isFree: !!d?.isFree,
      price: d?.price || null,
    };
  });

  // Denuvo：优先用内容脚本从已加载页面上读到的 DRM 文案（详情页正常路径），
  // 读不到再回源抓商店页（可能被年龄验证挡住）
  let drm = opts.drmTexts?.length ? S.analyzeDrmTexts(opts.drmTexts) : null;
  let drmSource = drm ? 'store-page-dom' : 'unavailable';
  if (!drm) {
    const fromPage = await getDrmFromStorePage(appid, 'cn', lang);
    if (fromPage && !fromPage.missing && typeof fromPage.denuvo === 'boolean') {
      drm = fromPage;
      drmSource = 'store-page-fetch';
    } else if (fromPage?.ageGated) {
      drmSource = 'age_gated';
    }
  }

  const awacy = awacyIndex ? TP.lookupAwacy(awacyIndex, appid) : null;
  const xgp = xgpIndex ? TP.lookupXgp(xgpIndex, englishName) : { on: null, reason: 'disabled' };

  const family = buildFamilyResult(familyLib, appid);
  const cnRegion = regionPrices.find((r) => r.cc === 'cn');

  return {
    appid,
    name: cn.name,
    englishName,
    generatedAt: Date.now(),

    // 核心四项
    familySharing: cn.familySharing,
    family,
    dlc: {
      count: cn.dlcIds?.length || 0,
      items: dlcItems || [],
      truncated: (cn.dlcIds?.length || 0) > DLC_LIST_LIMIT,
    },
    xgp: {
      on: xgp?.on ?? null,
      match: xgp?.match || null,
      matchedTitle: xgp?.matchedTitle || null,
      tier: 'PC Game Pass',
      indexSize: xgpIndex?.count ?? null,
      reason: xgp?.reason || null,
    },
    denuvo: drm
      ? { has: drm.denuvo, drmList: drm.drmList, source: drmSource }
      : { has: null, drmList: [], source: drmSource },

    // 附加
    deck: deckRaw && !deckRaw.missing ? deckRaw : null,
    proton: protonRaw && !protonRaw.missing ? protonRaw : null,
    anticheat: awacy,
    launcher: drm ? { launchers: drm.launchers, eula: drm.eula } : null,
    languages: cn.languages,
    regionPrices,
    regionAvailability: { cnAvailable: !!(cn.isFree || cn.price) },
    hltb: hltbRaw && !hltbRaw.missing ? hltbRaw : null,

    // 元信息
    meta: {
      isFree: cn.isFree,
      type: cn.type,
      price: cn.price,
      releaseDate: cn.releaseDate,
      developers: cn.developers,
      publishers: cn.publishers,
      recommendations: cn.recommendations,
      header: cn.header,
      shortDescription: cn.shortDescription,
    },
  };
}

function buildFamilyResult(familyLib, appid) {
  if (!familyLib) return { groupState: 'unknown', state: 'unknown' };
  if (familyLib.state !== 'ok') return { groupState: familyLib.state, state: familyLib.state };
  const hit = S.lookupSharedLibrary(familyLib.apps, appid, familyLib.mySteamId);
  return { ...hit, groupState: hit.state, groupId: familyLib.groupId, fetchedAt: familyLib.fetchedAt };
}

/* ------------------------------------------------------------------ */
/* 列表页批量数据                                                      */
/* ------------------------------------------------------------------ */

async function getListData(appids, opts = {}) {
  const settings = await getSettings();
  const ids = [...new Set((appids || []).map(Number).filter(Boolean))].slice(0, 120);
  if (!ids.length) return {};

  const results = {};

  // 1) 逐条 appdetails（英文名便于 XGP 匹配，价格用国区），并发 4，全部走 12 小时缓存
  const basicRows = await mapLimit(ids, 4, async (id) => {
    const parsed = await getAppDetails(id, 'cn', 'english');
    if (!parsed || parsed.missing) return null;
    return {
      appid: id,
      name: parsed.name,
      familySharing: parsed.familySharing,
      dlcCount: parsed.dlcIds.length,
      priceText: describePrice(parsed),
      isFree: !!parsed.isFree,
    };
  });
  for (const row of basicRows) {
    if (row) results[row.appid] = row;
  }

  // 2) 本地索引类：XGP / 反作弊
  const [xgpIndex, awacyIndex] = await Promise.all([
    settings.fetchXgp ? getXgpIndex() : Promise.resolve(null),
    settings.fetchAnticheat ? getAwacyIndex() : Promise.resolve(null),
  ]);

  // 家庭共享库只读一次缓存，不要在每个 appid 上重复读
  const famLib = settings.fetchFamilyGroup ? await cacheGet('family:library:v1') : null;

  for (const id of ids) {
    const row = results[id];
    if (!row) continue;
    const xgp = xgpIndex ? TP.lookupXgp(xgpIndex, row.name) : null;
    row.xgp = xgp?.on ?? null;
    row.xgpMatch = xgp?.match || null;
    const awacy = awacyIndex ? TP.lookupAwacy(awacyIndex, id) : null;
    row.anticheat = awacy
      ? { status: awacy.status, statusLabel: awacy.statusLabel, kernel: awacy.kernel, anticheats: awacy.anticheats }
      : null;
    if (settings.fetchFamilyGroup) {
      row.familyState = famLib ? buildFamilyResult(famLib, id).groupState : 'unknown';
    }
  }

  // 3) 需要逐条请求的部分：Deck 兼容性 + Denuvo
  if (opts.deep) {
    const lang = settings.storeLanguage || 'schinese';
    await mapLimit(ids, 3, async (id) => {
      const row = results[id];
      if (!row) return;
      const [deck, drm] = await Promise.all([
        getDeck(id, lang),
        settings.listDenuvoLookup ? getDrmFromStorePage(id, 'cn', lang) : Promise.resolve(null),
      ]);
      row.deck = deck && !deck.missing ? { category: deck.category, label: deck.label } : null;
      row.denuvo = drm && !drm.missing ? drm.denuvo : null;
      row.drmList = drm && !drm.missing ? drm.drmList : [];
      row.launchers = drm && !drm.missing ? drm.launchers : [];
      row.denuvoGated = !!(drm && drm.ageGated);
    });
  }

  return results;
}

/* ------------------------------------------------------------------ */
/* 数据源自检                                                          */
/* ------------------------------------------------------------------ */

async function getSourcesStatus() {
  const [awacy, xgp] = await Promise.all([getAwacyIndex(), getXgpIndex()]);
  const [proton, hltb, family] = await Promise.all([
    getProton(1245620),
    getHltb('Elden Ring', 1245620),
    getFamilyLibrary(),
  ]);
  const deck = await getDeck(1245620, 'schinese');
  let dnrRules = null;
  try {
    const rules = await chrome.declarativeNetRequest.getEnabledRulesets();
    dnrRules = rules;
  } catch {
    dnrRules = null;
  }
  return {
    steamAppDetails: true,
    steamDeck: !!(deck && !deck.missing),
    awacy: { ok: !awacy.failed, entries: awacy.count, builtAt: awacy.builtAt },
    xgp: { ok: !xgp.failed, entries: xgp.count, builtAt: xgp.builtAt },
    proton: !!(proton && !proton.missing),
    hltb: !!(hltb && !hltb.missing),
    hltbVerified: hltb?.match === 'steam-id',
    dnrRulesets: dnrRules,
    family: family.state,
  };
}

/* ------------------------------------------------------------------ */
/* 消息路由                                                            */
/* ------------------------------------------------------------------ */

async function handleMessage(msg) {
  switch (msg?.type) {
    case 'settings:get':
      return getSettings();
    case 'settings:set':
      return setSettings(msg.patch);
    case 'app:data':
      return getAppData(msg.appid, msg);
    case 'list:data':
      return getListData(msg.appids, { deep: !!msg.deep });
    case 'drm:analyze':
      return S.analyzeDrmTexts(msg.texts || []);
    case 'family:refresh':
      return getFamilyLibrary({ force: true, mySteamId: msg.mySteamId });
    case 'family:state': {
      const fam = await cacheGet('family:library:v1');
      return fam || { state: 'unknown' };
    }
    case 'export:markdown':
      return { text: toMarkdown(msg.data, { includeRaw: !!msg.includeRaw }) };
    case 'export:json':
      return { text: toJson(msg.data) };
    case 'export:text':
      return { text: toText(msg.data) };
    case 'export:xlsx': {
      const { rows, boldRows } = toSheetRows(msg.data);
      const name = String(msg.data?.name || `App ${msg.data?.appid}`).slice(0, 31);
      const bytes = buildXlsx(name || 'Steam', rows, { boldRows });
      return { base64: bytesToBase64(bytes) };
    }
    case 'cache:clearApp': {
      const appid = Number(msg.appid);
      if (!appid) return { cleared: 0 };
      let cleared = 0;
      for (const prefix of [
        `appdetails:${appid}:`,
        `deck:${appid}:`,
        `proton:${appid}`,
        `drm:${appid}:`,
      ]) {
        cleared += await cacheRemoveByPrefix(prefix);
      }
      return { cleared };
    }
    case 'cache:clear': {
      const n = await clearAllCache();
      hltbToken = null;
      return { cleared: n };
    }
    case 'cache:stats': {
      const keys = await cacheKeys();
      const all = await chrome.storage.local.get(null);
      const bytes = new Blob([JSON.stringify(all)]).size;
      return { entries: keys.length, bytes };
    }
    case 'sources:status':
      return getSourcesStatus();
    case 'options:open':
      // openOptionsPage 只在扩展上下文可用，内容脚本调不到，所以由后台代开
      try {
        await chrome.runtime.openOptionsPage();
        return { ok: true };
      } catch (err) {
        return { ok: false, error: String(err?.message || err) };
      }
    case 'ping':
      return { ok: true };
    default:
      return { error: `未知消息类型: ${msg?.type}` };
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg).then(
    (res) => sendResponse(res),
    (err) => sendResponse({ error: String(err?.message || err) })
  );
  return true; // 异步响应
});

// 供开发期自动化测试直接驱动（浏览器里作为 ES module 被加载，导出无副作用）
export { handleMessage, getAppData, getListData, getSettings, setSettings };
