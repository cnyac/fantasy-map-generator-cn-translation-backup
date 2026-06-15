// 把 termbase.json（受控术语表，单一事实源）同步进运行时字典 terms.json，
// 让所有「独立出现」的术语（生物群系/宗教/文化/政体类别/外交/兵种）在编辑器、
// 下拉框、图例里自动显示中文。复合名（如 "Kingdom of X"）另由生成器处理。
//
// 用法：node scripts/i18n-sync-termbase.mjs
import path from "node:path";
import {LOCALE_DIR, loadTermbase, readJson, writeSortedDict} from "./i18n-lib.mjs";

const termbase = loadTermbase();
const terms = {};
for (const [k, v] of Object.entries(termbase)) {
  if (!k.startsWith("_")) terms[k] = v;
}

const p = path.join(LOCALE_DIR, "terms.json");
const existing = readJson(p, {}) || {};
writeSortedDict(p, {...existing, ...terms});
console.log(`同步术语表 → terms.json：写入 ${Object.keys(terms).length} 条术语。`);
