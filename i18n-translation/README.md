# 汉化工作区（i18n-translation）

这个文件夹是中文翻译的"中转站"。下面是**你需要知道的全部**。

## 三个命令（在仓库根目录的终端里运行）

| 想做什么 | 命令 |
|---|---|
| 抽取待翻译文本（生成批次文件） | `npm run i18n:extract` |
| 校验回收的译文（不回填） | `npm run i18n:validate` |
| 回填译文进应用（含自动校验） | `npm run i18n:merge` |

> 不想敲命令启动预览？双击 `scripts/start-dev.cmd` 即可起本地服务器。

## 完整流程

1. **抽取**：`npm run i18n:extract`
   → 在 `batches/ui/` 生成 `batch-001.json`…（每批 ≤200 条待译）。

2. **派活**：把下面三样发给任意 AI（反重力 / hanakoagent / 网页版都行）：
   - `TRANSLATION_GUIDE.md`（提示词，直接粘贴）
   - 一个批次文件，如 `batches/ui/batch-001.json`
   - `termbase.json`（术语表）

   多批可以分给不同 AI 同时翻。

3. **回收**：把 AI 返回的 JSON **拖进 `returns/` 文件夹**（文件名随意，`.json` 即可）。

4. **回填**：`npm run i18n:merge`
   → 自动校验 → 通过则回填进字典 → 处理过的文件挪进 `returns/_archive/`。
   有问题会列出 `[id]`，把对应条目退回 AI 改好再放回 `returns/`。

5. **查看**：浏览器打开 `http://localhost:5173/Fantasy-Map-Generator/?locale=zh-CN` 刷新即见中文。

## 文件夹说明

| 路径 | 是什么 |
|---|---|
| `termbase.json` | **术语表**（考据锚）。改它要重跑抽取。 |
| `TRANSLATION_GUIDE.md` | 给外包 AI 的提示词。 |
| `batches/` | 抽取出的待翻译批次（发给 AI 用）。自动生成，可随时重抽。 |
| `returns/` | **← 你把 AI 翻好的 JSON 放这里。** |
| `manifest.json` | 抽取清单（共多少条、分几批）。 |

## 这套东西翻的是什么

- **界面 UI**（菜单/按钮/对话框/提示气泡）——走这套批次流水线。
- **程序生成的世界术语**（生物群系/政体/宗教…）——主要由 `termbase.json` 控制，保证全局一致。

切回英文：把浏览器地址的 `?locale=zh-CN` 去掉（或 `?locale=en`），原版不受影响。
