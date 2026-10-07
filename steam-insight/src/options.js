// 设置页逻辑

const REGION_PRESETS = [
  { cc: 'cn', label: '国区' },
  { cc: 'us', label: '美区' },
  { cc: 'ar', label: '阿根廷' },
  { cc: 'tr', label: '土耳其' },
  { cc: 'ru', label: '俄区' },
  { cc: 'in', label: '印度' },
  { cc: 'br', label: '巴西' },
  { cc: 'hk', label: '港区' },
  { cc: 'jp', label: '日区' },
  { cc: 'gb', label: '英区' },
  { cc: 'de', label: '德区' },
];

const CHECKBOXES = [
  'enabled',
  'showOnDetailPage',
  'showOnListPages',
  'listDenuvoLookup',
  'fetchXgp',
  'fetchProton',
  'fetchAnticheat',
  'fetchHltb',
  'fetchFamilyGroup',
];

const statusBox = document.getElementById('status');

function send(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (res) => {
      if (chrome.runtime.lastError) resolve({ error: chrome.runtime.lastError.message });
      else resolve(res);
    });
  });
}

function setStatus(text) {
  statusBox.textContent = typeof text === 'string' ? text : JSON.stringify(text, null, 2);
}

function readForm() {
  const patch = {};
  for (const id of CHECKBOXES) patch[id] = document.getElementById(id).checked;
  patch.storeLanguage = document.getElementById('storeLanguage').value;
  patch.regions = [...document.querySelectorAll('#regions input:checked')].map((i) => i.value);
  if (!patch.regions.length) patch.regions = ['cn'];
  return patch;
}

function fillForm(settings) {
  for (const id of CHECKBOXES) {
    document.getElementById(id).checked = settings[id] !== false;
  }
  document.getElementById('storeLanguage').value = settings.storeLanguage || 'schinese';

  const box = document.getElementById('regions');
  box.textContent = '';
  const active = new Set(settings.regions || ['cn']);
  for (const r of REGION_PRESETS) {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = r.cc;
    input.checked = active.has(r.cc);
    label.appendChild(input);
    label.appendChild(document.createTextNode(`${r.label} (${r.cc})`));
    box.appendChild(label);
  }
}

document.getElementById('btnSave').addEventListener('click', async () => {
  const saved = await send({ type: 'settings:set', patch: readForm() });
  setStatus(saved && !saved.error ? '设置已保存。' : `保存失败：${saved?.error || '未知错误'}`);
});

document.getElementById('btnClear').addEventListener('click', async () => {
  const res = await send({ type: 'cache:clear' });
  setStatus(res && !res.error ? `已清空 ${res.cleared} 条缓存。` : `失败：${res?.error}`);
});

document.getElementById('btnStats').addEventListener('click', async () => {
  const res = await send({ type: 'cache:stats' });
  if (!res || res.error) return setStatus(`失败：${res?.error || '未知错误'}`);
  setStatus(`缓存条目：${res.entries}\n占用空间：${(res.bytes / 1024).toFixed(1)} KB`);
});

document.getElementById('btnStatus').addEventListener('click', async () => {
  setStatus('正在检查（首次会拉取 XGP 与反作弊索引，可能要 10-30 秒）…');
  const res = await send({ type: 'sources:status' });
  if (!res || res.error) return setStatus(`检查失败：${res?.error || '未知错误'}`);
  const lines = [
    `Steam appdetails：${res.steamAppDetails ? '✅ 可用' : '❌ 失败'}`,
    `Steam Deck 兼容性：${res.steamDeck ? '✅ 可用' : '❌ 失败'}`,
    `AreWeAntiCheatYet：${res.awacy.ok ? `✅ ${res.awacy.entries} 条` : '❌ 拉取失败'}`,
    `Xbox Game Pass 索引：${res.xgp.ok ? `✅ ${res.xgp.entries} 款` : '❌ 拉取失败'}`,
    `ProtonDB：${res.proton ? '✅ 可用' : '❌ 失败'}`,
    `HowLongToBeat：${
      res.hltb
        ? res.hltbVerified
          ? '✅ 可用（已用 Steam AppID 核对）'
          : '✅ 可用（名称匹配）'
        : `❌ 失败（原因代码：${res.hltbReason || '未知'}）`
    }`,
    `Referer 注入规则：${
      res.hltbRule && res.hltbRule.available
        ? res.hltbRule.staticEnabled
          ? '✅ 静态规则已启用'
          : res.hltbRule.dynamicCount > 0
          ? '✅ 已通过动态规则注册'
          : '❌ 未生效（HLTB 会失败）'
        : '❌ declarativeNetRequest 不可用（该浏览器可能不支持）'
    }`,
    `家庭组：${
      {
        ok: '✅ 已获取共享库',
        not_logged_in: '— 未登录 Steam',
        not_in_any_group: '— 当前账号未加入家庭组',
        unknown: '— 暂时无法获取',
      }[res.family] || res.family
    }`,
  ];
  setStatus(lines.join('\n'));
});

(async function init() {
  const settings = await send({ type: 'settings:get' });
  if (!settings || settings.error) {
    setStatus(`读取设置失败：${settings?.error || '未知错误'}`);
    return;
  }
  fillForm(settings);
})();
