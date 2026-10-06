/**
 * 验证「设置」按钮：真实加载扩展 → 打开 Steam 页面 → 点按钮 → 确认设置页被打开
 * 顺带截一张带新按钮的面板图。
 *
 * 相比上一版：加了「等 CDP 端口就绪」和「等页面真正离开 agecheck」的健壮等待，
 * 避免浏览器还没起来就发请求。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJ = path.join(HERE, '..');
const EXT = path.join(PROJ, 'steam-insight');
const OUT = path.join(PROJ, 'store-assets', 'screenshots');

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
].find((p) => fs.existsSync(p));

const PORT = Number(process.env.SI_CDP_PORT || 9271);
const APPID = process.argv[2] || '2358720';
const STAGE = path.join(process.env.TEMP || '.', 'si-set-stage');
const PROFILE = path.join(process.env.TEMP || '.', 'si-set-profile');

fs.mkdirSync(OUT, { recursive: true });
fs.rmSync(STAGE, { recursive: true, force: true });
fs.rmSync(PROFILE, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });
fs.copyFileSync(path.join(EXT, 'manifest.json'), path.join(STAGE, 'manifest.json'));
for (const d of ['src', 'icons']) fs.cpSync(path.join(EXT, d), path.join(STAGE, d), { recursive: true });

const child = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${PROFILE}`,
  `--load-extension=${STAGE}`,
  '--proxy-server=http://127.0.0.1:7897',
  '--no-first-run', '--no-default-browser-check', '--disable-sync',
  '--window-size=1280,800',
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function targets() {
  const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  return r.json();
}

/** 等 CDP 端口可用 */
async function waitForCdp(maxMs = 40000) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    try {
      await fetch(`http://127.0.0.1:${PORT}/json/version`);
      return true;
    } catch {
      await sleep(500);
    }
  }
  return false;
}

function sess(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 1;
  const pending = new Map();
  const ready = new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws')); });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    }
  };
  return {
    ready,
    send(method, params = {}) {
      const n = id++;
      return new Promise((res, rej) => {
        pending.set(n, { resolve: res, reject: rej });
        ws.send(JSON.stringify({ id: n, method, params }));
        setTimeout(() => { if (pending.has(n)) { pending.delete(n); rej(new Error(method + ' 超时')); } }, 60000);
      });
    },
    close() { try { ws.close(); } catch {} },
  };
}

let exitCode = 0;
try {
  if (!(await waitForCdp())) throw new Error('CDP 端口未就绪');
  console.log('CDP 已就绪');

  let extId = null;
  for (let i = 0; i < 40; i++) {
    try {
      const t = await targets();
      const sw = t.find((x) => x.type === 'service_worker' && x.url.includes('/src/background.js'));
      if (sw) { extId = new URL(sw.url).host; break; }
    } catch {}
    await sleep(700);
  }
  console.log('扩展 ID:', extId || '未找到');
  if (!extId) throw new Error('扩展未加载');

  const url = `https://store.steampowered.com/app/${APPID}/?cc=cn&l=schinese`;
  const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
  const s = sess(tab.webSocketDebuggerUrl);
  await s.ready;
  await s.send('Page.enable');
  await s.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });

  // 等面板出现；同时报告当前 URL，便于区分「年龄门槛」等情况
  let has = false;
  let href = '';
  for (let i = 0; i < 30; i++) {
    await sleep(2500);
    const r = await s.send('Runtime.evaluate', {
      expression: `({ has: !!document.getElementById('si-panel'), href: location.href, injected: !!window.__steamInsightLoaded })`,
      returnByValue: true,
    });
    ({ has, href } = r.result.value);
    if (has) break;
  }
  console.log('面板出现:', has, ' 当前 URL:', href);
  if (!has) {
    if (href.includes('/agecheck/')) {
      console.log('→ 该游戏被 Steam 年龄门槛拦截，内容脚本不匹配 /agecheck/，属预期。换一个无年龄门槛的游戏。');
    }
    throw new Error('面板未出现，无法测试按钮');
  }

  const btnInfo = await s.send('Runtime.evaluate', {
    expression: `(() => {
      const b = document.querySelector('#si-panel .si-btn[data-act="settings"]');
      if (!b) return { found: false };
      return { found: true, label: b.textContent, order: [...document.querySelectorAll('#si-panel .si-btn')].map(x => x.dataset.act) };
    })()`,
    returnByValue: true,
  });
  console.log('设置按钮:', JSON.stringify(btnInfo.result.value));

  const before = (await targets()).filter((t) => t.url.includes('options.html')).length;
  await s.send('Runtime.evaluate', {
    expression: `(() => { const b = document.querySelector('#si-panel .si-btn[data-act="settings"]'); if (b) b.click(); return true; })()`,
    returnByValue: true,
  });
  console.log('已点击按钮');

  let opened = null;
  for (let i = 0; i < 20; i++) {
    await sleep(800);
    const t = await targets();
    const opt = t.find((x) => x.url.includes('options.html') && x.url.includes(extId));
    if (opt) { opened = opt; break; }
  }
  const after = (await targets()).filter((t) => t.url.includes('options.html')).length;

  console.log('\n判定:');
  const ok = (l, c, extra) => { console.log(`  ${c ? '✅' : '❌'} ${l}${extra !== undefined ? '  ' + extra : ''}`); if (!c) exitCode = 1; };
  ok('按钮存在且文案为「设置」', btnInfo.result.value.found && btnInfo.result.value.label === '设置', btnInfo.result.value.label);
  ok('按钮紧挨在「刷新」之前', JSON.stringify(btnInfo.result.value.order).includes('"settings","refresh"'), JSON.stringify(btnInfo.result.value.order));
  ok('点击后打开了设置页', after > before && !!opened, opened ? '' : `before=${before} after=${after}`);
  ok('打开的是本扩展的设置页', !!opened && opened.url.includes(`chrome-extension://${extId}/src/options.html`), opened?.url);

  await s.send('Runtime.evaluate', {
    expression: `(() => { const p = document.getElementById('si-panel'); if (p) p.scrollIntoView({block:'start'}); return true; })()`,
    returnByValue: true,
  });
  await sleep(1000);
  const shot = await s.send('Page.captureScreenshot', { format: 'png' });
  const file = path.join(OUT, `panel-toolbar-${APPID}.png`);
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
  console.log(`\n截图: ${file}`);
  s.close();
} catch (err) {
  console.log('出错:', err.message);
  exitCode = 1;
} finally {
  try { child.kill(); } catch {}
  await sleep(1500);
  try { spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {}
}
process.exitCode = exitCode;
