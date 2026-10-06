// 内容脚本：只做「读页面 DOM + 渲染」，所有网络请求都转发给背景脚本。
(function () {
  'use strict';
  if (window.__steamInsightLoaded) return;
  window.__steamInsightLoaded = true;

  /**
   * 现代 Steam 商店页有两个 .rightcol：前一个是购买区（glance），
   * 后一个 .rightcol.game_meta_data 才是"游戏详情"。必须显式优先后者，
   * 否则 querySelector 会命中购买区、把面板插到购买按钮上方。
   */
  const DETAIL_SELECTOR = '.rightcol.game_meta_data';
  const DETAIL_FALLBACK = '.rightcol';

  /** 与背景脚本通信 */
  function send(msg) {
    return new Promise((resolve) => {
      let settled = false;
      try {
        chrome.runtime.sendMessage(msg, (res) => {
          settled = true;
          if (chrome.runtime.lastError) {
            resolve({ error: chrome.runtime.lastError.message });
          } else {
            resolve(res);
          }
        });
      } catch (err) {
        if (!settled) resolve({ error: String(err && err.message ? err.message : err) });
      }
      // 背景脚本无响应时的兜底
      setTimeout(() => {
        if (!settled) resolve({ error: '背景脚本无响应（可能需要重新加载扩展）' });
      }, 120000);
    });
  }

  /* ---------------------------------------------------------------- */
  /* 小工具                                                            */
  /* ---------------------------------------------------------------- */

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function badge(kind, text, title) {
    const b = el('span', `si-badge si-${kind}`, text);
    if (title) b.title = title;
    return b;
  }

  function toast(message) {
    let box = document.getElementById('si-toast');
    if (!box) {
      box = el('div');
      box.id = 'si-toast';
      document.body.appendChild(box);
    }
    box.textContent = message;
    box.classList.add('si-show');
    clearTimeout(box.__timer);
    box.__timer = setTimeout(() => box.classList.remove('si-show'), 2200);
  }

  async function copyText(text, okMessage) {
    try {
      await navigator.clipboard.writeText(text);
      toast(okMessage || '已复制到剪贴板');
    } catch {
      const ta = el('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand('copy');
        toast(okMessage || '已复制到剪贴板');
      } catch {
        toast('复制失败，请手动选择文本');
      }
      document.body.removeChild(ta);
    }
  }

  function download(filename, text, mime) {
    const blob = new Blob([text], { type: mime || 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = el('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  /** 从 base64 还原二进制并下载（用于后台生成的 .xlsx） */
  function downloadBase64(filename, base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const a = el('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  function fileName(data, ext) {
    const safe = String(data.name || data.appid)
      .replace(/[\\/:*?"<>|]/g, '_')
      .slice(0, 50);
    return `steam-${data.appid}-${safe}.${ext}`;
  }

  /* ---------------------------------------------------------------- */
  /* 页面探测                                                          */
  /* ---------------------------------------------------------------- */

  function detailAppId() {
    if (!/^\/app\/\d+/.test(location.pathname)) return null;
    const m = location.pathname.match(/\/app\/(\d+)/);
    return m ? Number(m[1]) : null;
  }

  function readDrmTextsFromDom() {
    const texts = [];
    document.querySelectorAll('.DRM_notice').forEach((n) => {
      const t = (n.innerText || n.textContent || '').replace(/\s+/g, ' ').trim();
      if (t) texts.push(t);
    });
    return texts;
  }

  function readMySteamId() {
    const link = document.querySelector(
      '.playerAvatar a[href*="/profiles/"], #global_action_menu a[href*="/profiles/"], a[href*="steamcommunity.com/profiles/"]'
    );
    if (!link) return null;
    const m = (link.getAttribute('href') || '').match(/\/profiles\/(\d{17})/);
    return m ? m[1] : null;
  }

  /* ---------------------------------------------------------------- */
  /* 详情页面板                                                        */
  /* ---------------------------------------------------------------- */

  let panel = null;
  let lastData = null;
  let currentAppId = null;

  function buildPanel() {
    const root = el('div', 'si-panel');
    root.id = 'si-panel';

    const head = el('div', 'si-panel-head');
    head.appendChild(el('span', 'si-logo', 'Steam 洞察'));

    const actions = el('span', 'si-head-actions');
    const buttons = [
      ['copy', '复制 Markdown'],
      ['txt', 'TXT'],
      ['xlsx', 'Excel'],
      ['json', 'JSON'],
      ['settings', '设置'],
      ['refresh', '刷新'],
      ['toggle', '收起'],
    ];
    for (const [act, label] of buttons) {
      const b = el('button', 'si-btn', label);
      b.type = 'button';
      b.dataset.act = act;
      if (act === 'settings') b.title = '打开 Steam 洞察设置';
      if (act === 'toggle') b.classList.add('si-toggle');
      actions.appendChild(b);
    }
    head.appendChild(actions);
    root.appendChild(head);

    const body = el('div', 'si-panel-body');
    root.appendChild(body);
    return root;
  }

  function setPanelLoading() {
    const body = panel.querySelector('.si-panel-body');
    clear(body);
    const wrap = el('div', 'si-loading');
    wrap.appendChild(el('span', 'si-spinner'));
    wrap.appendChild(el('span', null, '正在查询 Steam / XGP / 反作弊 / 时长数据…'));
    body.appendChild(wrap);
  }

  function setPanelError(message) {
    const body = panel.querySelector('.si-panel-body');
    clear(body);
    body.appendChild(el('div', 'si-error', message));
  }

  function familyRowText(family) {
    if (!family) return { text: '未知', kind: 'unknown' };
    switch (family.groupState) {
      case 'in_family':
        return { text: '家庭库已有（他人拥有）', kind: 'ok' };
      case 'owned_by_me':
        return { text: '我已拥有', kind: 'ok' };
      case 'excluded':
        return { text: `家庭组内被排除（${family.excludeLabel || '原因未知'}）`, kind: 'warn' };
      case 'not_in_family':
        return { text: '家庭库没有', kind: 'no' };
      case 'not_logged_in':
        return { text: '未登录 Steam，无法查询家庭组', kind: 'unknown' };
      case 'not_in_any_group':
        return { text: '当前账号未加入家庭组', kind: 'unknown' };
      default:
        return { text: '未能获取家庭组信息', kind: 'unknown' };
    }
  }

  function renderDetail(data) {
    lastData = data;
    if (!panel) return;
    const body = panel.querySelector('.si-panel-body');
    clear(body);

    // 关键徽章
    const badges = el('div', 'si-badges');

    const xgpKind = data.xgp.on === true ? 'ok' : data.xgp.on === false ? 'no' : 'unknown';
    const xgpText =
      data.xgp.on === true
        ? `XGP 在库${data.xgp.match === 'approx' ? '?' : ''}`
        : data.xgp.on === false
        ? 'XGP 不在库'
        : 'XGP 未知';
    badges.appendChild(
      badge(xgpKind, xgpText, data.xgp.matchedTitle ? `匹配：${data.xgp.matchedTitle}` : null)
    );

    const denuvoKind = data.denuvo.has === true ? 'bad' : data.denuvo.has === false ? 'ok' : 'unknown';
    badges.appendChild(
      badge(
        denuvoKind,
        data.denuvo.has === true ? 'D 加密' : data.denuvo.has === false ? '无 D 加密' : 'D 加密未知',
        data.denuvo.drmList && data.denuvo.drmList.length ? `第三方 DRM：${data.denuvo.drmList.join('、')}` : null
      )
    );

    badges.appendChild(
      badge(
        data.familySharing ? 'ok' : 'no',
        data.familySharing ? '支持家庭共享' : '不支持家庭共享',
        '来自 Steam 商店页 category 62'
      )
    );

    badges.appendChild(badge(data.dlc.count ? 'neutral' : 'unknown', `DLC ${data.dlc.count}`));
    if (data.anticheat && data.anticheat.kernel) {
      badges.appendChild(badge('warn', '内核级反作弊', data.anticheat.anticheats.join('、')));
    }
    body.appendChild(badges);

    // 明细行
    const list = el('div', 'si-rows');
    const addRow = (label, value, kind) => {
      const row = el('div', 'si-row');
      row.appendChild(el('span', 'si-row-label', label));
      const val = el('span', `si-row-value${kind ? ' si-v-' + kind : ''}`, value);
      row.appendChild(val);
      list.appendChild(row);
      return val;
    };

    const fam = familyRowText(data.family);
    addRow('家庭库（我的家庭组）', fam.text, fam.kind);

    if (data.denuvo.has === null) {
      const reason =
        data.denuvo.source === 'age_gated'
          ? '商店页需要先通过年龄验证，读不到 DRM 声明'
          : '未能从商店页读取到 DRM 信息';
      addRow('D 加密（Denuvo）', reason, 'unknown');
    }

    if (data.deck) {
      const deckKind =
        data.deck.category === 3 ? 'ok' : data.deck.category === 2 ? 'warn' : data.deck.category === 1 ? 'no' : 'unknown';
      addRow('Steam Deck', data.deck.label, deckKind);
    }
    if (data.proton) {
      addRow(
        'ProtonDB',
        `${data.proton.tierLabel}（趋势 ${data.proton.trendingLabel}，${data.proton.total ?? '?'} 份报告）`
      );
    }
    if (data.anticheat) {
      addRow(
        '反作弊',
        `${data.anticheat.anticheats.join('、') || '无记录'} · ${data.anticheat.statusLabel}${
          data.anticheat.kernel ? ' · ⚠️ 内核级' : ''
        }`,
        data.anticheat.status === 'Supported' ? 'ok' : data.anticheat.status === 'Broken' ? 'no' : 'unknown'
      );
    } else if (data.anticheat === null) {
      addRow('反作弊', '该游戏无记录（不代表没有反作弊）', 'unknown');
    }
    if (data.launcher) {
      const parts = [];
      if (data.launcher.launchers.length) parts.push(data.launcher.launchers.join('、'));
      if (data.launcher.eula) parts.push('需同意第三方协议');
      addRow('第三方启动器/协议', parts.length ? parts.join('；') : '无', parts.length ? 'warn' : 'ok');
    }
    if (data.languages) {
      addRow(
        '中文支持',
        `界面/字幕 ${data.languages.hasSimplifiedChinese ? '✅' : '❌'} · 语音 ${
          data.languages.hasChineseAudio ? '✅' : '❌'
        }（共 ${data.languages.languages.length} 种语言）`,
        data.languages.hasSimplifiedChinese ? 'ok' : 'no'
      );
    }
    addRow(
      '国区购买',
      data.regionAvailability.cnAvailable
        ? `可购买 ${data.meta.isFree ? '（免费）' : data.meta.price ? data.meta.price.finalFormatted : ''}`
        : '不可购买/未上架',
      data.regionAvailability.cnAvailable ? 'ok' : 'no'
    );
    if (data.hltb) {
      const h = data.hltb;
      const fmt = (v) => (v ? `${Math.round((v / 3600) * 10) / 10} 小时` : '—');
      addRow(
        '通关时长',
        `主线 ${fmt(h.main)} / 主线+支线 ${fmt(h.mainExtra)} / 全收集 ${fmt(h.completionist)}`,
        h.match === 'steam-id' ? 'ok' : 'unknown'
      );
      if (h.match !== 'steam-id') {
        addRow(
          '时长匹配',
          h.match === 'approx' ? '按名称近似匹配，可能不是同一个版本' : '按名称匹配，未用 Steam AppID 核对',
          'unknown'
        );
      }
    } else if (data.hltb === null || data.hltb === undefined) {
      // 显式说明为什么没有这一行，避免用户以为是插件坏了
      addRow('通关时长', '未取到（HowLongToBeat 无数据或被限流，10 分钟后自动重试）', 'unknown');
    }
    if (data.meta && data.meta.releaseDate && data.meta.releaseDate.date) {
      addRow('发行日期', data.meta.releaseDate.date);
    }
    body.appendChild(list);

    // 多区价格
    if (data.regionPrices && data.regionPrices.length > 1) {
      const priceBox = el('div', 'si-prices');
      priceBox.appendChild(el('div', 'si-sub-title', '多区价格'));
      const grid = el('div', 'si-price-grid');
      for (const r of data.regionPrices) {
        const cell = el('div', 'si-price-cell');
        cell.appendChild(el('span', 'si-price-region', r.label));
        cell.appendChild(el('span', 'si-price-value', r.text));
        grid.appendChild(cell);
      }
      priceBox.appendChild(grid);
      body.appendChild(priceBox);
    }

    // DLC 明细
    if (data.dlc.items && data.dlc.items.length) {
      const details = el('details', 'si-dlc');
      const summary = el('summary', null, `DLC 明细（${data.dlc.count} 个${data.dlc.truncated ? '，仅显示前 60' : ''}）`);
      details.appendChild(summary);
      const ul = el('div', 'si-dlc-list');
      for (const d of data.dlc.items) {
        const line = el('div', 'si-dlc-item');
        line.appendChild(el('span', 'si-dlc-name', d.name || `App ${d.appid}`));
        line.appendChild(el('span', 'si-dlc-price', d.priceText || '—'));
        ul.appendChild(line);
      }
      details.appendChild(ul);
      body.appendChild(details);
    }

    const foot = el('div', 'si-foot');
    foot.appendChild(el('span', null, `更新于 ${new Date(data.generatedAt).toLocaleTimeString('zh-CN')}`));
    if (data.xgp.indexSize) foot.appendChild(el('span', null, ` · XGP 库 ${data.xgp.indexSize} 款`));
    body.appendChild(foot);

    // 折叠状态
    if (window.__siPanelCollapsed) panel.classList.add('si-collapsed');
  }

  async function loadDetail(appid, force) {
    if (force) await send({ type: 'cache:clearApp', appid });
    const res = await send({
      type: 'app:data',
      appid,
      drmTexts: readDrmTextsFromDom(),
      mySteamId: readMySteamId(),
    });
    if (!panel) return;
    if (!res || res.error) {
      setPanelError(`获取失败：${res && res.error ? res.error : '未知错误'}`);
      return;
    }
    if (res.missing) {
      setPanelError('Steam 未返回该游戏的详情数据（可能已下架或区域不可见）');
      return;
    }
    renderDetail(res);
  }

  async function mountDetail(appid) {
    currentAppId = appid;
    const anchor = document.querySelector(DETAIL_SELECTOR) || document.querySelector(DETAIL_FALLBACK);
    if (!anchor) {
      setTimeout(() => mountDetail(appid), 700);
      return;
    }
    if (panel && panel.parentElement === anchor) return;
    panel = buildPanel();
    anchor.insertBefore(panel, anchor.firstChild);
    setPanelLoading();
    await loadDetail(appid, false);
  }

  function bindPanelEvents() {
    document.addEventListener('click', async (event) => {
      const btn = event.target.closest && event.target.closest('#si-panel .si-btn');
      if (!btn) return;
      event.preventDefault();
      const act = btn.dataset.act;
      if (act === 'copy') {
        if (!lastData) return;
        const res = await send({ type: 'export:markdown', data: lastData });
        if (res && res.text) await copyText(res.text, '已复制 Markdown 到剪贴板');
        else toast('复制失败');
      } else if (act === 'txt') {
        if (!lastData) return;
        const res = await send({ type: 'export:text', data: lastData });
        if (res && res.text) {
          download(fileName(lastData, 'txt'), res.text, 'text/plain;charset=utf-8');
          toast('已导出 TXT');
        } else toast('导出失败');
      } else if (act === 'xlsx') {
        if (!lastData) return;
        btn.disabled = true;
        toast('正在生成 Excel…');
        const res = await send({ type: 'export:xlsx', data: lastData });
        btn.disabled = false;
        if (res && res.base64) {
          downloadBase64(fileName(lastData, 'xlsx'), res.base64);
          toast('已导出 Excel');
        } else toast(`导出失败${res && res.error ? '：' + res.error : ''}`);
      } else if (act === 'json') {
        if (!lastData) return;
        const res = await send({ type: 'export:json', data: lastData });
        if (res && res.text) {
          download(fileName(lastData, 'json'), res.text, 'application/json;charset=utf-8');
          toast('已导出 JSON');
        } else toast('导出失败');
      } else if (act === 'settings') {
        // 内容脚本不能直接调 openOptionsPage()，必须让后台代开
        const res = await send({ type: 'options:open' });
        if (res && res.ok) toast('已打开设置页');
        else toast(`打开设置失败${res && res.error ? '：' + res.error : ''}`);
      } else if (act === 'refresh') {
        if (!currentAppId) return;
        setPanelLoading();
        await loadDetail(currentAppId, true);
        toast('已刷新');
      } else if (act === 'toggle') {
        panel.classList.toggle('si-collapsed');
        window.__siPanelCollapsed = panel.classList.contains('si-collapsed');
        btn.textContent = panel.classList.contains('si-collapsed') ? '展开' : '收起';
      }
    });
  }

  /* ---------------------------------------------------------------- */
  /* 列表页徽章                                                        */
  /* ---------------------------------------------------------------- */

  const pendingBasic = new Set();
  const pendingDeep = new Set();
  const loadedBasic = new Set();
  const loadedDeep = new Set();
  /** appid → 已拿到的数据（列表页重渲染时直接复用，不重复请求） */
  const listCache = new Map();
  let listFlushTimer = null;
  let listDeepEnabled = true;

  function collectRows() {
    const map = new Map();
    const add = (node, id) => {
      if (!id || Number.isNaN(id)) return;
      if (!map.has(id)) map.set(id, node);
    };
    document.querySelectorAll('a.search_result_row[data-ds-appid]').forEach((n) => add(n, Number(n.dataset.dsAppid)));
    document.querySelectorAll('.wishlist_row[data-app-id]').forEach((n) => add(n, Number(n.dataset.appId)));
    document.querySelectorAll('[data-ds-appid]').forEach((n) => add(n, Number(n.dataset.dsAppid)));
    document.querySelectorAll('[data-app-id]').forEach((n) => add(n, Number(n.getAttribute('data-app-id'))));
    return map;
  }

  function badgeHostFor(rowNode, appid) {
    let host = rowNode.querySelector(`.si-row-badges[data-si-appid="${appid}"]`);
    if (host) return host;
    host = el('div', 'si-row-badges');
    host.dataset.siAppid = String(appid);
    host.appendChild(el('span', 'si-badge si-unknown', '…'));
    const target =
      rowNode.querySelector('.responsive_search_name_combined') ||
      rowNode.querySelector('.wishlist_row_content') ||
      rowNode.querySelector('.title') ||
      rowNode;
    target.appendChild(host);
    return host;
  }

  function renderRowBadges(host, row) {
    clear(host);
    if (!row) {
      host.appendChild(badge('unknown', '无数据'));
      return;
    }
    if (row.xgp === true) host.appendChild(badge('ok', 'XGP', `Game Pass 在库${row.xgpMatch === 'approx' ? '（疑似）' : ''}`));
    else if (row.xgp === false) host.appendChild(badge('muted', '无XGP'));

    if (row.denuvo === true) host.appendChild(badge('bad', 'D加密', (row.drmList || []).join('、')));
    else if (row.denuvo === false) host.appendChild(badge('muted', '无D加密'));

    if (row.familyState === 'in_family') host.appendChild(badge('ok', '家庭库已有'));
    else if (row.familyState === 'excluded') host.appendChild(badge('warn', '家庭组排除'));

    if (row.familySharing === false) host.appendChild(badge('muted', '不可共享'));

    if (row.dlcCount) host.appendChild(badge('neutral', `DLC ${row.dlcCount}`));

    if (row.anticheat && row.anticheat.kernel) {
      host.appendChild(badge('warn', '内核反作弊', row.anticheat.anticheats.join('、')));
    }

    if (row.deck) {
      const kind = row.deck.category === 3 ? 'ok' : row.deck.category === 2 ? 'warn' : 'no';
      host.appendChild(badge(kind, `Deck ${row.deck.label}`, 'Steam Deck 兼容性'));
    }
  }

  function scheduleListFlush() {
    clearTimeout(listFlushTimer);
    listFlushTimer = setTimeout(flushListQueue, 400);
  }

  async function flushListQueue() {
    const basicIds = [...pendingBasic].slice(0, 60);
    const deepIds = [...pendingDeep].slice(0, 40);
    pendingBasic.clear();
    pendingDeep.clear();
    if (basicIds.length) {
      const res = await send({ type: 'list:data', appids: basicIds, deep: false });
      if (res && !res.error) applyListResult(res, false);
    }
    if (deepIds.length && listDeepEnabled) {
      const res = await send({ type: 'list:data', appids: deepIds, deep: true });
      if (res && !res.error) applyListResult(res, true);
    }
  }

  function applyListResult(res, deep) {
    for (const key of Object.keys(res || {})) {
      const appid = Number(key);
      const data = res[key];
      if (!appid || !data) continue;
      const merged = deep ? { ...(listCache.get(appid) || {}), ...data } : { ...data };
      listCache.set(appid, merged);
      if (deep) loadedDeep.add(appid);
      else loadedBasic.add(appid);
    }
    // 刷新当前可见行的徽章
    const rows = collectRows();
    for (const [appid, node] of rows) {
      const cached = listCache.get(appid);
      if (cached) renderRowBadges(badgeHostFor(node, appid), cached);
    }
  }

  function observeRows() {
    if (!('IntersectionObserver' in window)) {
      const rows = collectRows();
      rows.forEach((node, id) => {
        pendingBasic.add(id);
        pendingDeep.add(id);
      });
      scheduleListFlush();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const node = entry.target;
          const appid = Number(node.dataset.dsAppid || node.dataset.appId || node.getAttribute('data-app-id'));
          observer.unobserve(node);
          if (!appid) continue;
          // 已有数据就直接渲染（Steam 重新渲染行时不会再发请求）
          const cached = listCache.get(appid);
          if (cached) renderRowBadges(badgeHostFor(node, appid), cached);
          if (!loadedBasic.has(appid)) pendingBasic.add(appid);
          if (listDeepEnabled && !loadedDeep.has(appid)) pendingDeep.add(appid);
        }
        scheduleListFlush();
      },
      { rootMargin: '300px 0px' }
    );

    const rows = collectRows();
    for (const [appid, node] of rows) {
      if (node.__siObserved) continue;
      node.__siObserved = true;
      const host = badgeHostFor(node, appid);
      const cached = listCache.get(appid);
      if (cached) renderRowBadges(host, cached);
      observer.observe(node);
    }
  }

  let listScanTimer = null;

  function startListMode() {
    observeRows();
    const mo = new MutationObserver(() => {
      clearTimeout(listScanTimer);
      listScanTimer = setTimeout(observeRows, 500);
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  /* ---------------------------------------------------------------- */
  /* 启动                                                              */
  /* ---------------------------------------------------------------- */

  async function main() {
    const settings = await send({ type: 'settings:get' });
    if (!settings || settings.error) return;
    if (settings.enabled === false) return;
    listDeepEnabled = settings.listDenuvoLookup !== false;

    const appid = detailAppId();
    if (appid) {
      if (settings.showOnDetailPage === false) return;
      bindPanelEvents();
      await mountDetail(appid);
    } else if (settings.showOnListPages !== false) {
      startListMode();
    }
  }

  main();
})();
