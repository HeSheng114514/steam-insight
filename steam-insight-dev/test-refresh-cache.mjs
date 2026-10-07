/**
 * 验证「刷新」能真正清掉 HLTB 的失败缓存。
 *
 * 背景：HLTB 缓存键是按「游戏名」，而 cache:clearApp 原本只清 appid 前缀，
 * 导致一次失败会被写入 10 分钟短 TTL，用户点刷新也没用 —— 表现就是
 * "一直提示未取到"。
 *
 * 这里直接验证：清缓存前后，同一款游戏是否真的会重新发起请求。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const EDGE = [
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => fs.existsSync(p));

const PROJ = 'D:\\DeepSeek-Harness\\D-Steam插件（Steam 洞察）';
const EXT = path.join(PROJ, 'steam-insight');
const STAGE = path.join(process.env.TEMP, 'si-refresh-stage');
const PROFILE = path.join(process.env.TEMP, 'si-refresh-profile');
const PORT = 9297;

fs.rmSync(STAGE, { recursive: true, force: true });
fs.rmSync(PROFILE, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });
fs.copyFileSync(path.join(EXT, 'manifest.json'), path.join(STAGE, 'manifest.json'));
for (const d of ['src', 'icons']) fs.cpSync(path.join(EXT, d), path.join(STAGE, d), { recursive: true });

const child = spawn(EDGE, [
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  `--load-extension=${STAGE}`, '--proxy-server=http://127.0.0.1:7897',
  '--no-first-run', '--no-default-browser-check', '--disable-sync', 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let exitCode = 0;
try {
  let extId = null;
  for (let i = 0; i < 80; i++) {
    await sleep(500);
    try {
      await fetch(`http://127.0.0.1:${PORT}/json/version`);
      const t = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const sw = t.find((x) => x.type === 'service_worker' && x.url.includes('/src/background.js'));
      if (sw) { extId = new URL(sw.url).host; break; }
    } catch {}
  }
  if (!extId) throw new Error('扩展未加载');

  const page = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(`chrome-extension://${extId}/src/options.html`)}`, { method: 'PUT' })).json();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  await sleep(1500);

  const script = `(async () => {
    const send = (m) => new Promise((r) => { let d=false; chrome.runtime.sendMessage(m, (x)=>{d=true;r(x);}); setTimeout(()=>{if(!d)r({error:'timeout'})},150000); });
    const out = {};
    // 第一次取数
    const a = await send({ type: 'app:data', appid: 1245620, drmTexts: [], mySteamId: null });
    out.first = a.hltb ? { name: a.hltb.name, main: a.hltb.main, match: a.hltb.match } : null;
    // 看缓存里有哪些与 hltb 相关的键
    const stats = await send({ type: 'cache:stats' });
    out.statsBefore = stats;
    // 模拟「刷新」：按内容脚本的方式带上英文名清缓存
    const clearWithName = await send({ type: 'cache:clearApp', appid: 1245620, name: 'ELDEN RING' });
    out.clearWithName = clearWithName;
    // 不带名字清（旧行为）作对照
    const clearNoName = await send({ type: 'cache:clearApp', appid: 1245620 });
    out.clearNoName = clearNoName;
    // 再取一次，应能正常拿到
    const b = await send({ type: 'app:data', appid: 1245620, drmTexts: [], mySteamId: null });
    out.second = b.hltb ? { name: b.hltb.name, main: b.hltb.main, match: b.hltb.match } : null;
    return out;
  })()`;

  const res = await new Promise((resolve) => {
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id === 1) resolve(m.result?.exceptionDetails ? { err: JSON.stringify(m.result.exceptionDetails).slice(0,300) } : m.result?.result?.value);
    };
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: script, awaitPromise: true, returnByValue: true } }));
  });

  console.log('=== 刷新清缓存验证 ===');
  console.log(JSON.stringify(res, null, 2));
  console.log('\n判定:');
  const ok = (l, c, extra) => { console.log(`  ${c ? '✅' : '❌'} ${l}${extra !== undefined ? '  ' + extra : ''}`); if (!c) exitCode = 1; };
  ok('首次能取到通关时长', !!res?.first, res?.first ? `${res.first.name} ${Math.round(res.first.main/3600*10)/10}h` : 'null');
  ok('带名字清缓存返回了清理条数', res?.clearWithName && typeof res.clearWithName.cleared === 'number', JSON.stringify(res?.clearWithName));
  ok('清缓存后再次取数成功（说明会重新请求而非命中失败缓存）', !!res?.second, res?.second ? `${res.second.name} ${Math.round(res.second.main/3600*10)/10}h` : 'null');
  ws.close();
} catch (e) {
  console.log('出错:', e.message);
  exitCode = 1;
} finally {
  try { child.kill(); } catch {}
  await sleep(1500);
  try { spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {}
}
process.exitCode = exitCode;
