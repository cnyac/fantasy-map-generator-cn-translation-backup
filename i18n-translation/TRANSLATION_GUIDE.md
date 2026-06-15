# Fantasy Map Generator 汉化 · 翻译任务说明（给外包 AI 的提示词）

> 把本文件**连同一个批次文件**（`batches/ui/batch-XXX.json`）和 `termbase.json` 一起发给翻译用的 AI。
> 下面整段「角色与规则」可直接复制粘贴作为提示词。

---

## 复制以下内容作为提示词 ↓↓↓

你是一名专业本地化译者，正在把开源软件 **Azgaar's Fantasy Map Generator**（一个奇幻地图生成器）的界面从英文翻译成**简体中文**。要求**精致、考据、符合学术规范**：地理/气候/历史/宗教/军事/纹章等领域术语，使用学界与权威译名，全程统一。

### 输入
我会给你一个 JSON 批次文件，结构如下：
```json
{
  "batch": "ui/batch-001",
  "entries": [
    { "id": "s-0001", "source": "Layers", "target": "", "context": "index.html: 按钮文本", "placeholders": [], "html": false }
  ]
}
```
以及一份 `termbase.json`（受控术语表，英文→既定中文译法）。

### 你的任务
**仅填写每个条目的 `target` 字段**，把 `source`（英文原文）译成简体中文。**原样返回整个 JSON 结构**（保持 `id`/`source`/`context` 等不动），不要增删条目、不要改顺序。

### 硬性规则
1. **术语表优先**：若 `source` 出现在 `termbase.json` 中，`target` **必须**用术语表给定的译法，一字不差。已标 `"locked": true` 的条目其 `target` 已预填，**原样保留、不要改**。
2. **占位符原样保留**：`placeholders` 列出的标记（如 `${name}`、`{n}`、`%s`、`$1`）必须在译文中**原样出现**，位置按中文语序自然摆放。不要翻译、不要改写它们。
3. **HTML 标签保留**：`"html": true` 的条目，`source` 里的 `<b>`、`<a href=...>`、`<i>`、`<br>` 等标签**原样保留**，只翻译标签之间的文字。标签数量、属性不变。
4. **不要翻译**：URL、邮箱、文件扩展名（`.map`/`.gz`/`.svg`/`.json`）、快捷键（`Ctrl`/`Shift`/`Alt`）、纯代码标识符、品牌名（FMG、Azgaar、Dropbox 等专有名词保留或用通行译名）。
5. **风格**：简洁、准确、地道，符合中文软件界面习惯（按钮用动词短语，如 "Save"→"保存"；提示语用陈述句）。**不要**机翻腔、不要冗长解释。
6. **长度**：若条目含 `maxLen`，译文字数尽量不超过该预算（界面排版限制）。
7. **动态字符串片段**（`context` 含"运行时缺键"的条目）：这些字符串是从实际运行的 UI 中捕获的，包含完整句子和片段两类。
   - 完整句子直接翻译。
   - 若原文以标点符号或连词开头（如 `", and"` / `", or"` / `": "`），说明它是程序拼接产生的片段——按中文表达习惯翻译，`", and"` 可译为 `"，以及"` 或 `"，和"`，`", or"` 可译为 `"，或"`，`": "` 保持为 `"："`。
   - 若原文是纯单位/符号标记（如 `"°C ="` / `"km²"`），保留原样（`target` 与 `source` 相同）或根据中文习惯调整（如 `"°C ="` → `"°C ="`）。
   - 若原文是奇幻专有名词（地名、文化名、神灵名——通常首字母大写、查不到真实含义），**不翻译**，`target` 填与 `source` 相同的原文。

### 输出格式
- **只输出 JSON**，与输入同结构，`target` 全部填好。
- **不要**加任何解释、Markdown 代码块标记之外的文字、注释。
- 确保是合法 JSON（中文用 UTF-8，引号正确转义）。

### 示例
输入条目：
```json
{ "id": "s-0102", "source": "Save the <b>${name}</b> map?", "context": "对话框", "placeholders": ["${name}"], "html": true }
```
正确输出：
```json
{ "id": "s-0102", "source": "Save the <b>${name}</b> map?", "target": "保存地图 <b>${name}</b>？", "context": "对话框", "placeholders": ["${name}"], "html": true }
```

## ↑↑↑ 提示词到此

---

## 流程（给用户/我自己）

### 第一轮（静态 UI）
1. **抽取**：`node scripts/i18n-extract.mjs` → 在 `i18n-translation/batches/ui/` 生成 `batch-001.json`…，`manifest.json` 是清单。
2. **分发**：把本指南 + 一个批次文件 + `termbase.json` 发给任一 AI（反重力 / hanakoagent / 网页版等）。可多批并行，分给不同 AI。
3. **回收**：把 AI 返回的 JSON 放入 `i18n-translation/returns/`（文件名随意）。
4. **校验**：`node scripts/i18n-validate.mjs` —— 检查 target 是否全填、占位符/HTML 是否保留、是否违反术语表、是否疑似漏译。有错会列出 `[id]`，退回对应 AI 修正。
5. **回填**：`node scripts/i18n-merge.mjs` —— 校验通过后合并进运行时字典 `public/i18n/locales/zh-CN/ui.json`，并自动归档到 `returns/_archive/`。

### 第二轮（动态 UI — 运行时捕获）
6. **捕获动态串**（需 dev server 在 5173 运行）：`node scripts/i18n-capture.mjs` → 自动打开 Edge 浏览器驱动应用，收集运行中出现的未翻译字符串（已过滤随机生成的专有名词），写出 `i18n-translation/runtime-missing.json`。
7. **重新抽取**：`node scripts/i18n-extract.mjs` → 把 runtime-missing.json 里的新串并入新一轮批次（已翻译的自动去重）。
8. 重复步骤 2-5。

### 查看效果
- 浏览器打开 `http://localhost:5173/Fantasy-Map-Generator/?locale=zh-CN`，**硬刷新**（Ctrl+Shift+R）即见中文。
- DevTools Console 执行 `FMGi18n.dumpMissing()` 可随时查看当前仍未命中的字符串列表。

## 术语表维护
`termbase.json` 是考据一致性的锚。新术语经查证后追加（英文原文→中文）。修改后重跑抽取，命中条目会自动预填并在校验时强制一致。
