// 一次性脚本：更新批次文件里每条的 context 说明
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BATCH_DIR = path.join(ROOT, "i18n-translation", "batches", "ui");

const ROUTE_TYPES = ["sea route", "seaway", "trail", "pass", "road", "track", "path", "lane", "highway", "route", "passage"];
const ROUTE_MAP = {
  "trail": "小径", "pass": "山口", "sea route": "航路", "seaway": "航道",
  "road": "大道", "track": "辙路", "path": "小道", "lane": "水道",
  "highway": "通衢", "route": "商路", "passage": "隘道"
};
const ADJ_MAP = {
  Ancient: "古老", Ghost: "幽灵", Imperial: "帝国", Golden: "黄金",
  Mystic: "神秘", Flame: "烈焰", Arcane: "奥秘", Enchanted: "魔法",
  Dusk: "黄昏", Ebon: "乌木", Ember: "余烬", Glowing: "荧光",
  Falcon: "猎鹰", Aurora: "极光", Halcyon: "宁静", Amethyst: "紫水晶",
  Eternal: "永恒", Silver: "银色", Iron: "铁", Shadow: "暗影",
  Crystal: "水晶", Storm: "风暴", Crimson: "绯红", Emerald: "翡翠",
};

for (const fname of ["batch-001.json", "batch-002.json"]) {
  const fpath = path.join(BATCH_DIR, fname);
  const data = JSON.parse(fs.readFileSync(fpath, "utf8"));
  let changed = 0;

  data.entries = data.entries.map(e => {
    const src = e.source;

    // Regiment name
    if (/regiment/i.test(src)) {
      e.context = "军团名：序数词+括号内专名原样保留，Regiment→团";
      changed++;
      return e;
    }

    // Trade route: check suffixes longest first
    const matchedType = ROUTE_TYPES.find(t => src.toLowerCase().endsWith(t));
    if (matchedType) {
      const cn = ROUTE_MAP[matchedType];
      const prefix = src.slice(0, src.length - matchedType.length).trim();
      const adj = ADJ_MAP[prefix];
      if (adj) {
        e.context = `贸易路线名（形容词+类型）："${matchedType}"→"${cn}"，"${prefix}"→"${adj}"。target填"${adj}${cn}"`;
      } else {
        e.context = `贸易路线名：专名"${prefix}"原样保留，后缀"${matchedType}"→"${cn}"。target填"${prefix} ${cn}"`;
      }
      changed++;
      return e;
    }

    // Already has CJK / mixed
    const cjk = (src.match(/[一-鿿]/g) || []).length;
    if (cjk > 0) {
      e.context = "已含中文：target 填与 source 相同的原文（保留不动）";
      changed++;
      return e;
    }

    // City list or emoji proper noun
    if (src.includes(",") || /^\p{Emoji}/u.test(src)) {
      e.context = "专有名词：target 填与 source 相同的原文（不翻译）";
      changed++;
      return e;
    }

    // Fallback
    e.context = "运行时缺键（动态 UI）：若是奇幻专名则保留原文，普通词按中文界面习惯翻译";
    changed++;
    return e;
  });

  fs.writeFileSync(fpath, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(fname, "- updated", changed, "entries");
}
