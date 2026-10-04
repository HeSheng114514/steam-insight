// 带超时与重试的 fetch 封装（背景 Service Worker 里使用）

export class HttpError extends Error {
  constructor(message, status, url) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.url = url;
  }
}

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

/**
 * @param {string} url
 * @param {object} [options] fetch 选项
 * @param {{retries?:number, timeout?:number, backoff?:number}} [cfg]
 * @returns {Promise<Response>}
 */
export async function fetchWithRetry(url, options = {}, cfg = {}) {
  const { retries = 2, timeout = 15000, backoff = 500 } = cfg;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(timer);
      // 5xx / 429 值得重试
      if (res.status >= 500 || res.status === 429) {
        lastErr = new HttpError(`HTTP ${res.status}`, res.status, url);
        if (attempt < retries) {
          await sleep(backoff * (attempt + 1));
          continue;
        }
        return res;
      }
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries) {
        await sleep(backoff * (attempt + 1));
        continue;
      }
    }
  }
  throw lastErr || new Error(`请求失败: ${url}`);
}

/** 取 JSON；HTTP 错误或非 JSON 都返回 null（调用方自行降级） */
export async function fetchJson(url, options = {}, cfg = {}) {
  try {
    const res = await fetchWithRetry(url, options, cfg);
    if (!res.ok) return null;
    const text = await res.text();
    if (!text) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** 取文本；失败返回 null */
export async function fetchText(url, options = {}, cfg = {}) {
  try {
    const res = await fetchWithRetry(url, options, cfg);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export const UA_HEADERS = { 'User-Agent': DEFAULT_UA };

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 并发受限的 map，避免一次性打出几十个请求 */
export async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = new Array(Math.min(limit, items.length)).fill(null).map(async () => {
    while (cursor < items.length) {
      const index = cursor++;
      try {
        results[index] = await worker(items[index], index);
      } catch {
        results[index] = null;
      }
    }
  });
  await Promise.all(runners);
  return results;
}
