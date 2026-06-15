// 诊断/截图工具：用本机 Edge 打开应用，截全屏 + 报告加载状态。
// 用法：node scripts/i18n-shot.mjs [en|zh-CN]
import {chromium} from "playwright";
import path from "node:path";
import {fileURLToPath} from "node:url";

const locale = process.argv[2] || "zh-CN";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const URL = `http://localhost:5173/Fantasy-Map-Generator/?locale=${locale}`;
const outPng = path.join(ROOT, `i18n-translation`, `preview-${locale}.png`);

const browser = await chromium.launch({channel: "msedge", headless: true});
const page = await browser.newPage({viewport: {width: 1440, height: 900}});
const errors = [];
page.on("console", m => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", e => errors.push("PAGEERROR: " + e.message));

await page.goto(URL, {waitUntil: "load", timeout: 60000});
await page.waitForTimeout(2500);

// 展开右侧选项面板 + 打开一个编辑器，让 UI 文案（chrome 字体）可见
await page.evaluate(() => {
  const opt = document.getElementById("options");
  if (opt) {
    opt.style.display = "block";
    opt.style.opacity = "1";
  }
  document.getElementById("optionsTab")?.click();
  document.getElementById("editStatesButton")?.click(); // 打开国家编辑器对话框
});
await page.waitForTimeout(1200);

const state = await page.evaluate(() => {
  const loading = document.getElementById("loading");
  const svgPaths = document.querySelectorAll("#viewbox path, #viewbox g *").length;
  const bodyFont = getComputedStyle(document.body).fontFamily;
  const tab = document.getElementById("layersTab");
  const tabFont = tab ? getComputedStyle(tab).fontFamily : "-";
  const iconEl = document.querySelector('[class^="icon-"],[class*=" icon-"]');
  const iconBeforeFont = iconEl ? getComputedStyle(iconEl, "::before").fontFamily : "(无图标)";
  const labelEl = document.querySelector("#viewbox text");
  const labelFont = labelEl ? getComputedStyle(labelEl).fontFamily : "(无标签)";
  const numEl = document.querySelector('input[type="number"]');
  const numFont = numEl ? getComputedStyle(numEl).fontFamily : "(无数字框)";
  const stateNames = (typeof pack !== "undefined" && pack.states ? pack.states : [])
    .filter(s => s.i && !s.removed)
    .slice(0, 6)
    .map(s => s.fullName);
  return {
    title: document.title,
    loadingOpacity: loading ? getComputedStyle(loading).opacity : "-",
    mapElements: svgPaths,
    locale: window.FMGi18n?.locale,
    bodyFont,
    iconBeforeFont,
    labelFont,
    numFont,
    stateNames
  };
});

await page.screenshot({path: outPng, fullPage: false});
console.log(JSON.stringify(state, null, 2));
console.log("截图已存：" + path.relative(ROOT, outPng));
if (errors.length) console.log("控制台错误：\n" + errors.slice(0, 10).join("\n"));
else console.log("无控制台错误。");

await browser.close();
