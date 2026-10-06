/**
 * 真实扩展端到端测试（CDP 驱动）
 *
 * 为什么需要它：`declarativeNetRequest` 只在真实扩展环境里存在，
 * Node 里没有这个 API，所以 selftest.mjs --live 中的 HLTB 永远取不到数据
 * （这是预期行为，不是 bug）。要知道扩展里到底行不行，必须真的把扩展装起来。
 *
 * 做法：启动一个独立的 Edge 实例（独立 profile，不影响你日常浏览器），
 * 加载 steam-insight 扩展，打开扩展自己的 options 页面，
 * 让它通过真实的 chrome.runtime.sendMessage 走一遍完整链路。
 *
 *   node e2e-extension.mjs
 *
 * 需要：Windows + Edge（或把 EDGE 改成 Chrome 路径）+ 代理（默认 7897）
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const EXT = path.join(HERE, '..', 'steam-insight');

const EDGE =
  process.env.SI_BROWSER ||
  [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ].find((p) => fs.existsSync(p));

const PROXY = process.env.SI_PROXY || 'http://127.0.0.1:7897';
const PORT = Number(process.env.SI_CDP_PORT || 9241);
const STAGE = path.join(process.env.TEMP || '.', 'si-e2e-stage');
const PROFILE = path.join(process.env.TEMP || '.', 'si-e2e-profile');

if (!EDGE) {
  console.error('找不到 Edge/Chrome，可用 SI_BROWSER 环境变量指定路径');
  process.exit(1);
}

/* 用干净目录加载扩展，避免 .git 等无关内容干扰 */
fs.rmSync(STAGE, { recursive: true, force: true });
fs.rmSync(PROFILE, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });
fs.copyFileSync(path.join(EXT, 'manifest.json'), path.join(STAGE, 'manifest.json'));
for (const d of ['src', 'icons']) {
  fs.cpSync(path.join(EXT, d), path.join(STAGE, d), { recursive: true });
}

const child = spawn(
  EDGE,
  [
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    `--load-extension=${STAGE}`,
    `--proxy-server=${PROXY}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-sync',
    'about:blank',
  ],
  { stdio: 'ignore' }
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function cdp(wsUrl, calls, timeoutMs = 240000) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const results = [];
    let i = 0;
    const timer = setTimeout(() => {
      try { ws.close(); } catch {}
      reject(new Error('CDP 超时'));
    }, timeoutMs);
    ws.onopen = () => ws.send(JSON.stringify(calls[0]));
    ws.onmessage = (ev) => {
      const m = JSON.parse(ev.data);
      if (m.id !== i + 1) return;
      if (m.result?.exceptionDetails) {
        clearTimeout(timer);
        try { ws.close(); } catch {}
        return reject(new Error(JSON.stringify(m.result.exceptionDetails).slice(0, 500)));
      }
      results.push(m.result?.result?.value ?? m.result);
      i++;
      if (i < calls.length) ws.send(JSON.stringify(calls[i]));
      else {
        clearTimeout(timer);
        try { ws.close(); } catch {}
        resolve(results);
      }
    };
    ws.onerror = () => { clearTimeout(timer); reject(new Error('CDP WS 错误')); };
  });
}

let exitCode = 0;
try {
  let extId = null;
  for (let i = 0; i < 40; i++) {
    await sleep(700);
    try {
      const targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const sw = targets.find((t) => t.type === 'service_worker' && t.url.includes('/src/background.js'));
      if (sw) { extId = new URL(sw.url).host; break; }
    } catch {}
  }

  if (!extId) {
    console.log('❌ 没找到扩展（Edge 可能未加载未打包扩展）');
    exitCode = 1;
  } else {
    console.log('扩展 ID:', extId);
    const pageUrl = `chrome-extension://${extId}/src/options.html`;
    const tab = await (await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(pageUrl)}`, { method: 'PUT' })).json();
    console.log('已打开扩展页面:', tab.url, '\n');
    await sleep(2500);

    const script = `(async () => {
      const send = (msg) => new Promise((res) => {
        let done = false;
        chrome.runtime.sendMessage(msg, (r) => { done = true; res(r); });
        setTimeout(() => { if (!done) res({ error: 'timeout' }); }, 180000);
      });
      const out = {};
      try {
        const h = await send({ type: 'app:data', appid: 1245620, drmTexts: [], mySteamId: null });
        out.name = h.name;
        out.denuvo = h.denuvo && h.denuvo.has;
        out.xgp = h.xgp && h.xgp.on;
        out.deck = h.deck && h.deck.label;
        out.proton = h.proton && h.proton.tierLabel;
        out.regions = (h.regionPrices || []).length;
        out.dlc = h.dlc && h.dlc.count;
        out.hltb = h.hltb ? {
          name: h.hltb.name, main: h.hltb.main, mainExtra: h.hltb.mainExtra,
          completionist: h.hltb.completionist, match: h.hltb.match,
        } : null;

        const md = await send({ type: 'export:markdown', data: h });
        out.md = md.text ? md.text.length : 0;
        const tx = await send({ type: 'export:text', data: h });
        out.txt = tx.text ? tx.text.length : 0;
        out.txtHasHltb = tx.text ? tx.text.includes('通关时长') : false;
        const xl = await send({ type: 'export:xlsx', data: h });
        out.xlsx = xl.base64 ? xl.base64.length : 0;
        out.xlsxHead = xl.base64 ? xl.base64.slice(0, 6) : null;

        const st = await send({ type: 'sources:status' });
        out.dnr = st.dnrRulesets;
        out.hltbVerified = st.hltbVerified;
      } catch (e) { out.error = String(e); }
      return out;
    })()`;

    const [result] = await cdp(tab.webSocketDebuggerUrl, [
      { id: 1, method: 'Runtime.evaluate', params: { expression: script, awaitPromise: true, returnByValue: true } },
    ]);

    console.log('=== 结果 ===');
    console.log(JSON.stringify(result, null, 2));
    console.log('\n判定:');

    const ok = (label, cond, extra) => {
      console.log(`  ${cond ? '✅' : '❌'} ${label}${extra !== undefined ? '  ' + extra : ''}`);
      if (!cond) exitCode = 1;
    };

    const h = result?.hltb;
    const fmt = (v) => (v ? `${Math.round((v / 3600) * 10) / 10}h` : '—');
    ok('游戏数据', !!result?.name, result?.name);
    ok(
      'HLTB 通关时长',
      !!h,
      h ? `${h.name} 主线 ${fmt(h.main)} / 全收集 ${fmt(h.completionist)} (匹配=${h.match})` : '缺失'
    );
    ok('HLTB 经 Steam AppID 核对', h?.match === 'steam-id', h?.match);
    ok('D 加密字段', result?.denuvo !== undefined, String(result?.denuvo));
    ok('Markdown 导出', result?.md > 200, result?.md + ' 字符');
    ok('TXT 导出', result?.txt > 200 && result?.txtHasHltb, result?.txt + ' 字符');
    ok('Excel 导出（base64 PK 头）', result?.xlsx > 1000 && /^UEsDB/.test(result?.xlsxHead || ''), result?.xlsx + ' 字符');
    ok(
      'DNR 规则已启用',
      Array.isArray(result?.dnr) && result.dnr.includes('howlongtobeat_referer'),
      JSON.stringify(result?.dnr)
    );
  }
} catch (err) {
  console.log('出错:', err.message);
  exitCode = 1;
} finally {
  try { child.kill(); } catch {}
  await sleep(1500);
  try { spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {}
}
process.exitCode = exitCode;
