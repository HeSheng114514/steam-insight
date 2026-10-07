/**
 * 关键验证：模拟「静态 rules.json 没生效」的环境（你遇到的情况），
 * 确认新的动态规则兜底能让 HLTB 恢复。
 *
 * 做法：复制一份扩展上去掉 manifest 的 declarative_net_request 声明
 * （只保留权限），加载后走真实消息链路取通关时长。
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
const STAGE = path.join(process.env.TEMP, 'si-fallback-stage');
const PROFILE = path.join(process.env.TEMP, 'si-fallback-profile');
const PORT = 9295;

fs.rmSync(STAGE, { recursive: true, force: true });
fs.rmSync(PROFILE, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });
fs.copyFileSync(path.join(EXT, 'manifest.json'), path.join(STAGE, 'manifest.json'));
for (const d of ['src', 'icons']) fs.cpSync(path.join(EXT, d), path.join(STAGE, d), { recursive: true });

// 关键：删除静态规则声明，模拟「静态规则未加载」
const mfPath = path.join(STAGE, 'manifest.json');
const mf = JSON.parse(fs.readFileSync(mfPath, 'utf8'));
delete mf.declarative_net_request;
fs.writeFileSync(mfPath, JSON.stringify(mf, null, 2));
console.log('已构造「静态规则缺失」的扩展副本（只保留 declarativeNetRequest 权限）\n');

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
  console.log('扩展 ID:', extId);

  const page = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(`chrome-extension://${extId}/src/options.html`)}`, { method: 'PUT' })).json();
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  await sleep(2000);

  const script = `(async () => {
    const send = (m) => new Promise((r) => { let d=false; chrome.runtime.sendMessage(m, (x)=>{d=true;r(x);}); setTimeout(()=>{if(!d)r({error:'timeout'})},150000); });
    const out = {};
    // 等后台把动态规则注册好
    await new Promise(r => setTimeout(r, 1500));
    const st = await send({ type: 'sources:status' });
    out.hltb = st.hltb;
    out.hltbVerified = st.hltbVerified;
    out.hltbReason = st.hltbReason;
    out.rule = st.hltbRule;
    const a = await send({ type: 'app:data', appid: 1245620, drmTexts: [], mySteamId: null });
    out.detail = a.hltb ? { name: a.hltb.name, main: a.hltb.main, match: a.hltb.match } : null;
    out.detailMissing = a.hltb && a.hltb.missing ? a.hltb : null;
    return out;
  })()`;

  const res = await new Promise((resolve) => {
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id === 1) resolve(m.result?.exceptionDetails ? { err: JSON.stringify(m.result.exceptionDetails).slice(0,300) } : m.result?.result?.value);
    };
    ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: script, awaitPromise: true, returnByValue: true } }));
  });

  console.log('=== 静态规则缺失时的表现 ===');
  console.log(JSON.stringify(res, null, 2));
  console.log('\n判定:');
  const ok = (l, c, extra) => { console.log(`  ${c ? '✅' : '❌'} ${l}${extra !== undefined ? '  ' + extra : ''}`); if (!c) exitCode = 1; };
  ok('动态规则已注册', res?.rule?.dynamicCount > 0, JSON.stringify(res?.rule));
  ok('静态规则确实缺失（模拟成立）', res?.rule?.staticEnabled === false, String(res?.rule?.staticEnabled));
  ok('HLTB 仍然能取到', !!res?.detail, res?.detail ? `${res.detail.name} 主线 ${Math.round(res.detail.main/3600*10)/10}h 匹配=${res.detail.match}` : JSON.stringify(res?.detailMissing));
  ws.close();

  console.log(exitCode === 0 ? '\n✅ 兜底方案有效：即使静态规则没加载，HLTB 也能工作' : '\n❌ 兜底无效');
} catch (e) {
  console.log('出错:', e.message);
  exitCode = 1;
} finally {
  try { child.kill(); } catch {}
  await sleep(1500);
  try { spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {}
}
process.exitCode = exitCode;
