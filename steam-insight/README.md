# Steam 洞察 · Steam Insight

一个 Chrome / Edge（Manifest V3）扩展，在 **Steam 商店游戏页**和**列表页（愿望单 / 搜索 / 特卖 / 标签）**上直接标出：

| 你要求的功能 | 状态 | 数据来源 |
| --- | --- | --- |
| **家庭库** | ✅ | 商店页 `appdetails.categories`（id 62 = 支持家庭共享）+ 你已登录账号的 Steam Families 共享库 |
| **DLC 情况** | ✅ | `appdetails.dlc`，逐个取名称与价格（最多列 40 个） |
| **是否 XGP** | ✅ | 微软官方 Game Pass PC 库（SIGL + 展示目录），按游戏名匹配 |
| **是否 D 加密** | ✅ | Steam 商店页的 `包含第三方 DRM: Denuvo` 声明 |

以及你逐项批准的附加功能：

| 附加功能 | 状态 | 数据来源 |
| --- | --- | --- |
| Steam Deck 兼容性 + ProtonDB 等级 | ✅ | Steam 官方 `ajaxgetdeckappcompatibilityreport` + ProtonDB 评分接口 |
| 反作弊（EAC / BattlEye / 内核级）+ 是否需要第三方启动器 | ✅ | AreWeAntiCheatYet 社区库 + 商店页第三方 DRM / EULA 文案 |
| 中文支持（界面·字幕·语音）+ 国区是否可购买 | ✅ | `appdetails.supported_languages`（带 `*` 表示完整语音）+ 国区价格可用性 |
| 多区价格对比 | ✅ | `appdetails` 切换 `cc` 参数（默认国区/美区/阿根廷/土耳其/俄区/印度/巴西，可自选） |
| 一键复制 Markdown / 导出 JSON | ✅ | 面板右上角两个按钮 |
| HowLongToBeat 通关时长 | ✅ | HLTB 搜索接口（主线 / 主线+支线 / 全收集） |

**没有实现**（你明确不要的）：历史最低价与折扣、当前在线人数曲线、成就数、好评率趋势。

---

## 安装

1. 打开 `chrome://extensions`（Edge 是 `edge://extensions`）。
2. 打开右上角 **开发者模式**。
3. 点 **加载已解压的扩展程序**，选择本目录 `steam-insight`（含 `manifest.json` 的那一层）。
4. 打开任意 Steam 游戏页，右侧信息栏顶部会出现 **Steam 洞察** 面板。

> 建议首次安装后打开扩展的 **设置页 → 检查数据源可用性**，确认各项数据源在你的网络下能取到。

## 使用

- **游戏详情页**：右栏顶部完整面板。徽章区一眼看到 `XGP / D 加密 / 家庭共享 / DLC N / 内核级反作弊`；下面逐行列出家庭组归属、Steam Deck、ProtonDB、反作弊、第三方启动器、中文支持、国区可购买、通关时长；再下面是多区价格网格和可展开的 DLC 明细。
  - `复制` = 复制 Markdown 到剪贴板，`导出 JSON` = 下载 JSON 文件，`刷新` = 清掉这款游戏的缓存后重新查询，`收起` = 折叠面板。
- **列表页**：每个游戏行下方出现一排小徽章。只有**滚动到可见区域**的行才会发起查询，避免一次性打几十个请求。
- **扩展弹窗**：显示当前页面类型、插件开关状态，可一键刷新页面数据 / 清空缓存 / 打开设置。

## 数据来源与可靠性

| 数据 | 来源 | 缓存 | 备注 |
| --- | --- | --- | --- |
| 游戏基础信息 / DLC / 语言 / 价格 | `store.steampowered.com/api/appdetails` | 12 h | 官方公开接口。**一次只能查一个 appid**（传多个会 400），已用 `filters` 把响应从 17 KB 压到 8.6 KB |
| 支持家庭共享 | 同上 `categories` 含 id 62 | 12 h | 比抓页面 DOM 稳，不会因为页面改版失效 |
| Steam Deck 兼容性 | `store.steampowered.com/saleaction/ajaxgetdeckappcompatibilityreport` | 7 d | 官方接口，`resolved_category`：0 未知 / 1 不支持 / 2 可玩 / 3 已验证 |
| D 加密 / 第三方 DRM | 商店页 HTML 里的 `.DRM_notice` | 24 h | **没有官方 API**，只能读页面。详情页直接读已加载的 DOM（零额外请求），列表页回源抓一次商店页 |
| Xbox Game Pass | `catalog.gamepass.com/sigls/v3` + `displaycatalog.mp.microsoft.com` | 12 h | 官方免 key 接口，PC 库约 556 款 |
| 反作弊 | `AreWeAntiCheatYet/AreWeAntiCheatYet@master/games.json` | 24 h | 社区项目，677 条带 Steam appid 的记录 |
| ProtonDB | `www.protondb.com/api/v1/reports/summaries/{appid}.json` | 24 h | 无记录时返回 404，已容错 |
| 通关时长 | `howlongtobeat.com/api/search/site` | 7 d | 非公开接口，两步（init 取 token → 搜索） |
| 我的家庭组 | `pointssummary/ajaxgetasyncconfig` → `IFamilyGroupsService` | 15 min | 需要已登录 Steam，属非公开接口 |

## 流量与性能

- **详情页首次打开**：约 8 个 appdetails 请求（本体 + 多区价格）+ Deck + ProtonDB + HLTB + 商店页（若页面 DOM 里读不到 DRM）。全部并发执行，通常 2–5 秒。
- **XGP 索引**：首次启用会下载约 **30 MB**（556 款游戏的完整展示目录，微软接口不支持字段裁剪），3 个批次并行，实测 **6.9 秒**完成，随后缓存 12 小时，期间所有查询都是纯本地匹配。不想要这笔开销可以在设置里关掉 XGP。索引构建是懒加载的——只有你真正打开一个需要判断 XGP 的页面才会触发。
- **列表页**：先并发 4 条拿基础信息 + XGP + 反作弊；再并发 3 条拿 Deck 和 D 加密（D 加密每条要抓一次商店页，可以在设置里关掉）。
- 所有结果都带 TTL 缓存，重复访问同一页面基本不发请求。

## 已知限制（请务必了解）

1. **D 加密只反映 Steam 商店页上的第三方 DRM 声明**。发行商移除或添加 Denuvo 后，以商店页为准；若商店页是年龄门槛页（未通过验证）则读不到，显示"未知"而不是"没有"。
2. **XGP 是名称匹配**。微软官方数据里**没有 Steam AppID**，扩展用归一化后的英文标题做精确匹配，失败时退化为包含匹配并标"疑似"（`?`）。同名的重制版 / 版本差异可能误判。
3. **家庭组依赖非公开接口**。未登录时只显示"支持家庭共享"标记；"我的家庭组里有没有"会显示"未登录 Steam"。接口若变更需要更新。
4. **HowLongToBeat 是最不可靠的一项**。接口契约已实测跑通（能取到真实时长：Elden Ring 主线 216418 秒 = 60.1 小时），但站点有反爬层：在**同一 IP、同一 User-Agent** 下，curl 返回 `200` + token，而 Node 发出的请求返回 `403 {"error":"Access Denied"}` —— 说明它在按请求指纹拦截，而且 token 本身是绑定 IP + UA 的。扩展在浏览器里发出的请求指纹更接近正常网页访问，预计可用，但**我没能在当前环境验证浏览器这条路径**。失败时这一行不显示，10 分钟后自动重试；也可以在设置里直接关掉它。
5. **"内核级反作弊"是按反作弊名称白名单推断的**（EAC / BattlEye / Vanguard / Denuvo Anti-Cheat / nProtect / XIGNCODE3 等），AreWeAntiCheatYet 本身没有这个字段。
6. **多区价格**只反映 Steam 在你所选区域的标价，不含锁区、支付方式、税费差异；阿根廷和土耳其自 2023-11 起已改为美元计价。
7. 列表页徽章是"注入到 Steam 现有 DOM 里"的，Steam 大幅改版时可能需要调整选择器（详情页面板用的是 `category 62` 等接口字段，不受页面改版影响）。

## 故障排查

**面板一直转圈 / 显示"获取失败"**
先在设置页点 **检查数据源可用性**。如果 Steam 项失败，多半是本机网络问题。

**常见网络坑（本机实测踩到过）**：如果你在用 Clash / Mihomo 之类的代理，`store.steampowered.com` 可能被解析到一个保留段地址（例如 `198.18.x.x`，fake-IP），而代理规则里没有放行它，导致浏览器和扩展都连不上 Steam 商店。检查方式：

```powershell
Resolve-DnsName store.steampowered.com -Type A | Select-Object IPAddress
curl.exe -s -o NUL -w "%{http_code}" https://store.steampowered.com/
```

若解析结果是 `198.18.x.x` 且返回 `000`，请在代理软件里把 `store.steampowered.com`、`api.steampowered.com`、`steamcommunity.com` 加入代理规则（或改用 TUN 模式）。

**HowLongToBeat 失败**：它按 IP + User-Agent 绑定 token，且 CDN 会限流。等一分钟再刷新即可，或关掉该项。

**列表页没有徽章**：确认设置里"列表页显示徽章"是开启的，并向下滚动页面（徽章只对进入可视区域的行加载）。

## 目录结构

```
steam-insight/
├── manifest.json
├── icons/                   # 16 / 32 / 48 / 128 图标
└── src/
    ├── background.js        # Service Worker：全部网络请求、缓存、聚合
    ├── lib/
    │   ├── constants.js     # 区域、反作弊白名单、TTL、默认设置
    │   ├── net.js           # 带超时/重试的 fetch、并发限制
    │   ├── cache.js         # chrome.storage.local 上的 TTL 缓存
    │   ├── steam.js         # Steam 接口 URL 构造 + 纯解析（含商店页 DRM 解析）
    │   ├── sources.js       # XGP / AreWeAntiCheatYet / ProtonDB / HLTB 解析
    │   └── format.js        # Markdown / JSON 导出
    ├── content/
    │   ├── content.js       # 读 DOM + 渲染（详情页面板、列表页徽章）
    │   └── content.css
    ├── options.html/js      # 设置页
    └── popup.html/js        # 工具栏弹窗
```

## 发布到商店

打包、隐私政策、上架文案和审核要点都在上一层目录：

- `../store/PUBLISH-CHECKLIST.md` —— 发布操作清单
- `../store/LISTING.md` —— 可直接粘贴的商店文案
- `../store/PRIVACY.md` —— 隐私政策（需自行发布成公开网址）
- `../dist/*.zip` —— 打包产物
- `../build/build_packages.py` —— 重新打包并自检

## 开发与测试

测试代码在仓库上一层的 `steam-insight-dev/`：

```powershell
cd ..\steam-insight-dev
node selftest.mjs            # 离线解析测试（用 fixtures 里真实抓取的页面与接口响应）
# 走代理时额外跑真实网络端到端：
$env:NODE_USE_ENV_PROXY=1; $env:HTTPS_PROXY='http://127.0.0.1:7897'
node selftest.mjs --live
```

`fixtures/` 里保存的是真实抓取数据（Steam 商店页 HTML、appdetails 响应、Deck 接口响应、AreWeAntiCheatYet 库、XGP 清单与目录、HLTB 搜索结果），所以解析逻辑的回归测试不依赖网络。
