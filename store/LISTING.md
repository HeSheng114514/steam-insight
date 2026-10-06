# 商店上架文案（可直接复制粘贴）

Chrome 应用商店和 Edge 加载项后台都有字数限制，下面每段都已按限制写好。**带 `< >` 的地方需要你自己替换。**

---

## 1. 基本信息

| 字段 | 值 | 限制 |
| --- | --- | --- |
| 名称 | `Steam 洞察 · Steam Insight` | ≤ 45 字符（当前 24） |
| 简短说明 | `在 Steam 商店页与列表页显示：家庭库、DLC、Xbox Game Pass、Denuvo(D加密)、Steam Deck / ProtonDB、反作弊、中文支持、多区价格与通关时长。` | ≤ 132 字符（当前 94） |
| 类别 | **Shopping**（首选） | 见下方说明 |
| 类别（备选） | `Productivity` | 不太贴切，仅在 Shopping 被审核要求更换时考虑 |
| 默认语言 | 中文（简体） | — |
| 主页 / 支持网址 | `<你的仓库或主页地址>` | 建议填 |

### 类别怎么选

Chrome 后台的可选类别是（按实际下拉框列出）：
`Accessibility`、`Blogging`、`Developer Tools`、`Entertainment`、`News And Weather`、`Photos`、`Productivity`、`Search Tools`、`Shopping`、`Social`、`Communication`、`Sports`

**结论：选 `Shopping`。** 理由：

1. **与"单一用途"自洽。** 核心四项里三项都是购买决策（家庭库 = 是不是已经能玩、Game Pass = 会员里有没有、D 加密 = 买了值不值），加上多区价格对比，整体就是一个买前决策工具。审核时口径统一，不容易被追问功能边界。
2. **列表里没有"游戏"类别，其余选项更不合适。** 特别说明 `Entertainment`：那是给"提供娱乐内容"的扩展（看片、听歌、小游戏）用的，本扩展是工具而非内容，填进去反而容易引起审核对单一用途的疑问。`Productivity` 是个万能筐但不准确；`Search Tools` 是给改搜索引擎/加搜索功能的，不沾边。
3. **不会增加审核风险。** 价格类扩展在 Chrome 上确实受关注，但盯的是注入返利链接、篡改商品链接与价格这类行为。本扩展明确不做这些（隐私政策中已声明无广告、无推广链接、不改写价格与购买链接）。
4. **改类别成本很低。** 类别属于元数据，可随时在后台修改，改完重新提交通常很快通过，不需要重走完整审核。所以不必纠结，真被要求换再换即可。

> 简短说明与 `manifest.json` 里的 `description` 建议保持一致（Chrome 会用 manifest 的描述预填商店摘要），改一处记得同步另一处。

---

## 2. 详细说明（中文，约 900 字）

```
Steam 洞察：在 Steam 商店页和列表页，一眼看清这款游戏值不值得买。

打开任意 Steam 游戏页，右侧信息栏顶部会出现一块完整的信息面板。

【四项核心信息】
· 家庭库 —— 显示这款游戏是否支持家庭共享，以及是否已经在你的 Steam 家庭组共享库里，并区分"他人拥有""被排除""我自己有"。
· DLC 情况 —— DLC 总数、每个 DLC 的名称与价格，一眼看出"本体便宜、DLC 贵"。
· 是否 Xbox Game Pass —— 直接对照微软官方 PC Game Pass 全量游戏库（约 556 款），在库就标出来，能省一份钱。
· 是否 D 加密（Denuvo）—— 读取 Steam 商店页的第三方 DRM 声明，买之前就知道有没有 D 加密。

【还有这些】
· Steam Deck 兼容性（官方"已验证 / 可玩 / 不支持"）+ ProtonDB 兼容评级
· 反作弊检测：EAC / BattlEye 等，并特别标出可能加载内核驱动的内核级反作弊
· 是否需要第三方启动器（Ubisoft Connect、EA app、Rockstar 等）与第三方协议
· 中文支持：界面/字幕 与 完整语音 分别显示
· 国区是否可购买
· 多区价格对比：国区 / 美区 / 阿根廷 / 土耳其 / 俄区 / 印度 / 巴西（区域可自选）
· 通关时长（HowLongToBeat）：主线 / 主线+支线 / 全收集
· 一键导出：复制为 Markdown，或下载 TXT / Excel / JSON，方便发群、存档或自己整理比价表

【列表页也有用】
在愿望单、搜索结果、特卖和标签页，每个游戏下方会显示一排小徽章：有没有 XGP、有没有 D 加密、家庭库有没有、DLC 数量、Steam Deck 状态、内核级反作弊。滚动到哪就查哪，不会一次性打出一堆请求。

【隐私】
不收集任何个人信息，没有账号、没有统计、没有广告，不含推广链接，不会改写 Steam 的价格或购买链接。所有数据只缓存在你自己的浏览器里。只有在你开启该功能并已登录 Steam 时，才会调用 Steam 自己的接口查询你的家庭组。

【使用说明】
· "是否支持家庭共享"来自 Steam 官方接口；"你的家庭组里有没有"需要已登录 Steam 才会显示。
· XGP 与其他部分第三方数据来自公开接口，采用名称匹配，个别游戏可能有误差，此时会标注"疑似"。
· D 加密信息来自 Steam 商店页的第三方 DRM 声明；若该页面被年龄验证拦截，会明确显示"需要先通过年龄验证"，而不是当作"没有 D 加密"。

【免责声明】
本扩展是非官方的第三方工具，与 Valve、微软、ProtonDB、HowLongToBeat、AreWeAntiCheatYet 均无关联，未获得其背书。所有商标归各自所有者所有。
```

---

## 3. Detailed description (English)

```
Steam Insight shows you — right on the Steam store page and in list views — what you need to know before buying.

A panel appears at the top of the right column on any game page:

CORE INFO
· Family library — whether the game supports Family Sharing, and whether it is already in your Steam Family shared library (distinguishing "owned by a family member", "excluded", and "owned by you").
· DLC — total count plus every DLC's name and price.
· Xbox Game Pass — matched against Microsoft's official PC Game Pass catalog (~556 titles).
· Denuvo (D encryption) — read from Steam's own third-party DRM notice.

ALSO INCLUDED
· Steam Deck compatibility (official Verified / Playable / Unsupported) plus ProtonDB rating
· Anti-cheat detection (EAC, BattlEye, ...) with a flag for kernel-level anti-cheat
· Whether a third-party launcher or agreement is required (Ubisoft Connect, EA app, Rockstar, ...)
· Chinese support — interface/subtitles and full audio shown separately
· Whether the game is purchasable in your region
· Regional price comparison (configurable)
· How long to beat: main story / main + extra / completionist
· Export in one click: copy as Markdown, or download TXT / Excel / JSON for sharing or archiving

IN LIST VIEWS
Wishlist, search results, sales and tag pages get a row of compact badges per game: Game Pass, Denuvo, family library, DLC count, Steam Deck status, kernel-level anti-cheat. Only rows you scroll into view are queried.

PRIVACY
No personal data is collected. No accounts, no analytics, no ads, no affiliate links, and Steam prices and purchase links are never modified. Data is cached locally in your browser only. Your Steam Family information is requested from Steam's own endpoints, and only when you enable that feature and are signed in.

NOTES
· "Supports Family Sharing" comes from an official Steam API; "already in your family library" requires being signed in.
· Game Pass and some third-party data use name matching and may be inaccurate for a few titles (marked as "approximate" when so).
· Denuvo information comes from Steam's third-party DRM notice; if that page is behind an age gate, the panel says so explicitly rather than assuming "no Denuvo".

DISCLAIMER
This is an unofficial third-party tool. It is not affiliated with, endorsed by, or sponsored by Valve, Microsoft, ProtonDB, HowLongToBeat, or AreWeAntiCheatYet. All trademarks belong to their respective owners.
```

---

## 4. 搜索关键词（Edge 后台，最多 7 个）

```
Steam
Steam 家庭共享
Xbox Game Pass
Denuvo
D加密
Steam Deck
ProtonDB
```

---

## 5. 隐私规范页逐字段填写内容（Chrome / Edge 通用）

> **这些字段是写给审核员看的，不是给用户看的。** 每节都给了中英两版，二选一即可。审核团队以英文为主，填英文通常过得更快；填中文也可以用。
>
> 每个输入框上限 **1000 字符**。修改后可以跑 `python build/check_listing_lengths.py` 自动校验有没有超限。

### 5.1 Single purpose description

**English**
```
This extension has one purpose: while the user browses the Steam store, show the information needed to decide whether a game is worth buying, directly on the page being viewed. On a Steam game page it displays: whether the game supports Family Sharing and whether it is already in the user's Steam Family shared library; its DLC list and prices; whether it is included in PC Game Pass; whether it uses Denuvo DRM; Steam Deck and ProtonDB compatibility; anti-cheat; Chinese-language support; regional price comparison; and HowLongToBeat completion times. On list pages (wishlist, search, sales) it shows the same fields as compact badges. It does nothing else: no ads, no affiliate links, and it never modifies Steam prices or purchase links.
```

**中文**
```
本扩展只有一个用途：在用户浏览 Steam 商店时，把判断一款游戏是否值得购买所需的信息直接显示在当前页面上。具体包括：是否支持家庭共享、是否已在用户的 Steam 家庭共享库中、DLC 列表与价格、是否包含在 PC Game Pass 中、是否使用 Denuvo（D 加密）、Steam Deck 与 ProtonDB 兼容性、反作弊、中文支持、多区价格对比、HowLongToBeat 通关时长。在愿望单/搜索/特卖等列表页以徽章形式显示同样的字段。除此之外不做任何事：无广告、无推广链接，也从不修改 Steam 的价格或购买链接。
```

### 5.2 storage justification

**中文**
```
保存用户自己的偏好设置（显示哪些板块、对比哪些区域），以及查询结果的本地缓存，避免重复访问同一个游戏页面时反复发起网络请求。全部内容只保存在用户本机的浏览器扩展存储中，不会上传到任何地方。
```

**English**
```
Saves the user's own preferences (which sections to show, which regions to compare) and a local cache of lookup results, so that revisiting the same game page does not repeat network requests. Everything stays in the browser's local extension storage on the user's own device; nothing is uploaded anywhere.
```

### 5.2b declarativeNetRequest justification（v1.1.0 新增）

> v1.1.0 起新增了这个权限。**如果 1.0.0 已经上架，上传新版本时务必回来补上这一条**，否则可能被以「权限用途未说明」退回。

**中文**
```
仅用于一条规则：给发往 howlongtobeat.com 的请求补上 Referer 请求头。该站的 CDN 要求 Referer 必须来自它自己的域名，否则直接返回 403；而 Referer 属于浏览器接管的禁止请求头，网页脚本无法自行设置，只能通过声明式规则注入。规则只作用于 howlongtobeat.com，不读取、不修改任何页面内容，也不涉及用户的浏览数据。
```

**English**
```
Used for exactly one rule: adding the Referer request header to requests sent to howlongtobeat.com. That site's CDN requires the Referer to come from its own domain and otherwise returns 403; because Referer is a browser-controlled forbidden header, a script cannot set it, so a declarative rule is the only way. The rule applies only to howlongtobeat.com. It does not read or modify any page content and does not involve the user's browsing data.
```

> 审核若追问「为什么需要这个权限」，把上面那段原样回复，并补充一句：**该扩展只使用 1 条 DNR 规则，规则内容随包提供、可在 `src/rules.json` 中查看。**

### 5.3 unlimitedStorage justification

**中文**
```
有两个公开数据源是完整清单，必须下载并缓存在本地，以免反复请求对方服务器：微软的 PC Game Pass 游戏目录（原始 JSON 约 30 MB，本地只保留几百 KB 的紧凑标题索引）和 AreWeAntiCheatYet 反作弊数据库（约 460 KB）。浏览器默认存储配额不足以容纳这些缓存。缓存中不包含任何用户信息。
```

**English**
```
Two public data sources are complete lists that must be downloaded and cached locally to avoid repeatedly hitting those providers: Microsoft's PC Game Pass catalog (about 30 MB of raw JSON, of which only a compact title index of a few hundred KB is kept) and the AreWeAntiCheatYet anti-cheat database (about 460 KB). The default storage quota is too small for these caches. They contain no user information.
```

### 5.4 alarms justification

**中文**
```
每小时执行一次维护任务，删除已过期的缓存条目，避免本地存储无限增长。该定时器不用于任何其他目的。
```

**English**
```
Runs an hourly maintenance job that deletes expired cache entries, so local storage does not grow without bound. No alarm is used for any other purpose.
```

### 5.5 Host permission justification

**中文**
```
store.steampowered.com：读取用户正在浏览的游戏页面（DLC、价格、支持语言、第三方 DRM 声明、Steam Deck 兼容状态），并调用 Steam 公开的 appdetails 接口。
api.steampowered.com：仅在用户开启"我的家庭组"功能时，调用 Steam 官方的 IFamilyGroupsService 读取用户自己的家庭共享库列表。
steamcommunity.com：读取已登录用户的 SteamID，以便正确归属家庭共享游戏。
www.protondb.com：按正在浏览游戏的 AppID 查询 Proton/Linux 兼容评级。
raw.githubusercontent.com、cdn.jsdelivr.net：下载公开的 AreWeAntiCheatYet 反作弊清单（约 460 KB，每天最多一次），仅作为 JSON 数据，绝不执行。
howlongtobeat.com：按游戏名称查询通关时长。
catalog.gamepass.com、displaycatalog.mp.microsoft.com：下载微软官方 PC Game Pass 游戏目录（最多每 12 小时一次），用于判断游戏是否在库。
向这些服务只发送游戏标识（AppID 或游戏名），不发送任何页面内容，也不发送任何用户数据。
```

**English**
```
store.steampowered.com: read the game page being viewed (DLC, price, languages, third-party DRM notice, Steam Deck status) and Steam's public appdetails API.
api.steampowered.com: only when the user enables the family-library feature, call Steam's IFamilyGroupsService for the user's own shared-library list.
steamcommunity.com: read the signed-in user's SteamID to attribute shared games correctly.
www.protondb.com: look up the Proton/Linux rating for the AppID being viewed.
raw.githubusercontent.com, cdn.jsdelivr.net: download the public AreWeAntiCheatYet list (~460 KB, max once a day). JSON data only, never executed.
howlongtobeat.com: look up completion times by game title.
catalog.gamepass.com, displaycatalog.mp.microsoft.com: download Microsoft's PC Game Pass catalog (max once per 12 h) to check whether the game is included.
Only the game identifier (AppID or title) is sent; no page content and no user data is transmitted.
```

### 5.6 Are you using remote code?

选 **`No, I am not using remote code`**。

这是事实：所有 JS 都打包在扩展内，没有指向外部文件的 `<script>`、没有远程 ES module、没有 `eval()` 或 `new Function()`。我们只下载 JSON 数据并解析成文本显示。

若下方 Justification 框被要求必填，用这段：

**中文**
```
所有 JavaScript 都打包在扩展内部。没有指向外部文件的 script 标签，没有远程 ES 模块，也没有使用 eval() 或 new Function()。本扩展只下载 JSON 数据，解析后以纯文本形式显示。
```

**English**
```
All JavaScript is bundled inside the extension package. There are no script tags pointing to external files, no remote ES modules, and no eval() or new Function(). The extension only downloads JSON data (Microsoft Game Pass catalog, AreWeAntiCheatYet list, ProtonDB and HowLongToBeat responses), parses it, and renders it as plain text.
```

### 5.7 Data usage（数据用途勾选）

**结论：全部不勾。**

理由：这些选项问的是"是否收集**用户数据**"，而本扩展不收集任何用户数据——没有账号、没有统计、没有把任何与你个人相关的信息发出去。发给第三方公开接口的只有**游戏标识**（Steam AppID / 游戏英文名），那是"关于游戏的信息"，不是"关于你的信息"。缓存也只在本地。

**但这里有一个需要你自己拍板的判断，我把话说明白：**

严格讲，扩展在查询时会向 protondb.com 和 howlongtobeat.com 发出请求，这两个服务器因此能知道"某个 IP 在某个时刻查询了某个游戏"。如果审核员持最严格的解读，可能会认为这属于 `Website content`（网站内容）或 `Web history`（浏览记录）。

我的建议仍然是**不勾**：

- Chrome/Edge 对"收集"的定义是**把用户数据传出设备**。本扩展没有浏览历史记录功能，不存储、不汇总、不上传你访问过哪些页面，只是为当前这一个页面查一次公开元数据；
- 即便被算作"向第三方传输"，认证条款里的措辞是 *"outside of the approved use cases"*（获准用途之外），而为扩展自身功能调用公开接口正属于获准用途；
- 一旦勾选 `Website content`，商店详情页会对所有用户显示"此扩展可能收集网站内容"的警示，而这是不准确的，反而会吓退用户。

**如果你更怕"漏报被拒"而不是"标错"**，唯一有讨论空间的就是勾 `Website content`，其余都不要勾。这是我的备选建议，不是首选。

### 5.8 Privacy policy URL

填你发布 `PRIVACY.md` 之后的公开网址。表单里这一项可能没有红星（表示非必填），**但建议照填** —— 能明显提升审核通过率，遇到问询时也好回应。

### 5.9 I certify that the following disclosures are true

**三个全部勾选。** 三条都是事实：

| 条款 | 为什么成立 |
| --- | --- |
| 不向第三方出售或传输用户数据（获准用途之外） | 没有任何用户数据离开设备；调用公开接口属于扩展自身功能的获准用途 |
| 不将用户数据用于与单一用途无关的目的 | 所有网络请求都只服务于"显示当前游戏页的购买决策信息" |
| 不将用户数据用于信用评估或借贷目的 | 完全不涉及 |

---

## 6. 需要你准备的素材

| 素材 | 尺寸 | 来源 |
| --- | --- | --- |
| 扩展图标 | 128×128 PNG | 已生成：`store-assets/icon-128.png` |
| Edge 商店 Logo | 300×300 PNG | 已生成：`store-assets/logo-300x300.png` |
| 小型宣传图块 | 440×280 PNG | 已生成：`store-assets/promo-440x280.png` |
| **屏幕截图（必填，至少 1 张）** | **1280×800** | 已生成 1 张，见下 |

### 截图

`store-assets/screenshots/` 下已有一张 **1280×800** 的真机截图：

| 文件 | 内容 |
| --- | --- |
| `detail-2358720.png` | 《黑神话：悟空》商店页右侧面板（含 D 加密 / 不支持家庭共享 / XGP 不在库 / Deck / ProtonDB / 多区价格 / 通关时长 / DLC 明细） |

**它是真实渲染的**：脚本会启动一个独立的 Edge 实例、加载扩展、打开 Steam 页面、等面板把数据都取完，然后用 CDP 的 `Page.captureScreenshot` 截下 1280×800。所以它满足商店「截图必须反映实际外观、不能用设计稿冒充」的要求。

自己再补几张（建议不同角度，商店喜欢 3–5 张）：

```powershell
cd "D:\DeepSeek-Harness\D-Steam插件（Steam 洞察）\steam-insight-dev"

# 换游戏截（参数是 Steam AppID）
node screenshot.mjs 1091500     # Cyberpunk 2077（有折扣，能体现价格行）
node screenshot.mjs 1245620     # 艾尔登法环（注意：会被 Steam 年龄门槛挡住，别用这个）
```

> **注意**：带年龄门槛的游戏（如艾尔登法环、只狼）会被 Steam 重定向到 `/agecheck/`，内容脚本不匹配该路径，面板不会出现。挑游戏时先在浏览器里确认能直接打开商店页。
>
> 想手动截也行：`F12` → `Ctrl+Shift+M` 设备工具栏 → 尺寸填 `1280×800` → 三个点 → **Capture screenshot**。

> 宣传图块（440×280）是纯品牌图、不含界面截图，不属于"伪造截图"，可以放心用。
