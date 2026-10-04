// chrome.storage.local 上的 TTL 缓存

const PREFIX = 'cache:';
const MEM = new Map();
/** 用于区分「缓存未命中」和「缓存里存的就是 null」——不能直接用 undefined，
 * 因为 cacheGet 的默认参数会把 undefined 变成 null。 */
const MISS = Symbol('cache-miss');

function now() {
  return Date.now();
}

function storageArea() {
  return chrome.storage.local;
}

async function readRaw(key) {
  if (MEM.has(key)) {
    const entry = MEM.get(key);
    if (entry.expireAt > now()) return entry;
    MEM.delete(key);
  }
  const storeKey = PREFIX + key;
  const got = await storageArea().get(storeKey);
  const entry = got?.[storeKey];
  if (!entry) return null;
  if (entry.expireAt <= now()) {
    storageArea().remove(storeKey);
    return null;
  }
  MEM.set(key, entry);
  return entry;
}

/**
 * 读缓存；命中返回 value，未命中返回 fallback
 */
export async function cacheGet(key, fallback = null) {
  try {
    const entry = await readRaw(key);
    return entry ? entry.value : fallback;
  } catch {
    return fallback;
  }
}

/** 允许过期也拿出来（网络失败时的兜底） */
export async function cacheGetStale(key) {
  try {
    const entry = MEM.get(key);
    if (entry) return entry.value;
    const storeKey = PREFIX + key;
    const got = await storageArea().get(storeKey);
    const raw = got?.[storeKey];
    if (!raw) return null;
    MEM.set(key, raw);
    return raw.value;
  } catch {
    return null;
  }
}

export async function cacheSet(key, value, ttl) {
  const entry = { value, expireAt: now() + ttl, savedAt: now() };
  MEM.set(key, entry);
  try {
    await storageArea().set({ [PREFIX + key]: entry });
  } catch {
    // 配额满了就清一次过期缓存后重试一次
    try {
      await pruneExpired();
      await storageArea().set({ [PREFIX + key]: entry });
    } catch {
      /* 放弃写盘，内存里还有 */
    }
  }
  return value;
}

/** 缓存未命中时执行 loader 并写入缓存 */
export async function cacheWrap(key, ttl, loader) {
  const hit = await cacheGet(key, MISS);
  if (hit !== MISS) return hit;
  const value = await loader();
  if (value !== undefined && value !== null) {
    await cacheSet(key, value, ttl);
  }
  return value;
}

/** 已缓存的键（用于统计/调试） */
export async function cacheKeys() {
  const all = await storageArea().get(null);
  return Object.keys(all)
    .filter((k) => k.startsWith(PREFIX))
    .map((k) => k.slice(PREFIX.length));
}

export async function pruneExpired() {
  const all = await storageArea().get(null);
  const dead = [];
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith(PREFIX) && v && typeof v.expireAt === 'number' && v.expireAt <= now()) {
      dead.push(k);
    }
  }
  if (dead.length) {
    await storageArea().remove(dead);
    for (const k of dead) MEM.delete(k.slice(PREFIX.length));
  }
  return dead.length;
}

/** 按前缀清理（例如某款游戏的全部缓存） */
export async function cacheRemoveByPrefix(prefix) {
  const keys = await cacheKeys();
  const dead = keys.filter((k) => k.startsWith(prefix));
  for (const k of dead) MEM.delete(k);
  if (dead.length) await storageArea().remove(dead.map((k) => PREFIX + k));
  return dead.length;
}

export async function clearAllCache() {
  const keys = await cacheKeys();
  MEM.clear();
  if (keys.length) await storageArea().remove(keys.map((k) => PREFIX + k));
  return keys.length;
}
