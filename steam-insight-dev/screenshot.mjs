/**
 * 截图：真实加载扩展 + 打开 Steam 游戏页 + 等面板渲染完 + 截 1280×800
 * 既作为修复的可视化验证，也可直接当商店截图素材。
 *
 *   node screenshot.mjs [appid]
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

const PROXY = process.env.SI_PROXY || 'http://127.0.0.1:7897';
const PORT = 9251;
const APPID = process.argv[2] || '1245620';
const STAGE = path.join(process.env.TEMP || '.', 'si-shot-stage');
const PROFILE = path.join(process.env.TEMP || '.', 'si-shot-profile');

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
  `--proxy-server=${PROXY}`,
  '--no-first-run', '--no-default-browser-check', '--disable-sync',
  '--window-size=1280,800',
  'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 一次连接里顺序执行多条 CDP 命令 */
function cdpSession(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let nextId = 1;
  const pending = new Map();
  const ready = new Promise((res, rej) => {
    ws.onopen = () => res();
    ws.onerror = () => rej(new Error('WS 错误'));
  });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      if (m.error) reject(new Error(JSON.stringify(m.error)));
      else resolve(m.result);
    }
  };
  return {
    ready,
    send(method, params = {}) {
      const id = nextId++;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        ws.send(JSON.stringify({ id, method, params }));
        setTimeout(() => {
          if (pending.has(id)) { pending.delete(id); reject(new Error(`${method} 超时`)); }
        }, 60000);
      });
    },
    close() { try { ws.close(); } catch {} },
  };
}

let exitCode = 0;
try {
  // 等 CDP 端口就绪（浏览器启动需要时间，早发请求会 ECONNREFUSED）
  let cdpReady = false;
  for (let i = 0; i < 80; i++) {
    try {
      await fetch(`http://127.0.0.1:${PORT}/json/version`);
      cdpReady = true;
      break;
    } catch {
      await sleep(500);
    }
  }
  if (!cdpReady) throw new Error('CDP 端口未就绪');

  // 找到扩展 SW
  let sw = null;
  for (let i = 0; i < 40; i++) {
    await sleep(700);
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      sw = targets.find((t) => t.type === 'service_worker' && t.url.includes('/src/background.js'));
      if (sw) break;
    } catch {}
  }
  console.log(sw ? '✅ 扩展已加载' : '⚠️ 未检测到扩展 SW（面板可能不出现）');

  // 新开标签页访问 Steam 游戏页
  const url = `https://store.steampowered.com/app/${APPID}/?cc=cn&l=schinese`;
  const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(url)}`, { method: 'PUT' })).json();
  console.log('打开:', url);

  const s = cdpSession(tab.webSocketDebuggerUrl);
  await s.ready;
  await s.send('Page.enable');
  await s.send('Runtime.enable');
  // 让该标签页成为前台标签：布局正常后 innerText/滚动/截图行为才符合预期
  try {
    await s.send('Page.bringToFront');
  } catch {}

  // 固定成商店要求的 1280×800
  await s.send('Emulation.setDeviceMetricsOverride', {
    width: 1280, height: 800, deviceScaleFactor: 1, mobile: false,
  });

  // 等页面 load
  await sleep(6000);

  // 等面板出现并渲染出「通关时长」
  // 注意：用 textContent 而不是 innerText —— 后台标签页没有布局，
  // innerText 会返回空串，导致误判成「面板没内容」。
  let state = { hasPanel: false, hasHltb: false, text: '', href: '' };
  for (let i = 0; i < 40; i++) {
    const r = await s.send('Runtime.evaluate', {
      expression: `(() => {
        const p = document.getElementById('si-panel');
        const href = location.href;
        if (!p) return { hasPanel: false, hasHltb: false, text: '', href };
        const t = p.textContent || '';
        return { hasPanel: true, hasHltb: t.includes('通关时长'), text: t.slice(0, 700), href };
      })()`,
      returnByValue: true,
    });
    state = r.result.value;
    if (state.hasPanel && state.hasHltb) break;
    // 还在转圈或没出现就再等等
    await sleep(2500);
  }

  if (!state.hasPanel && String(state.href).includes('/agecheck/')) {
    console.log('\n⚠️ 该游戏被 Steam 年龄门槛拦截（跳到了 /agecheck/）。');
    console.log('   内容脚本只匹配 /app/*，所以不会注入 —— 这是预期行为，不是 bug。');
    console.log('   请换一个无年龄门槛的游戏重试（例如 413150 星露谷物语）。');
  }

  console.log('\n面板状态: 存在=' + state.hasPanel + ' 含通关时长=' + state.hasHltb);
  console.log('当前 URL:', state.href);

  // 面板没出来就不要截图：否则会存下一张「年龄验证页 / 加载失败页」，
  // 若被当成商店素材提交，属于用无关内容冒充产品截图。
  if (!state.hasPanel) {
    console.log('\n❌ 面板未渲染，已跳过截图（不保存无效图片）。');
    if (String(state.href).includes('/agecheck/')) {
      console.log('   原因：年龄门槛重定向。请换一个无年龄门槛的游戏。');
    } else if (String(state.href).startsWith('chrome-error://')) {
      console.log('   原因：页面根本没加载成功（多半是代理抖动）。稍后重试即可。');
    } else {
      console.log('   原因：面板未注入，检查扩展是否被禁用或页面结构是否变化。');
    }
    s.close();
    throw new Error('面板未渲染，未生成截图');
  }

  if (state.text) console.log('面板内容预览:\n' + state.text.split('\n').slice(0, 26).map((l) => '    ' + l).join('\n'));

  // 先滚动到面板位置，让它进入视口
  await s.send('Runtime.evaluate', {
    expression: `(() => { const p = document.getElementById('si-panel'); if (p) p.scrollIntoView({block:'start'}); return true; })()`,
    returnByValue: true,
  });
  await sleep(1200);

  const shot = await s.send('Page.captureScreenshot', { format: 'png' });
  const file = path.join(OUT, `detail-${APPID}.png`);
  fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));
  console.log(`\n已保存截图: ${file}  (${(fs.statSync(file).size / 1024).toFixed(0)} KB)`);

  if (!state.hasHltb) {
    console.log('⚠️ 截图里没等到「通关时长」，请查看面板预览确认原因');
    exitCode = 1;
  } else {
    console.log('✅ 面板已渲染出「通关时长」');
  }
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
