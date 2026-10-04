# fixtures

回归测试用的真实抓取数据，**不入库**（`.gitignore` 已排除 `*.html` 与 `*.json`）。

原因：其中的 Steam 商店页 HTML 是 Valve 的页面内容（约 1 MB），不适合放进公开仓库。

克隆仓库后执行：

```bash
node fetch_fixtures.mjs    # 抓回这些数据
node selftest.mjs          # 再跑测试
```

## 每个文件是什么

| 文件 | 内容 |
| --- | --- |
| `t_full.json` | `appdetails` 响应（App 1245620，国区简中，带 filters） |
| `deck.json` | Steam Deck 兼容性接口响应 |
| `eldenring.html` | 艾尔登法环商店页（**无** D 加密，作为反例） |
| `wukong.html` | 黑神话：悟空商店页（**有** Denuvo） |
| `agecheck.html` | 年龄验证页（用于验证"能识别出被门槛挡住"） |
| `protondb_elden.json` | ProtonDB 评分摘要 |
| `xgp_sigls.json` | 微软 Game Pass PC 全量清单（约 556 条 ID） |
| `xgp_detail.json` | 微软展示目录响应（取前 3 条用于测试解析） |
| `awacy_games.json` | AreWeAntiCheatYet 反作弊数据库（约 1167 条） |
| `hltb_search.json` | HowLongToBeat 搜索响应 |

`eldenring.html` 与 `wukong.html` 互为反例，是验证 D 加密识别逻辑的关键：前者读不出 Denuvo，后者能读出 `包含第三方 DRM: Denuvo`。
