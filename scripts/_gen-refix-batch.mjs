// 生成 batch-refix-001.json：126条需重译的路线名
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const UI_PATH = path.join(ROOT, "public", "i18n", "locales", "zh-CN", "ui.json");
const OUT_PATH = path.join(ROOT, "i18n-translation", "batches", "ui", "batch-refix-001.json");

const ROUTE_SUFFIXES = ["sea route", "seaway", "trail", "pass", "road", "track", "path", "lane", "highway", "route", "passage"];
const ROUTE_CN = {
  "trail": "小径", "pass": "山口", "sea route": "航路", "seaway": "航道",
  "road": "大道", "track": "辙路", "path": "小道", "lane": "水道",
  "highway": "通衢", "route": "商路", "passage": "隘道"
};

// 英语普通词 → 中文意译
const DICT = {
  Dragon: "龙", Phoenix: "凤凰", Dusk: "黄昏", Ember: "余烬",
  Enchanted: "魔法", Eternal: "永恒", Falcon: "猎鹰", Flame: "烈焰",
  Glowing: "荧光", Golden: "黄金", Halcyon: "宁静", Lunar: "月",
  Moonlit: "月照", Platinum: "白金", Royal: "皇家", Sable: "黑貂",
  Scarlet: "绯红", Shadow: "暗影", Silver: "银", Silvered: "银光",
  Star: "星", Sun: "日", Sylvan: "林间", Breezy: "清风", Cracked: "裂纹",
  Echoing: "回响", Fabled: "传说", Frosty: "霜冻", Ancient: "古",
  Ghost: "幽灵", Imperial: "帝国", Amber: "琥珀", Forest: "林",
  Mystic: "神秘", Reich: "帝国", Imbrian: "英布里安", // 此条半音译
};

const ui = JSON.parse(fs.readFileSync(UI_PATH, "utf8"));

const bad = Object.entries(ui).filter(([k, v]) => {
  const lower = k.toLowerCase();
  return ROUTE_SUFFIXES.some(s => lower.endsWith(s)) && /[A-Za-z]/.test(v);
});

const entries = bad.map(([source, wrongTarget], i) => {
  const id = `rf-${String(i + 1).padStart(3, "0")}`;
  const suffix = ROUTE_SUFFIXES.find(s => source.toLowerCase().endsWith(s));
  const cnSuffix = ROUTE_CN[suffix] ?? suffix;

  // 复合名：The X Y Z suffix
  if (source.startsWith("The ")) {
    const inner = source.slice(4, source.length - suffix.length).trim(); // "Breezy Falcon"
    const words = inner.split(/\s+/);
    const translated = words.map(w => DICT[w] ? `[${DICT[w]}]` : `[音译:${w}→2字]`).join("");
    return {
      id,
      source,
      target: "",
      wrong_target: wrongTarget,
      context: `复合路线名全译：逐词译为中文，后缀"${suffix}"→"${cnSuffix}"。` +
        `词义参考：${words.map(w => `"${w}"${DICT[w] ? "→" + DICT[w] : "（音译取2字）"}`).join("、")}。` +
        `示例风格："The Frosty Aurora lane"→"寒霜极光水道"。总字数≤5字。`,
      placeholders: [],
      html: false,
    };
  }

  // 普通名：prefix + suffix
  const prefix = suffix ? source.slice(0, source.length - suffix.length).trim() : source;
  const dictCn = DICT[prefix];

  if (dictCn) {
    // A类：英语普通词，意译
    return {
      id,
      source,
      target: "",
      wrong_target: wrongTarget,
      context: `意译路线名："${prefix}"是普通英语词，意思是"${dictCn}"，` +
        `后缀"${suffix}"→"${cnSuffix}"。译为"${dictCn}${cnSuffix}"（${(dictCn + cnSuffix).length}字）。`,
      placeholders: [],
      html: false,
    };
  }

  // B类：奇幻专名，音译缩短至2-3字
  return {
    id,
    source,
    target: "",
    wrong_target: wrongTarget,
    context: `音译路线名："${prefix}"是奇幻专名，取发音音译为2-3个汉字（不可超3字），` +
      `后缀"${suffix}"→"${cnSuffix}"。总字数≤5字。` +
      `错误示范（专名未音译）：${wrongTarget}。` +
      `正确风格："Amphan trail"→"安凡小径"（音译取2字），"Abeming pass"→"阿贝明山口"（音译取3字）。`,
    placeholders: [],
    html: false,
  };
});

const batch = {
  batch: "ui/batch-refix-001",
  locale: "zh-CN",
  guide: "见 i18n-translation/TRANSLATION_GUIDE.md。这是重译批次——wrong_target是错误译法（专名未音译/字数过长），请按context说明重新翻译，只填target；wrong_target字段不要改。",
  count: entries.length,
  entries,
};

fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(batch, null, 2) + "\n", "utf8");
console.log(`生成 ${OUT_PATH}`);
console.log(`共 ${entries.length} 条`);

// 统计
const cCompound = entries.filter(e => e.context.startsWith("复合")).length;
const cDict = entries.filter(e => e.context.startsWith("意译")).length;
const cFantasy = entries.filter(e => e.context.startsWith("音译")).length;
console.log(`  复合名(全译): ${cCompound}`);
console.log(`  意译普通词: ${cDict}`);
console.log(`  音译奇幻专名: ${cFantasy}`);
