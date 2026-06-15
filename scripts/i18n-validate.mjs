// i18n 回读校验闸门：检查外包 AI 翻回的批次文件是否合规。
// 不合规 → 打印中文错误清单 + exit 1（CI / 回填前的守门）。
//
// 用法：
//   node scripts/i18n-validate.mjs                 # 校验 returns/ 收件箱里全部回收文件
//   node scripts/i18n-validate.mjs path/to/x.json  # 校验指定文件
import path from "node:path";
import {ROOT, norm, findPlaceholders, loadTermbase, readJson, listReturnFiles} from "./i18n-lib.mjs";

const termbase = loadTermbase();
const termEntries = Object.fromEntries(Object.entries(termbase).filter(([k]) => !k.startsWith("_")));

const argFiles = process.argv.slice(2).filter(a => !a.startsWith("--"));
const files = argFiles.length ? argFiles : listReturnFiles();

if (!files.length) {
  console.log("收件箱 i18n-translation/returns/ 里没有 .json 文件。");
  console.log("把外包 AI 翻好的批次 JSON 放进该文件夹后再运行本命令。");
  process.exit(0);
}

let errors = 0;
let warnings = 0;
let checked = 0;

function report(level, file, id, msg) {
  if (level === "error") errors++;
  else warnings++;
  const tag = level === "error" ? "✗ 错误" : "! 警告";
  console.log(`${tag}  ${path.relative(ROOT, file)} [${id}] ${msg}`);
}

for (const file of files) {
  const data = readJson(file, null);
  if (!data) {
    console.log(`✗ 错误  ${path.relative(ROOT, file)} : JSON 解析失败`);
    errors++;
    continue;
  }
  const entries = Array.isArray(data) ? data : data.entries;
  if (!Array.isArray(entries)) {
    console.log(`✗ 错误  ${path.relative(ROOT, file)} : 缺 entries 数组`);
    errors++;
    continue;
  }

  for (const e of entries) {
    checked++;
    const id = e.id || e.source?.slice(0, 20) || "?";
    const src = e.source ?? "";
    const tgt = e.target ?? "";

    // 1. target 必填（locked 的也应有值）
    if (!norm(tgt)) {
      report("error", file, id, `target 为空（原文："${src}"）`);
      continue;
    }

    // 2. 占位符必须原样保留
    for (const ph of findPlaceholders(src)) {
      if (!tgt.includes(ph)) report("error", file, id, `丢失占位符 ${ph}`);
    }

    // 3. HTML 标签保留（粗检：标签数量一致）
    if (e.html) {
      const srcTags = (src.match(/<[^>]+>/g) || []).length;
      const tgtTags = (tgt.match(/<[^>]+>/g) || []).length;
      if (srcTags !== tgtTags) report("error", file, id, `HTML 标签数不一致（原 ${srcTags} / 译 ${tgtTags}）`);
    }

    // 4. 术语表强制一致
    if (Object.prototype.hasOwnProperty.call(termEntries, src) && norm(tgt) !== norm(termEntries[src])) {
      report("error", file, id, `违反术语表：应为 "${termEntries[src]}"，实为 "${tgt}"`);
    }

    // 5. 长度预算（警告）
    if (e.maxLen && [...norm(tgt)].length > e.maxLen) {
      report("warn", file, id, `超长度预算 ${e.maxLen}（实 ${[...norm(tgt)].length}）`);
    }

    // 6. 疑似漏译：译文与原文完全相同且原文含多个英文单词（警告，专有名词可忽略）
    if (norm(tgt) === norm(src) && /\s/.test(norm(src)) && /[A-Za-z].*\s.*[A-Za-z]/.test(src)) {
      report("warn", file, id, `译文与原文相同，疑似漏译："${src}"`);
    }

    // 7. 编码损坏检测：含 Unicode 替换字符 � 说明文件不是干净 UTF-8（外包 AI 存错编码）
    if (/�/.test(tgt)) {
      report("error", file, id, "译文含替换字符 �，编码损坏——请让 AI 以 UTF-8（无 BOM）重存该文件");
    }
  }
}

console.log(
  `\n校验 ${files.length} 个文件、${checked} 条：${errors} 错误，${warnings} 警告。`
);
if (errors) {
  console.log("→ 有错误，回填被拦截。请把上面 [id] 对应条目修正后重新校验。");
  process.exit(1);
} else {
  console.log("→ 全部通过，可执行 node scripts/i18n-merge.mjs 回填。");
}
