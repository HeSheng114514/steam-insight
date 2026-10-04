# 隐私政策 / Privacy Policy

**Steam 洞察 · Steam Insight** 浏览器扩展
最后更新：2026-10-04

> 提交商店时需要一个可公开访问的网址（Chrome 应用商店必填）。把本文件内容发布到
> GitHub Pages / Gist / 你自己的站点后，把 URL 填进开发者后台即可。

---

## 中文

### 一句话说明

本扩展**不收集、不上传、不出售任何个人信息**，没有账号体系、没有统计分析、没有遥测，也不加载任何远程代码。所有数据都只存在你自己的浏览器里。

### 扩展会访问什么

1. **Steam 商店页与社区页**（`store.steampowered.com`、`steamcommunity.com`、`api.steampowered.com`）
   用于读取你正在浏览的游戏页面上的公开信息（DLC 列表、第三方 DRM 声明、Steam Deck 兼容性等）以及官方公开接口。

2. **你已登录的 Steam 账号信息（仅在你开启"我的家庭组"功能且已登录时）**
   扩展会调用 Steam 自己的接口，复用你浏览器里已有的登录凭据，读取你的 SteamID 与 Steam 家庭组的共享游戏列表，用来判断你正在看的游戏是否已经在你的家庭库里。
   - 这些请求直接发往 Steam，不经过任何第三方服务器；
   - 结果只写入浏览器本地的扩展存储，最长保留 15 分钟；
   - 你可以随时在设置里关闭该功能（"我的 Steam 家庭组是否已有该游戏"）。

3. **第三方公开数据接口**，用于补充 Steam 自身没有的信息：

   | 服务 | 域名 | 发送的内容 |
   | --- | --- | --- |
   | ProtonDB | `www.protondb.com` | 游戏 AppID |
   | AreWeAntiCheatYet | `raw.githubusercontent.com`、`cdn.jsdelivr.net` | 无（一次性拉取公开的整份反作弊列表） |
   | HowLongToBeat | `howlongtobeat.com` | 游戏英文名称 |
   | 微软 Game Pass 目录 | `catalog.gamepass.com`、`displaycatalog.mp.microsoft.com` | 无（一次性拉取公开的 Game Pass 游戏清单） |

   **只发送游戏标识（AppID / 游戏名），不发送任何与你个人相关的信息。**

### 扩展不会做什么

- 不创建账号、不要求额外登录；
- 不收集浏览历史、不含任何统计或行为追踪代码；
- 不向任何服务器上传你的数据，不与其他方共享或出售；
- 不含广告、不含推广链接、不会改写 Steam 的购买链接或价格；
- 不使用远程代码（所有逻辑都打包在扩展内部）。

### 本地存储

扩展使用浏览器提供的 `chrome.storage.local` 保存：你的设置项，以及各项查询结果的缓存（用于减少网络请求）。这些内容只存在于本机，你可以在设置页点"清空缓存"随时删除；卸载扩展会一并清除。

### 权限用途

| 权限 | 用途 |
| --- | --- |
| `storage` | 保存设置与查询缓存 |
| `unlimitedStorage` | Game Pass 与反作弊索引数据量较大，需要更多本地空间 |
| `alarms` | 定期清理过期缓存 |
| 各站点访问权限 | 仅用于上表列出的接口与页面，读取游戏信息 |

### 变更与联系

本政策如有变更会在本页更新，并相应提升扩展版本号。
联系方式：**<你的联系邮箱>**

---

## English

### Summary

This extension **does not collect, transmit, or sell any personal information**. There is no account system, no analytics, no telemetry, and no remote code. Everything stays in your own browser.

### What it accesses

1. **Steam store and community pages** (`store.steampowered.com`, `steamcommunity.com`, `api.steampowered.com`) — to read public information about the game page you are viewing (DLC list, third-party DRM notice, Steam Deck compatibility) and official public APIs.

2. **Your logged-in Steam account (only when the "My Steam Family" feature is enabled and you are signed in)** — the extension calls Steam's own endpoints using the credentials already present in your browser, reading your SteamID and your Steam Family shared-library list, to tell you whether the game you are viewing is already available in your family library.
   - These requests go directly to Steam, never through a third-party server;
   - The result is stored only in local extension storage for at most 15 minutes;
   - You can disable this at any time in the options page.

3. **Public third-party APIs** used to fill gaps Steam does not expose:

   | Service | Domain | Data sent |
   | --- | --- | --- |
   | ProtonDB | `www.protondb.com` | game AppID |
   | AreWeAntiCheatYet | `raw.githubusercontent.com`, `cdn.jsdelivr.net` | none (one-off fetch of a public list) |
   | HowLongToBeat | `howlongtobeat.com` | game English title |
   | Microsoft Game Pass catalog | `catalog.gamepass.com`, `displaycatalog.mp.microsoft.com` | none (one-off fetch of a public list) |

   **Only game identifiers (AppID / title) are sent — never anything about you.**

### What it does not do

No accounts, no extra sign-in, no browsing-history collection, no analytics or tracking, no uploading or sharing of your data, no ads or affiliate links, no modification of Steam prices or purchase links, and no remote code.

### Local storage

Settings and query caches are kept in `chrome.storage.local` on your machine. You can clear them from the options page at any time; uninstalling the extension removes them.

### Contact

**<your-email@example.com>**
