// 弹出面板逻辑

const msgBox = document.getElementById('msg');

function send(msg) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(msg, (res) => {
      if (chrome.runtime.lastError) resolve({ error: chrome.runtime.lastError.message });
      else resolve(res);
    });
  });
}

async function currentTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs && tabs[0] ? tabs[0] : null;
}

(async function init() {
  const settings = await send({ type: 'settings:get' });
  document.getElementById('enabled').textContent = settings?.enabled === false ? '已关闭' : '已启用';
  document.getElementById('deep').textContent = settings?.listDenuvoLookup === false ? '关闭' : '开启';

  const tab = await currentTab();
  const url = tab?.url || '';
  let type = '非 Steam 页面';
  if (/store\.steampowered\.com\/app\/\d+/.test(url)) type = '游戏详情页';
  else if (/store\.steampowered\.com\/(search|wishlist|sale|explore|tags|dlc|bundle)/.test(url)) type = '列表页';
  else if (/store\.steampowered\.com/.test(url)) type = 'Steam 商店其他页面';
  document.getElementById('pageType').textContent = type;

  document.getElementById('reload').addEventListener('click', async () => {
    const t = await currentTab();
    if (!t || !t.id) return;
    try {
      await chrome.tabs.reload(t.id);
      msgBox.textContent = '已刷新页面。';
    } catch (e) {
      msgBox.textContent = `刷新失败：${e.message}`;
    }
  });

  document.getElementById('clear').addEventListener('click', async () => {
    const res = await send({ type: 'cache:clear' });
    msgBox.textContent = res && !res.error ? `已清空 ${res.cleared} 条缓存。` : `失败：${res?.error}`;
  });

  document.getElementById('options').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
})();
