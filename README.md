# Fantasy Map Generator 中文增强版

这是 [Azgaar's Fantasy Map Generator](https://github.com/Azgaar/Fantasy-Map-Generator) 的中文本地化增强分支。原项目是一个免费的开源奇幻地图生成器，适合世界观创作者、跑团主持人、小说作者、游戏策划和地图爱好者用来生成、编辑和导出奇幻世界地图。

本分支的目标不是重做 Fantasy Map Generator，而是让中文读者可以更顺手地使用它：打开就是中文界面，地图上的国家、城镇、路线、政体、地理和军事术语尽量符合中文语境，同时保留原项目完整的生成、编辑和导出能力。

## 致谢原项目

本项目基于 Azgaar 开发和维护的开源项目：

- 原项目仓库：[Azgaar/Fantasy-Map-Generator](https://github.com/Azgaar/Fantasy-Map-Generator)
- 原版在线应用：[azgaar.github.io/Fantasy-Map-Generator](https://azgaar.github.io/Fantasy-Map-Generator)
- 原项目 Wiki：[Fantasy Map Generator Wiki](https://github.com/Azgaar/Fantasy-Map-Generator/wiki)

感谢 Azgaar 和社区长期维护这个强大的地图生成器。本分支保留原项目的 MIT License，所有核心生成能力、地图编辑能力和大量原始资源均来自上游项目。

## 本分支做了什么

当前中文化工作主要覆盖这些方向：

- **中文界面**：菜单、按钮、工具提示、弹窗、编辑器、导出和保存流程等 UI 文案已接入简体中文运行时字典。
- **中文地图视觉**：地图上的国家、城镇、路线等 SVG 标签会在中文模式下自动转写或翻译，减少英文专名混杂。
- **术语统一**：为地理、气候、政体、宗教、军事、纹章等领域维护术语表，尽量避免同一个概念在不同面板里有多种译法。
- **动态文本处理**：人口、外交关系、文化分布等运行时生成的提示语通过模板翻译，不再依赖固定样例。
- **翻译流水线**：提供抽取、校验、回填流程，方便继续批量补全未翻译文本。
- **中文启动器**：提供双击启动入口，方便不熟悉前端命令的用户本地预览中文地图。

## 快速启动

推荐方式：双击仓库根目录下的 `start-map.cmd`。

它会启动本地开发服务器，并打开中文页面：

```text
http://localhost:5173/Fantasy-Map-Generator/?locale=zh-CN
```

也可以用命令启动：

```bash
npm install
npm run dev:zh
```

如果只想启动原始开发服务器：

```bash
npm run dev
```

## 切换语言

中文模式地址带有：

```text
?locale=zh-CN
```

去掉这个参数，或改成 `?locale=en`，即可回到英文原版界面。页面右下角也有语言切换按钮。

## 翻译工作流

翻译中转目录在 `i18n-translation/`。常用命令：

| 任务 | 命令 |
|---|---|
| 抽取待翻译文本 | `npm run i18n:extract` |
| 校验回收译文 | `npm run i18n:validate` |
| 回填译文到应用 | `npm run i18n:merge` |
| 同步术语表 | `npm run i18n:terms` |

更详细的翻译规则、术语要求和 AI 批量翻译提示词见：

- `i18n-translation/README.md`
- `i18n-translation/TRANSLATION_GUIDE.md`
- `i18n-translation/termbase.json`

## 当前状态

这个分支仍在持续打磨中。主要界面和首屏地图已经可以中文使用，但仍可能看到：

- 少量英文品牌名、文件格式名或链接名，这些通常会保留原文；
- 部分深层编辑器、动态弹窗或旧样例文本仍待补译；
- 随机生成的奇幻专名偶尔不够自然，需要继续优化词根和音译规则。

欢迎继续反馈具体页面、按钮、弹窗或地图标签中的不自然译法。最好附上截图、原文或复现步骤。

## 面向开发者

本项目仍沿用上游架构，正在从 vanilla JavaScript 逐步迁移到 TypeScript。当前代码大体分为：

- world data / styles：地图数据和样式状态；
- generators：程序化世界生成；
- editors / controllers：交互式编辑器；
- renderers：SVG、WebGL 等视觉渲染。

中文化逻辑主要集中在：

- `public/i18n/i18n.js`
- `public/i18n/locales/zh-CN/`
- `i18n-translation/`
- `scripts/i18n-*.mjs`

## License

本分支继承原项目的 MIT License。请同时尊重并保留原项目作者与社区的署名、许可证和相关链接。
