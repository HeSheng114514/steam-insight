// 面板数据 → Markdown / JSON 导出

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

export function exportFilename(data, ext) {
  const safe = String(data.name || data.appid)
    .replace(/[\\/:*?"<>|]/g, '_')
    .slice(0, 60);
  return `steam-${data.appid}-${safe}.${ext}`;
}
