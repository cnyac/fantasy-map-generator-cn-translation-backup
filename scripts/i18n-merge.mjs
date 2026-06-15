// i18n 回填：把 returns/ 收件箱里（校验通过的）译文合并进运行时字典
// public/i18n/locales/zh-CN/*.json，然后把处理过的文件归档到 returns/_archive/。
// 先跑校验；有错则中止（除非 --force）。幂等。
//
// 用法：node scripts/i18n-merge.mjs [--force]
import fs from "node:fs";
import {execFileSync} from "node:child_process";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {ROOT, LOCALE_DIR, RETURNS_DIR, DOMAINS, norm, readJson, writeSortedDict, listReturnFiles} from "./i18n-lib.mjs";

const force = process.argv.includes("--force");
const here = path.dirname(fileURLToPath(import.meta.url));

const files = listReturnFiles();
if (!files.length) {
  console.log("收件箱 i18n-translation/returns/ 里没有 .json 文件，没什么可回填的。");
  process.exit(0);
}

// 1. 先校验（除非 --force）
if (!force) {
  try {
    execFileSync(process.execPath, [path.join(here, "i18n-validate.mjs")], {stdio: "inherit"});
  } catch (e) {
    console.log("校验未通过，回填中止（修正后重试，或加 --force 强行回填）。");
    process.exit(1);
  }
}

// 2. 域：取批次文件里的 batch 字段首段（ui/terms/dynamic），缺省 ui
function domainOf(data) {
  const top = String(data?.batch || "").split("/")[0];
  return DOMAINS.includes(top) ? top : "ui";
}

const byDomain = {};
let merged = 0;
for (const file of files) {
  const data = readJson(file, null);
  const entries = Array.isArray(data) ? data : data?.entries;
  if (!Array.isArray(entries)) continue;
  const domain = domainOf(data);
  byDomain[domain] ??= {};
  for (const e of entries) {
    const src = norm(e.source);
    const tgt = norm(e.target);
    if (src && tgt) {
      byDomain[domain][src] = tgt;
      merged++;
    }
  }
}

// 3. 与现有字典合并写回（保留旧译，新译覆盖同键）
for (const [domain, dict] of Object.entries(byDomain)) {
  const p = path.join(LOCALE_DIR, `${domain}.json`);
  const existing = readJson(p, {}) || {};
  const out = {...existing, ...dict};
  writeSortedDict(p, out);
  console.log(`回填 ${domain}.json：本次 ${Object.keys(dict).length} 条，合并后共 ${Object.keys(out).length} 条`);
}

// 4. 归档已处理文件，避免重复回填
const archive = path.join(RETURNS_DIR, "_archive");
fs.mkdirSync(archive, {recursive: true});
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
for (const file of files) {
  const dest = path.join(archive, `${stamp}__${path.basename(file)}`);
  fs.renameSync(file, dest);
}

console.log(`完成，共回填 ${merged} 条译文，${files.length} 个文件已归档到 returns/_archive/。`);
console.log("浏览器 ?locale=zh-CN 刷新即可见效。");
