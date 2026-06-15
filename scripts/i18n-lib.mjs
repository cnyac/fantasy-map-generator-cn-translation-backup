// i18n 流水线共享工具（无第三方依赖，仅 Node 内置）
import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const LOCALE = "zh-CN";
export const LOCALE_DIR = path.join(ROOT, "public", "i18n", "locales", LOCALE);
export const WORK_DIR = path.join(ROOT, "i18n-translation");
export const BATCH_DIR = path.join(WORK_DIR, "batches");
export const RETURNS_DIR = path.join(WORK_DIR, "returns");
export const TERMBASE_PATH = path.join(WORK_DIR, "termbase.json");
export const DOMAINS = ["ui", "terms", "dynamic"];

// 折叠空白、去首尾——与运行时 i18n.js 的 norm() 必须一致
export function norm(s) {
  return s == null ? "" : String(s).replace(/\s+/g, " ").trim();
}

// 解码 HTML 实体，使原文与浏览器 DOM 中的实际文本一致
const ENTITIES = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
  "&times;": "×",
  "&hellip;": "…",
  "&mdash;": "—",
  "&ndash;": "–"
};
export function decodeEntities(s) {
  return String(s).replace(/&[a-z#0-9]+;/gi, m => ENTITIES[m] ?? m);
}

// 是否值得翻译：含字母、非纯数字/符号、非纯占位符
export function isTranslatable(s) {
  const t = norm(s);
  if (!t) return false;
  if (!/[A-Za-z]/.test(t)) return false; // 无拉丁字母（纯数字/符号/已是中文）跳过
  // 已译（CJK 字符+标点占比 > 30%）→ 跳过，避免把回显的中文误当待译源
  const cjk = (t.match(/[一-鿿㐀-䶿＀-￯　-〿]/g) || []).length;
  if (cjk / t.length > 0.3) return false;
  if (/^[\s\d\W]+$/.test(t)) return false;
  if (t.length === 1) return false;
  if (/^(https?:|mailto:|\/|#|\.)/i.test(t)) return false; // URL / 路径 / 锚点
  if (/^[A-Z0-9_]+$/.test(t) && t.length <= 4) return false; // 短大写代码
  // 数字+单位（距离/面积/流量/人口缩写 — 不需翻译；\s* 兼容 "6.7Mkm²" 无空格写法）
  if (/^[\d.,]+[KMB]?(?:\s*(?:km[²2]?|m[³3]\/s|%))?$/.test(t)) return false;
  // "N of N" 进度计数
  if (/^\d+ of \d+$/.test(t)) return false;
  // 内部军队 ID (regiment12-3)
  if (/^regiment\d+-\d+$/.test(t)) return false;
  return true;
}

// 提取必须原样保留的占位符 / 变量
export function findPlaceholders(s) {
  const set = new Set();
  for (const re of [/\$\{[^}]+\}/g, /(?<![$\w])\{\{?\s*\w+\s*\}?\}/g, /%\d*\$?[sd]/g, /(?<!\w)\$\d+/g]) {
    const m = s.match(re);
    if (m) m.forEach(x => set.add(x));
  }
  return [...set];
}

// 源文本是否含需保留的 HTML 标签
export function hasHtml(s) {
  return /<[a-z!/][^>]*>/i.test(s);
}

export function readJson(p, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch (e) {
    return fallback;
  }
}

export function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), {recursive: true});
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

// 排序后写出扁平字典（键稳定，diff 友好）
export function writeSortedDict(p, dict) {
  const sorted = {};
  for (const k of Object.keys(dict).sort()) sorted[k] = dict[k];
  writeJson(p, sorted);
}

// 载入已翻译的所有 source（用于增量抽取去重）
export function loadTranslatedSources() {
  const set = new Set();
  for (const d of DOMAINS) {
    const dict = readJson(path.join(LOCALE_DIR, `${d}.json`), {});
    for (const k of Object.keys(dict || {})) if (norm(dict[k])) set.add(norm(k));
  }
  return set;
}

export function loadTermbase() {
  return readJson(TERMBASE_PATH, {}) || {};
}

// 列出 returns 收件箱里待回填的 JSON（外包 AI 翻好后放这里）
export function listReturnFiles() {
  if (!fs.existsSync(RETURNS_DIR)) return [];
  return fs
    .readdirSync(RETURNS_DIR)
    .filter(f => f.endsWith(".json"))
    .map(f => path.join(RETURNS_DIR, f))
    .sort();
}

// 列出 batches 目录下所有批次文件
export function listBatchFiles() {
  if (!fs.existsSync(BATCH_DIR)) return [];
  const out = [];
  for (const domain of fs.readdirSync(BATCH_DIR)) {
    const dir = path.join(BATCH_DIR, domain);
    if (!fs.statSync(dir).isDirectory()) continue;
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith(".json")) out.push(path.join(dir, f));
    }
  }
  return out.sort();
}
