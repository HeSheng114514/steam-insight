// 面板数据 → Markdown / JSON / 纯文本 / Excel 导出

/** 顶部固定的一格宽度（纯文本对齐用） */

const FAMILY_STATE_TEXT = {
  in_family: '✅ 家庭库已有（他人拥有，可共享）',
  owned_by_me: '✅ 我自己拥有',
  excluded: '⚠️ 家庭组内被排除',
  not_in_family: '❌ 家庭库没有',
  not_logged_in: '— 未登录 Steam，无法查询家庭组',
  not_in_any_group: '— 当前账号未加入任何家庭组',
  unknown: '— 家庭组信息未知',
};

const XGP_TEXT = {
  true: '✅ 在库',
  false: '❌ 不在库',
  unknown: '— 未查到',
};

const DENUVO_TEXT = {
  true: '🔒 有 Denuvo（D 加密）',
  false: '✅ 无 Denuvo',
  unknown: '— 未知',
};

function yn(v) {
  if (v === true) return '是';
  if (v === false) return '否';
  return '未知';
}

function priceLine(price) {
  if (!price) return null;
  if (price.discountPercent > 0) {
    return `${price.finalFormatted}（原价 ${price.initialFormatted}，-${price.discountPercent}%）`;
  }
  return price.finalFormatted;
}

/** 生成 Markdown 文本，用于一键复制 */
export function toMarkdown(data, opts = {}) {
  const { includeRaw = false } = opts;
  const lines = [];
  const title = data.name ? `${data.name}（App ${data.appid}）` : `App ${data.appid}`;
  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`> 链接：https://store.steampowered.com/app/${data.appid}/`);
  lines.push('');

  // 核心四项
  lines.push('## 核心信息');
  lines.push('');
  lines.push('| 项目 | 结果 |');
  lines.push('| --- | --- |');
  if (data.family) {
    lines.push(`| 家庭库 | ${FAMILY_STATE_TEXT[data.family.groupState] || '—'} |`);
  }
  if (data.familySharing != null) {
    lines.push(`| 支持家庭共享 | ${data.familySharing ? '是' : '否'} |`);
  }
  if (data.xgp) {
    lines.push(
      `| Xbox Game Pass | ${XGP_TEXT[String(data.xgp.on)] || '—'}${
        data.xgp.on && data.xgp.tier ? `（${data.xgp.tier}）` : ''
      } |`
    );
  }
  if (data.denuvo) {
    lines.push(`| Denuvo(D 加密) | ${DENUVO_TEXT[String(data.denuvo.has)] || '—'} |`);
  }
  if (data.dlc) {
    const freeCount = data.dlc.items.filter((d) => d.isFree).length;
    lines.push(
      `| DLC | 共 ${data.dlc.count} 个${freeCount ? `（其中 ${freeCount} 个免费）` : ''} |`
    );
  }
  lines.push('');

  // 附加信息
  const extra = [];
  if (data.deck) extra.push(`| Steam Deck | ${data.deck.label} |`);
  if (data.proton) {
    extra.push(
      `| ProtonDB | ${data.proton.tierLabel}（趋势 ${data.proton.trendingLabel}，${
        data.proton.total ?? '?'
      } 份报告） |`
    );
  }
  if (data.anticheat) {
    extra.push(
      `| 反作弊 | ${data.anticheat.anticheats.join('、') || '无记录'}（${data.anticheat.statusLabel}）${
        data.anticheat.kernel ? '，⚠️ 含内核级' : ''
      } |`
    );
  }
  if (data.launcher) {
    const parts = [];
    if (data.launcher.launchers.length) parts.push(data.launcher.launchers.join('、'));
    if (data.launcher.eula) parts.push('需同意第三方协议');
    if (parts.length) extra.push(`| 第三方启动器/协议 | ${parts.join('；')} |`);
  }
  if (data.languages) {
    extra.push(
      `| 中文支持 | 界面/字幕 ${yn(data.languages.hasSimplifiedChinese)}，语音 ${yn(
        data.languages.hasChineseAudio
      )} |`
    );
  }
  if (data.regionAvailability) {
    extra.push(`| 国区可购买 | ${data.regionAvailability.cnAvailable ? '是' : '否'} |`);
  }
  if (data.hltb) {
    const h = data.hltb;
    const fmt = (v) => (v ? `${Math.round(v / 3600 * 10) / 10} 小时` : '—');
    extra.push(`| 通关时长 | 主线 ${fmt(h.main)} / 主线+支线 ${fmt(h.mainExtra)} / 全收集 ${fmt(h.completionist)} |`);
  }
  if (extra.length) {
    lines.push('## 附加信息');
    lines.push('');
    lines.push('| 项目 | 结果 |');
    lines.push('| --- | --- |');
    lines.push(...extra);
    lines.push('');
  }

  if (data.regionPrices?.length) {
    lines.push('## 多区价格');
    lines.push('');
    lines.push('| 区域 | 价格 |');
    lines.push('| --- | --- |');
    for (const r of data.regionPrices) {
      lines.push(`| ${r.label} | ${r.text} |`);
    }
    lines.push('');
  }

  if (data.dlc?.items?.length) {
    lines.push('## DLC 明细');
    lines.push('');
    lines.push('| DLC | 价格 |');
    lines.push('| --- | --- |');
    for (const d of data.dlc.items) {
      lines.push(`| ${d.name} | ${d.priceText || '—'} |`);
    }
    lines.push('');
  }

  if (includeRaw) {
    lines.push('## 原始数据');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(data, null, 2));
    lines.push('```');
  }

  lines.push('');
  lines.push(`<sub>由 Steam 洞察生成 · ${new Date().toLocaleString('zh-CN')}</sub>`);
  return lines.join('\n');
}

/** 导出为 JSON 字符串 */
export function toJson(data) {
  return JSON.stringify(
    { generatedAt: new Date().toISOString(), generator: 'Steam Insight', data },
    null,
    2
  );
}

/* ------------------------------------------------------------------ */
/* 纯文本                                                              */
/* ------------------------------------------------------------------ */

const WIDTH = 60;

function padLine(text) {
  return text;
}

/** 把数据整理成"区块 → [标签, 值] 列表"，供 txt 与 Excel 共用 */
export function toSections(data) {
  const sections = [];
  const core = [];
  const extra = [];

  if (data.family) core.push(['家庭库（我的家庭组）', FAMILY_STATE_TEXT[data.family.groupState] || '—']);
  if (data.familySharing != null) core.push(['支持家庭共享', data.familySharing ? '是' : '否']);
  if (data.xgp) {
    core.push([
      'Xbox Game Pass',
      `${XGP_TEXT[String(data.xgp.on)] || '—'}${data.xgp.on && data.xgp.tier ? `（${data.xgp.tier}）` : ''}${
        data.xgp.match === 'approx' ? '（名称近似匹配）' : ''
      }`,
    ]);
  }
  if (data.denuvo) {
    core.push(['Denuvo(D 加密)', DENUVO_TEXT[String(data.denuvo.has)] || '—']);
    if (data.denuvo.drmList && data.denuvo.drmList.length) {
      core.push(['第三方 DRM', data.denuvo.drmList.join('、')]);
    }
    if (data.denuvo.has === null && data.denuvo.source === 'age_gated') {
      core.push(['D 加密说明', '商店页需要先通过年龄验证，读不到 DRM 声明']);
    }
  }
  if (data.dlc) {
    const freeCount = data.dlc.items.filter((d) => d.isFree).length;
    core.push(['DLC', `共 ${data.dlc.count} 个${freeCount ? `（其中 ${freeCount} 个免费）` : ''}`]);
  }
  sections.push(['核心信息', core]);

  if (data.deck) extra.push(['Steam Deck', data.deck.label]);
  if (data.proton) {
    extra.push([
      'ProtonDB',
      `${data.proton.tierLabel}（趋势 ${data.proton.trendingLabel}，${data.proton.total ?? '?'} 份报告）`,
    ]);
  }
  if (data.anticheat) {
    extra.push([
      '反作弊',
      `${data.anticheat.anticheats.join('、') || '无记录'} · ${data.anticheat.statusLabel}${
        data.anticheat.kernel ? ' · 含内核级' : ''
      }`,
    ]);
  } else if (data.anticheat === null) {
    extra.push(['反作弊', '该游戏无记录（不代表没有反作弊）']);
  }
  if (data.launcher) {
    const parts = [];
    if (data.launcher.launchers.length) parts.push(data.launcher.launchers.join('、'));
    if (data.launcher.eula) parts.push('需同意第三方协议');
    extra.push(['第三方启动器/协议', parts.length ? parts.join('；') : '无']);
  }
  if (data.languages) {
    extra.push([
      '中文支持',
      `界面/字幕 ${yn(data.languages.hasSimplifiedChinese)}，语音 ${yn(data.languages.hasChineseAudio)}（共 ${
        data.languages.languages.length
      } 种语言）`,
    ]);
  }
  if (data.regionAvailability) {
    extra.push(['国区可购买', data.regionAvailability.cnAvailable ? '是' : '否']);
  }
  if (data.hltb) {
    const h = data.hltb;
    const f = (v) => (v ? `${Math.round((v / 3600) * 10) / 10} 小时` : '—');
    extra.push([
      '通关时长',
      `主线 ${f(h.main)} / 主线+支线 ${f(h.mainExtra)} / 全收集 ${f(h.completionist)}${
        h.match === 'approx' ? '（近似匹配）' : ''
      }`,
    ]);
  }
  if (data.meta?.releaseDate?.date) extra.push(['发行日期', data.meta.releaseDate.date]);
  if (data.meta?.developers?.length) extra.push(['开发商', data.meta.developers.join('、')]);
  if (data.meta?.publishers?.length) extra.push(['发行商', data.meta.publishers.join('、')]);
  sections.push(['附加信息', extra]);

  if (data.regionPrices?.length) {
    sections.push(['多区价格', data.regionPrices.map((r) => [r.label, r.text])]);
  }
  if (data.dlc?.items?.length) {
    sections.push(['DLC 明细', data.dlc.items.map((d) => [d.name || `App ${d.appid}`, d.priceText || '—'])]);
  }
  return sections;
}

/** 生成纯文本（用于导出 .txt） */
export function toText(data) {
  const lines = [];
  const rule = '='.repeat(WIDTH);
  const thin = '-'.repeat(WIDTH);

  lines.push(rule);
  lines.push(padLine(data.name ? `${data.name}（App ${data.appid}）` : `App ${data.appid}`));
  lines.push(`https://store.steampowered.com/app/${data.appid}/`);
  lines.push(rule);
  lines.push('');

  for (const [title, rows] of toSections(data)) {
    lines.push(`【${title}】`);
    lines.push(thin);
    for (const [label, value] of rows) {
      lines.push(`${label}：${value}`);
    }
    lines.push('');
  }

  lines.push(thin);
  lines.push(`由 Steam 洞察生成 · ${new Date().toLocaleString('zh-CN')}`);
  return lines.join('\r\n');
}

/** 生成二维数组（用于 Excel 工作表） */
export function toSheetRows(data) {
  const rows = [];
  const boldRows = [];

  // 表头信息：先写清楚这是哪个游戏
  rows.push(['项目', '结果']);
  boldRows.push(rows.length - 1);
  rows.push(['游戏名称', data.name || `App ${data.appid}`]);
  rows.push(['Steam AppID', data.appid]);
  rows.push(['Steam 链接', `https://store.steampowered.com/app/${data.appid}/`]);
  rows.push(['', '']);

  for (const [title, items] of toSections(data)) {
    boldRows.push(rows.length);
    rows.push([title, '']);
    for (const [label, value] of items) rows.push([label, value]);
    rows.push(['', '']);
  }

  rows.push(['导出时间', new Date().toLocaleString('zh-CN')]);
  rows.push(['生成工具', 'Steam 洞察 · Steam Insight']);

  return { rows, boldRows };
}

export function exportFilename(data, ext) {
  const safe = String(data.name || data.appid)
    .replace(/[\\/:*?"<>|]/g, '_')
    .slice(0, 60);
  return `steam-${data.appid}-${safe}.${ext}`;
}
