// i18n 抽取：扫描待译 UI 字符串 → 分批、可翻译 JSON（供外包 AI 填 target）
//
// 来源：
//   1) src/index.html —— data-tip/placeholder/title/aria-label 属性 + button/option/label/标题 文本
//   2) i18n-translation/runtime-missing.json（可选）—— 运行时缺键 dump，补静态扫不到的动态串
// 处理：规范化 → 过滤不可译 → 去重 → 去掉已翻译 → termbase 命中预填并锁定 → 分批写出
//
// 用法：node scripts/i18n-extract.mjs [--batch-size 200]
import fs from "node:fs";
import path from "node:path";
import {
  ROOT,
  WORK_DIR,
  BATCH_DIR,
  LOCALE,
  norm,
  decodeEntities,
  isTranslatable,
  findPlaceholders,
  hasHtml,
  readJson,
  writeJson,
  loadTranslatedSources,
  loadTermbase,
  listReturnFiles
} from "./i18n-lib.mjs";

const args = process.argv.slice(2);
const batchSize = Number(args[args.indexOf("--batch-size") + 1]) || 200;

// ---- 1. 从 index.html 抽取候选（source, context）----------------------------
function extractFromIndexHtml() {
  const html = fs.readFileSync(path.join(ROOT, "src", "index.html"), "utf8");
  const found = []; // {source, context}
  const push = (raw, context) => {
    const s = decodeEntities(norm(raw));
    if (isTranslatable(s)) found.push({source: s, context});
  };

  // 属性值
  const attrRe = /\b(data-tip|placeholder|title|aria-label)\s*=\s*"([^"]+)"/g;
  let m;
  while ((m = attrRe.exec(html))) push(m[2], `index.html: ${m[1]} 属性`);

  // 元素纯文本（不含嵌套标签的简单情形）
  const textPatterns = [
    [/<option\b[^>]*>([^<]+)<\/option>/g, "下拉选项"],
    [/<button\b[^>]*>([^<]*?)<\/button>/g, "按钮文本"],
    [/<label\b[^>]*>([^<]+)<\/label>/g, "标签"],
    [/<legend\b[^>]*>([^<]+)<\/legend>/g, "分组标题"],
    [/<summary\b[^>]*>([^<]+)<\/summary>/g, "折叠标题"],
    [/<th\b[^>]*>([^<]+)<\/th>/g, "表头"],
    [/<(h[1-6])\b[^>]*>([^<]+)<\/\1>/g, "标题"]
  ];
  for (const [re, label] of textPatterns) {
    while ((m = re.exec(html))) {
      const raw = re.source.includes("h[1-6]") ? m[2] : m[1];
      push(raw, `index.html: ${label}`);
    }
  }
  return found;
}

// ---- 2. 运行时缺键 dump（可选）---------------------------------------------
function extractFromRuntimeMissing() {
  const p = path.join(WORK_DIR, "runtime-missing.json");
  const list = readJson(p, null);
  if (!Array.isArray(list)) return [];
  return list
    .map(s => decodeEntities(norm(s)))
    .filter(isTranslatable)
    .map(source => ({source, context: "运行时缺键（动态 UI）"}));
}

// ---- 主流程 ----------------------------------------------------------------
const candidates = [...extractFromIndexHtml(), ...extractFromRuntimeMissing()];

const translated = loadTranslatedSources();
const termbase = loadTermbase();
const termSet = new Set(Object.keys(termbase).filter(k => !k.startsWith("_")));

// 按 source 去重，保留首个 context
const bySource = new Map();
for (const c of candidates) {
  if (translated.has(c.source)) continue; // 已翻译，跳过
  if (!bySource.has(c.source)) bySource.set(c.source, c.context);
}

const entries = [];
let idx = 0;
let lockedCount = 0;
for (const [source, context] of bySource) {
  const isTerm = termSet.has(source);
  if (isTerm) lockedCount++;
  entries.push({
    id: `s-${String(++idx).padStart(4, "0")}`,
    source,
    target: isTerm ? termbase[source] : "",
    context,
    placeholders: findPlaceholders(source),
    html: hasHtml(source),
    ...(isTerm ? {locked: true} : {})
  });
}

// 锁定的术语排前面（外包 AI 一眼看到既定译法做参照），其余按原文排序
entries.sort((a, b) => Number(Boolean(b.locked)) - Number(Boolean(a.locked)) || a.source.localeCompare(b.source));
entries.forEach((e, i) => (e.id = `s-${String(i + 1).padStart(4, "0")}`));

// 安全闸：若 returns/ 收件箱里还有没回填的译文，提醒先 merge（避免重复派活）
const pendingReturns = listReturnFiles();
if (pendingReturns.length && !args.includes("--force")) {
  console.error(
    `中止：收件箱 returns/ 里还有 ${pendingReturns.length} 个文件没回填。\n` +
      `请先 node scripts/i18n-merge.mjs 回填，再重抽（或加 --force 忽略）。`
  );
  process.exit(1);
}

// 分批写出到 batches/ui/
fs.rmSync(BATCH_DIR, {recursive: true, force: true});
const domain = "ui";
const batches = [];
for (let i = 0; i < entries.length; i += batchSize) {
  const slice = entries.slice(i, i + batchSize);
  const name = `batch-${String(batches.length + 1).padStart(3, "0")}`;
  const file = path.join(BATCH_DIR, domain, `${name}.json`);
  writeJson(file, {
    batch: `${domain}/${name}`,
    locale: LOCALE,
    guide: "见 i18n-translation/TRANSLATION_GUIDE.md。只填每条的 target；locked:true 的条目不要改。",
    count: slice.length,
    entries: slice
  });
  batches.push({batch: `${domain}/${name}`, count: slice.length, file: path.relative(ROOT, file)});
}

writeJson(path.join(WORK_DIR, "manifest.json"), {
  locale: LOCALE,
  generatedAt: new Date().toISOString(),
  totalStrings: entries.length,
  lockedFromTermbase: lockedCount,
  toTranslate: entries.length - lockedCount,
  batchSize,
  batches
});

console.log(`抽取完成：${entries.length} 条待译（其中 ${lockedCount} 条由术语表预填锁定，${entries.length - lockedCount} 条需翻译）`);
console.log(`分 ${batches.length} 批，每批 ≤${batchSize} 条 → ${path.relative(ROOT, BATCH_DIR)}/${domain}/`);
console.log(`清单：${path.relative(ROOT, path.join(WORK_DIR, "manifest.json"))}`);
