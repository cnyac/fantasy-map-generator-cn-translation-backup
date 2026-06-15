// 临时冒烟测试：用本机 Edge 验证 i18n 运行时翻译是否生效。
// 用法：node scripts/i18n-smoke.mjs  （需 dev server 已在 5173 运行）
// 注：这是验证脚手架，验证通过后可删。
import {chromium} from "playwright";

const URL = "http://localhost:5173/Fantasy-Map-Generator/?locale=zh-CN";

const browser = await chromium.launch({channel: "msedge", headless: true});
const page = await browser.newPage();
const errors = [];
page.on("console", m => {
  if (m.type() === "error") errors.push(m.text());
});

await page.goto(URL, {waitUntil: "networkidle", timeout: 60000});
await page.waitForTimeout(1500); // 等 i18n boot + DOM 翻译

const result = await page.evaluate(() => {
  const txt = id => document.getElementById(id)?.textContent?.trim();
  return {
    locale: window.FMGi18n?.locale,
    dictReady: window.FMGi18n?._state?.ready,
    layersTab: txt("layersTab"),
    styleTab: txt("styleTab"),
    optionsTab: txt("optionsTab"),
    toolsTab: txt("toolsTab"),
    aboutTab: txt("aboutTab"),
    layersTip: document.getElementById("layersTab")?.getAttribute("data-tip"),
    exportTip: document.getElementById("exportButton")?.getAttribute("data-tip"),
    tipWrapped: typeof window.tip === "function" && !!window.tip.__fmgI18nDone,
    missingCount: window.FMGi18n?.missing?.length
  };
});

console.log(JSON.stringify(result, null, 2));
if (errors.length) console.log("PAGE ERRORS:\n" + errors.slice(0, 10).join("\n"));

await browser.close();
