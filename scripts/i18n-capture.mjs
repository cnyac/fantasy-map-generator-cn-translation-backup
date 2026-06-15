// 第二轮抽取的「动态字符串采集器」：用本机 Edge 驱动应用，自动打开各编辑器/菜单/对话框，
// 让运行时拼接的 UI 文案都渲染出来，收集 i18n 引擎记录的「缺键」，再用地图真实数据
// 过滤掉随机生成的专有名词（国名/城镇/河流/文化名等不该翻），写出 runtime-missing.json。
// 之后跑 npm run i18n:extract 即把这些动态字符串并入待翻批次。
//
// 用法：node scripts/i18n-capture.mjs   （需 dev server 已在 5173 运行）
import {chromium} from "playwright";
import path from "node:path";
import {fileURLToPath} from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const URL = "http://localhost:5173/Fantasy-Map-Generator/?locale=zh-CN";
const OUT = path.join(ROOT, "i18n-translation", "runtime-missing.json");

const browser = await chromium.launch({channel: "msedge", headless: true});
const page = await browser.newPage({viewport: {width: 1600, height: 1000}});
page.on("dialog", d => d.dismiss().catch(() => {})); // 关掉可能弹出的原生确认框
await page.goto(URL, {waitUntil: "load", timeout: 60000});
await page.waitForTimeout(5000); // FMG 需要时间完成地图生成

// 在页面里逐个触发 UI：展开选项面板各标签页 + 点击所有「打开编辑器/总览」按钮，
// 每个对话框渲染后等一下再关掉，让缺键收集器记录到它们的文案。
const opened = await page.evaluate(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  let count = 0;

  // 1) 主面板各标签页
  const opt = document.getElementById("options");
  if (opt) {
    opt.style.display = "block";
    opt.style.opacity = "1";
  }
  for (const id of ["layersTab", "styleTab", "optionsTab", "toolsTab", "aboutTab"]) {
    document.getElementById(id)?.click();
    await sleep(120);
  }

  // 2) 所有「打开 XXX 编辑器/总览」按钮（含工具菜单里的）
  const triggers = document.querySelectorAll(
    'button[data-tip^="Click to open"], button[data-tip^="Click to see"], button[data-tip*="Editor"], button[data-tip*="Overview"]'
  );
  for (const btn of triggers) {
    try {
      btn.click(); // 直接触发 handler，不受可见性限制
      count++;
      await sleep(180);
      // 关掉刚打开的 jQuery UI 对话框，避免层层堆叠卡死
      if (typeof closeDialogs === "function") closeDialogs();
      await sleep(60);
    } catch (e) {
      /* 某些编辑器无数据会报错，跳过 */
    }
  }

  // 3) 工具菜单里的功能按钮（非编辑器类）
  const toolBtns = document.querySelectorAll("#toolsContent button, #customization button");
  for (const btn of toolBtns) {
    try {
      btn.click();
      count++;
      await sleep(120);
      if (typeof closeDialogs === "function") closeDialogs();
      await sleep(40);
    } catch (e) {}
  }
  return count;
});

await page.waitForTimeout(800);

// 收集缺键 + 用地图真实数据过滤专有名词
const result = await page.evaluate(() => {
  const missing = window.FMGi18n?.missing || [];

  // 收集所有生成的专有名词（不该翻）
  const names = new Set();
  const add = s => s && names.add(String(s).trim());
  const P = typeof pack !== "undefined" ? pack : {};
  for (const key of ["states", "burgs", "provinces", "cultures", "religions", "rivers", "markers", "zones"]) {
    const arr = P[key];
    if (!Array.isArray(arr)) continue;
    for (const o of arr) {
      if (!o) continue;
      add(o.name);
      add(o.fullName);
    }
  }

  // 过滤：去掉与专有名词完全相同的项
  const filtered = missing.filter(m => !names.has(m));
  return {total: missing.length, properNouns: names.size, kept: filtered.length, list: filtered};
});

await browser.close();

const fs = await import("node:fs");
fs.writeFileSync(OUT, JSON.stringify(result.list, null, 2) + "\n", "utf8");
console.log(`打开了交互元素，采集缺键 ${result.total} 条`);
console.log(`过滤掉 ${result.total - result.kept} 条专有名词（基于 ${result.properNouns} 个生成名）`);
console.log(`保留 ${result.kept} 条动态 UI 字符串 → ${path.relative(ROOT, OUT)}`);
console.log(`下一步：npm run i18n:extract（会把它们并入待翻批次）`);
