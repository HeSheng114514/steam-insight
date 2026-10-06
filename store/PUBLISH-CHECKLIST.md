# 发布到 Chrome 应用商店 / Edge 加载项 · 操作清单

按顺序做即可。整个流程里**只有两件事必须你本人做**：注册开发者账号（涉及账号和付款），以及**自己截真实界面截图**（商店禁止用合成图冒充截图）。

---

## 第 0 步：先把这两件准备好

### A. 发布隐私政策

`store/PRIVACY.md` 里有一处 `<你的联系邮箱>` 要替换。然后把它发布到一个公开网址，最简单的两种：

- **GitHub Gist**：新建一个公开 gist，粘贴内容 → 用 gist 页面 URL。
- **GitHub Pages**：把文件放进仓库，开启 Pages → 得到 `https://<用户名>.github.io/<仓库>/PRIVACY`。

Chrome 应用商店**必填**这个 URL，没填无法提交。

### B. 注册开发者账号

| 商店 | 费用 | 要求 |
| --- | --- | --- |
| Chrome 应用商店 | **一次性 $5**（约 ¥36） | Google 账号 + 绑定信用卡 + **必须开启两步验证**（不开启无法发布） |
| Edge 加载项 | **免费** | Microsoft 账号（注册 Partner Center 时的开发者账户） |

Chrome 开发者后台：<https://chrome.google.com/webstore/devconsole>
Edge 开发者后台：<https://partner.microsoft.com/dashboard/microsoftedge>

---

## 第 1 步：打包

```powershell
cd "D:\DeepSeek-Harness\D-Steam插件（Steam 洞察）"
& 'C:\Users\Sheng\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe' build\build_packages.py
```

产出（版本号以 manifest.json 为准，下面是 1.1.0）：

```
dist\steam-insight-1.1.0-chrome.zip
dist\steam-insight-1.1.0-edge.zip
```

两个文件内容完全相同（只是名字不同），分别上传到对应后台即可。脚本自带自检，会确认：`manifest.json` 在 ZIP 根目录、manifest 引用的每个文件都在包里、没有反斜杠路径、没有把开发测试文件打进去、权限都在白名单内、DNR 规则真的注入了 Referer。**看到 `✓ 自检通过` 再上传。**

> 注意：ZIP 里**不能**再套一层 `steam-insight/` 文件夹，这是最常见的被拒原因。脚本已经处理好了。

### v1.1.0 相对 v1.0.0 的改动（提交时要一起改的地方）

| 项目 | 变化 |
| --- | --- |
| 版本号 | `1.0.0` → `1.1.0` |
| 新增权限 | `declarativeNetRequest`（**必须在隐私规范页新增一条权限用途说明**，见 `LISTING.md` 第 5.2 节） |
| 新增文件 | `src/rules.json`（DNR 规则）、`src/lib/xlsx.js` |
| 功能 | 修复通关时长取不到；新增导出 TXT 与 Excel |

**如果已经在商店上架过 1.0.0**：上传新版本后，务必去「隐私规范」页补上 `declarativeNetRequest` 的用途说明，否则可能被以「权限用途未说明」退回。

---

## 第 2 步：提交到 Chrome 应用商店

1. 进后台 → **新增项目** → 上传 `steam-insight-1.1.0-chrome.zip`。
2. **商店信息**标签页：
   - 名称、简短说明、详细说明 → 从 `store/LISTING.md` 第 1、2 节复制；
   - 类别：购物；
   - 语言：中文（简体）；
   - 商店图标 128×128 → `store-assets/icon-128.png`；
   - 屏幕截图 → 你截的 1280×800（至少 1 张，建议 4–5 张）；
   - 小型宣传图块 440×280 → `store-assets/promo-440x280.png`。
3. **隐私规范**标签页：把 `store/LISTING.md` 第 5 节的内容逐项填进去（单一用途说明 + 每个权限的用途）。数据用途全部选"否"。
4. **提交审核**。新账号通常 1–3 个工作日，遇到人工复核可能一周。

---

## 第 3 步：提交到 Edge 加载项

1. 进 Partner Center → **新建扩展** → 上传 `steam-insight-1.0.0-edge.zip`。
2. 填写：
   - 名称、简短说明、详细说明 → `store/LISTING.md` 第 1、2、3 节；
   - 类别：Shopping；
   - 搜索关键词 → 第 4 节的 7 个词，逐行填；
   - 商店 Logo 300×300 → `store-assets/logo-300x300.png`；
   - 小型宣传磁贴 440×280 → `store-assets/promo-440x280.png`；
   - 屏幕截图 → 1280×800（至少 1 张）；
   - 隐私政策 URL → 第 0 步准备的地址。
3. 提交。Edge 审核通常比 Chrome 快，1–2 个工作日。

---

## 可能的拒审原因与应对

| 风险 | 说明 | 应对 |
| --- | --- | --- |
| **权限用途说明不具体** | 最常见。写了"用于功能"等于没写 | 用 `LISTING.md` 第 5 节的表格，逐域名写清用途 |
| **`raw.githubusercontent.com` 被当成远程代码通道** | 我们只拉一份 JSON 数据，不执行任何远程代码 | 说明里已写明"仅拉取公开 JSON 数据，不加载远程代码" |
| **商标问题** | 名称含 "Steam"。这是"为某产品提供的兼容工具"的指示性使用，通常可以，但个别审核员会较真 | 图标是原创的（没有 Valve 标志），描述末尾有免责声明。若真被要求改，可改成 `Steam 洞察 · Steam Insight (Unofficial)` 或 `洞察 · Steam Insight` |
| **单一用途不清晰** | 功能看起来很多 | 审核时统一口径："汇总展示一款 Steam 游戏的购买决策信息"——都是同一用途的不同字段 |
| **截图为设计稿** | 商店明确禁止 | 必须按 `LISTING.md` 第 6 节用 DevTools 截真实界面 |
| **家庭组功能涉及登录态** | 会读取 Steam cookie | 隐私政策里已单独成段说明；设置里也提供了关闭开关，审核问起就指向这两点 |

---

## 后续更新版本

改完代码后：

1. 把 `steam-insight/manifest.json` 里的 `version` 加一位（例如 `1.0.0` → `1.0.1`）。**两个商店都拒绝用相同版本号重复上传。**
2. 重新跑 `build_packages.py` 生成新 ZIP。
3. 到后台"上传新版本"，审核通过后点发布。

---

## 文件对照表

| 文件 | 用途 |
| --- | --- |
| `dist/steam-insight-1.0.0-chrome.zip` | 上传到 Chrome 应用商店 |
| `dist/steam-insight-1.0.0-edge.zip` | 上传到 Edge 加载项 |
| `store/PRIVACY.md` | 发布成公开网址，两个商店都要填 URL |
| `store/LISTING.md` | 所有要粘贴的文案 + 截图做法 |
| `store-assets/icon-128.png` | Chrome 商店图标 128×128 |
| `store-assets/logo-300x300.png` | Edge 商店 Logo 300×300 |
| `store-assets/promo-440x280.png` | 两个商店的小型宣传图块 |
| `build/make_icons.py` | 重新生成图标与宣传图 |
| `build/build_packages.py` | 重新打包并自检 |
