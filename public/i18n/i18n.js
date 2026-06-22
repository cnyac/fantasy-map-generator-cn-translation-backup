"use strict";
// FMG i18n 运行时翻译层 (fork-only, additive)
// ---------------------------------------------------------------------------
// 设计要点 / Design:
// - 不改写上游逻辑，只挂钩子：DOM 遍历翻译 + MutationObserver + 包装 tip()。
// - 字典是「英文原文 → 中文」的扁平 map（按领域分文件），运行时 fetch。
//   抽取流水线产出富格式批次(id/source/target)，由 i18n-merge 编译成这些扁平 map。
// - 未命中 → 原样返回英文 + 记缺键（window.FMGi18n.missing），便于迭代补批。
// - 语言状态存 localStorage("locale")；?locale=zh-CN 可强制；默认英文(原版)。
// ---------------------------------------------------------------------------

(function () {
  const STORAGE_KEY = "locale";
  const DEFAULT_LOCALE = "en";

  // 从本脚本自身 src 推导资源基址，兼容 /Fantasy-Map-Generator/ 子路径与 Netlify 根路径
  const selfSrc = (document.currentScript && document.currentScript.src) || "";
  const BASE = selfSrc.replace(/i18n\.js(?:\?.*)?$/, ""); // .../i18n/

  // 这些领域文件构成中文字典；缺某个文件不致命（容错）
  const DOMAINS = ["ui", "terms", "dynamic"];

  const state = {
    locale: resolveInitialLocale(),
    dict: Object.create(null), // { [englishSource]: chinese }
    ready: false,
    missing: new Set(), // 未命中的英文原文（去重）
    patternOutputs: new Set(), // translateByPattern 输出过的文本，拦截 MutationObserver 二次调用
    morphemes: null,           // 加载自 morphemes.json
    namesDict: Object.create(null) // 加载自 names.json
  };

  function resolveInitialLocale() {
    try {
      const q = new URLSearchParams(location.search).get("locale");
      if (q) return q;
      return localStorage.getItem(STORAGE_KEY) || DEFAULT_LOCALE;
    } catch (e) {
      return DEFAULT_LOCALE;
    }
  }

  // 规范化待查文本：折叠空白、去首尾。保留内部标点。
  function norm(s) {
    return s == null ? "" : String(s).replace(/\s+/g, " ").trim();
  }

  // ---- 模板翻译：半结构化动态字符串（外交/人口/信仰/文化气泡）---------
  // 外交关系动词表 [英文动词, 前置助词, 后置词组]
  const DIPLO_VERBS = [
    ["does not know about", "与", "互不相识"],
    ["is neutral to",       "与", "保持中立"],
    ["is friendly to",      "对", "友好"],
    ["is an ally of",       "是", "的盟友"],
    ["is a rival of",       "是", "的对手"],
    ["is suspicious of",    "对", "持猜疑态度"],
    ["is at war with",      "与", "处于战争状态"],
    ["is a vassal of",      "是", "的附庸国"],
    ["is suzerain to",      "是", "的宗主国"]
  ];

  const RELIGION_TYPE_CN = {
    "Folk religion": "民俗信仰",
    "Organized religion": "制度化宗教",
    "Cult": "崇拜",
    "Heresy": "异端"
  };

  const CULTURE_WORD_CN = {
    Elfish: "精灵",
    "Dark Elfish": "暗精灵",
    Human: "人类",
    Drakonic: "龙裔",
    Serpents: "蛇族",
    Orkish: "兽人",
    Arachnid: "蛛族",
    Dwarven: "矮人",
    Goblin: "地精",
    Era: "纪元"
  };

  const RELIGION_FORM_CN = {
    Beliefs: "信仰",
    Faith: "信仰",
    Church: "教会",
    Druidism: "德鲁伊教",
    Deities: "众神信仰",
    Gods: "众神信仰",
    Pantheon: "万神殿",
    Spirits: "精魂信仰",
    Idols: "偶像崇拜",
    Ancestors: "祖灵信仰",
    Forefathers: "先祖信仰",
    Shamanism: "萨满教",
    Animism: "万物有灵论",
    Totemism: "图腾崇拜",
    Polytheism: "多神教",
    Monotheism: "一神教",
    Heresy: "异端",
    Sect: "教派",
    Cult: "崇拜",
    Occultism: "秘教",
    Mysticism: "秘教",
    Worship: "崇拜",
    Religion: "宗教",
    Arcanum: "秘仪",
    Order: "教团"
  };

  const BURG_GROUP_CN = {
    capital: "首都",
    city: "城市",
    town: "城镇",
    village: "村庄",
    port: "港口",
    generic: "城镇"
  };

  const GROUP_NAME_CN = {
    roads: "道路",
    trails: "小径",
    searoutes: "海路",
    freshwater: "淡水湖",
    salt: "咸水湖",
    sinkhole: "陷穴湖",
    frozen: "冰湖",
    lava: "熔岩湖",
    dry: "干湖",
    capital: "首都",
    city: "城市",
    town: "城镇",
    village: "村庄",
    port: "港口",
    generic: "通用"
  };

  const GEOGRAPHIC_TYPE_CN = {
    River: "河",
    Creek: "溪",
    Brook: "溪流",
    Stream: "溪流",
    lake: "湖",
    freshwater: "淡水湖",
    salt: "咸水湖",
    frozen: "冰湖",
    lava: "熔岩湖",
    dry: "干湖"
  };

  const ROUTE_SUFFIX_CN = {
    road: "大道",
    route: "商路",
    way: "大道",
    highway: "官道",
    trail: "小径",
    path: "小径",
    track: "小道",
    pass: "隘道",
    passage: "隘道",
    "sea route": "航路",
    lane: "水道",
    seaway: "海路"
  };

  const ROUTE_WORD_CN = {
    King: "王",
    Queen: "女王",
    Military: "军",
    Old: "古",
    New: "新",
    Ancient: "古",
    Royal: "皇家",
    Imperial: "帝国",
    Great: "大",
    Grand: "宏伟",
    High: "高岭",
    Silver: "白银",
    Dragon: "龙",
    Shadow: "暗影",
    Star: "星辰",
    Mystic: "秘",
    Whisper: "低语",
    Eagle: "苍鹰",
    Golden: "黄金",
    Crystal: "水晶",
    Enchanted: "魔法",
    Frost: "霜",
    Moon: "月",
    Sun: "日",
    Thunder: "雷霆",
    Phoenix: "凤凰",
    Sapphire: "蓝宝石",
    Celestial: "天穹",
    Wandering: "流浪",
    Echo: "回声",
    Twilight: "暮光",
    Crimson: "绯红",
    Serpent: "蛇",
    Iron: "铁",
    Forest: "森林",
    Flower: "花",
    Whispering: "低语",
    Eternal: "永恒",
    Frozen: "冰封",
    Rain: "雨",
    Luminous: "光耀",
    Stardust: "星尘",
    Arcane: "奥秘",
    Glimmering: "微光",
    Jade: "翡翠",
    Ember: "余烬",
    Azure: "蔚蓝",
    Gilded: "镀金",
    Divine: "神圣",
    Shadowed: "暗影",
    Cursed: "诅咒",
    Moonlit: "月照",
    Sable: "黑貂",
    Everlasting: "永恒",
    Amber: "琥珀",
    Nightshade: "夜影",
    Wraith: "幽灵",
    Scarlet: "猩红",
    Platinum: "白金",
    Whirlwind: "旋风",
    Obsidian: "黑曜",
    Ethereal: "缥缈",
    Ghost: "鬼影",
    Spike: "尖刺",
    Dusk: "黄昏",
    Raven: "渡鸦",
    Spectral: "幽魂",
    Burning: "燃焰",
    Verdant: "翠绿",
    Copper: "赤铜",
    Velvet: "绒夜",
    Falcon: "猎鹰",
    Enigma: "谜影",
    Glowing: "荧光",
    Silvered: "银光",
    Molten: "熔火",
    Radiant: "辉光",
    Astral: "星界",
    Wild: "荒野",
    Flame: "烈焰",
    Amethyst: "紫晶",
    Aurora: "极光",
    Shadowy: "幽影",
    Solar: "太阳",
    Lunar: "月",
    Whisperwind: "低语风",
    Fading: "残光",
    Titan: "泰坦",
    Dawn: "黎明",
    Crystalline: "晶石",
    Jeweled: "宝石",
    Sylvan: "林间",
    Twisted: "扭曲",
    Ebon: "玄黑",
    Thorn: "荆棘",
    Cerulean: "天蓝",
    Halcyon: "宁和",
    Infernal: "炼狱",
    Storm: "风暴",
    Eldritch: "异界",
    Tranquil: "静谧",
    Paved: "石板",
    Shrouded: "隐雾",
    Sacred: "圣",
    Fabled: "传说",
    Frosty: "寒霜",
    Winding: "曲行",
    Echoing: "回响",
    Serpentine: "蛇行",
    Breezy: "清风",
    Misty: "雾隐",
    Rustic: "荒野",
    Silent: "寂静",
    Cobbled: "石砌",
    Cracked: "裂纹",
    Shaky: "颤地",
    Obscure: "幽隐"
  };

  const NAME_WORD_CN = {
    ...ROUTE_WORD_CN,
    Black: "黑",
    White: "白",
    Red: "赤",
    Blue: "蓝",
    Green: "绿",
    Grey: "灰",
    Gray: "灰",
    Dark: "暗",
    Light: "光",
    Deep: "深",
    Clear: "清",
    Smooth: "平滑",
    Steep: "峻",
    Little: "小",
    Small: "小",
    North: "北",
    South: "南",
    East: "东",
    West: "西",
    Upper: "上",
    Lower: "下",
    Stone: "石",
    Rock: "岩",
    Cliff: "崖",
    Crag: "峭岩",
    Hill: "丘",
    Peak: "峰",
    Mountain: "山",
    Glen: "谷",
    Dale: "谷",
    Valley: "谷",
    Vale: "谷",
    Field: "原",
    Meadow: "草甸",
    Plains: "原",
    Forest: "林",
    Wood: "林",
    Woods: "林",
    Grove: "林",
    Pine: "松",
    Oak: "橡",
    Moss: "苔",
    Thorn: "荆棘",
    Rose: "蔷薇",
    Grass: "草",
    Water: "水",
    River: "河",
    Lake: "湖",
    Sea: "海",
    Ocean: "洋",
    Bay: "湾",
    Gulf: "湾",
    Coast: "岸",
    Shore: "岸",
    Brook: "溪",
    Creek: "溪",
    Stream: "溪",
    Spring: "泉",
    Well: "泉",
    Falls: "瀑",
    Fall: "瀑",
    Mire: "沼",
    Marsh: "沼",
    Swamp: "沼",
    Mud: "泥",
    Dust: "尘",
    Salt: "盐",
    Snow: "雪",
    Ice: "冰",
    Winter: "冬",
    Autumn: "秋",
    Summer: "夏",
    Springtime: "春",
    Castle: "城堡",
    Keep: "堡",
    Fort: "堡",
    Ford: "渡",
    Bridge: "桥",
    Gate: "门",
    Wall: "墙",
    Watch: "哨",
    Guard: "卫",
    Shield: "盾",
    Helm: "盔",
    Hand: "手",
    Cross: "十字",
    Crown: "冠",
    Hall: "厅",
    Hollow: "谷",
    House: "屋",
    Home: "居",
    Haven: "港",
    Harbor: "港",
    Port: "港",
    Town: "镇",
    City: "城",
    Bury: "堡",
    Burg: "堡",
    Borough: "堡",
    Shire: "郡",
    Land: "地",
    Fair: "集",
    Market: "市",
    Mill: "磨坊",
    Mine: "矿",
    Dragon: "龙",
    Wolf: "狼",
    Bear: "熊",
    Lion: "狮",
    Swan: "天鹅",
    Hound: "猎犬",
    Dog: "犬",
    Deer: "鹿",
    Crow: "鸦",
    Raven: "渡鸦",
    Eagle: "鹰",
    Falcon: "猎鹰",
    Pearl: "珍珠",
    Gold: "金",
    Golden: "黄金",
    Silver: "银",
    Iron: "铁",
    Copper: "铜",
    Bronze: "青铜"
  };

  const PROPER_NAME_SKIP = new Set([
    "Azgaar", "Fantasy", "Map", "Generator", "Google", "Discord", "Reddit",
    "Patreon", "Facebook", "Twitter", "Pinterest", "YouTube", "Watabou"
  ]);

  const PLACE_SUFFIX_FALLBACK = ["城", "港", "堡", "谷", "津", "湾", "岭", "泽", "丘", "渡", "庄", "溪"];

  function translateNamePhrase(text) {
    const key = norm(text);
    if (!key) return text;
    const exact = state.namesDict[key] || CULTURE_WORD_CN[key];
    if (exact) return exact;

    let out = key.replace(/\(([^)]+)\)/g, (_, inner) => {
      return "（" + (CULTURE_WORD_CN[inner] || translateNamePhrase(inner)) + "）";
    });

    out = out.replace(/\b([A-Z][A-Za-z'-]{1,})\b/g, (token, word) => {
      if (PROPER_NAME_SKIP.has(word)) return token;
      if (CULTURE_WORD_CN[word]) return CULTURE_WORD_CN[word];
      if (RELIGION_FORM_CN[word]) return RELIGION_FORM_CN[word];
      if (NAME_WORD_CN[word]) return NAME_WORD_CN[word];
      const dictHit = state.namesDict[word];
      if (dictHit) return dictHit;
      const cn = translateName(word, {placeFallback: true});
      return cn || token;
    });

    return out;
  }

  function translateMixedProperNames(text) {
    const key = norm(text);
    if (!key || !/[一-鿿㐀-䶿]/.test(key) || !/[A-Z][A-Za-z'-]{1,}/.test(key)) return text;
    return text.replace(/\b([A-Z][A-Za-z'-]{1,})\b/g, (token, word) => {
      if (PROPER_NAME_SKIP.has(word)) return token;
      if (CULTURE_WORD_CN[word]) return CULTURE_WORD_CN[word];
      if (RELIGION_FORM_CN[word]) return RELIGION_FORM_CN[word];
      if (NAME_WORD_CN[word]) return NAME_WORD_CN[word];
      const dictHit = state.namesDict[word];
      if (dictHit) return dictHit;
      const cn = translateName(word, {placeFallback: true});
      return cn || token;
    });
  }

  function translateReligionName(text) {
    const key = norm(text);
    if (!key) return text;
    const exact = state.dict[key] || state.namesDict[key];
    if (exact) return exact;

    const forms = Object.keys(RELIGION_FORM_CN).sort((a, b) => b.length - a.length);
    for (const form of forms) {
      const ofThe = new RegExp("^" + form.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + " of the (.+)$").exec(key);
      if (ofThe) return `${translateNamePhrase(ofThe[1])}的${RELIGION_FORM_CN[form]}`;
    }

    for (const form of forms) {
      if (key.endsWith(" " + form)) {
        const root = key.slice(0, -(form.length + 1));
        return translateNamePhrase(root) + RELIGION_FORM_CN[form];
      }
    }

    const ism = key.match(/^(.{3,})ism$/);
    if (ism) return translateNamePhrase(ism[1]) + "教";

    return translateNamePhrase(key);
  }

  function translateRouteName(text) {
    const key = norm(text);
    if (!key) return text;
    const exact = state.namesDict[key];
    if (exact) return exact;

    const suffixes = Object.keys(ROUTE_SUFFIX_CN).sort((a, b) => b.length - a.length);
    for (const suffix of suffixes) {
      if (!key.endsWith(" " + suffix)) continue;
      let stem = key.slice(0, -(suffix.length + 1)).trim();
      if (stem.startsWith("The ")) stem = stem.slice(4);
      if (!stem) return ROUTE_SUFFIX_CN[suffix];
      const stemCn = stem.split(/\s+/).map(translateRouteToken).join("");
      return stemCn + ROUTE_SUFFIX_CN[suffix];
    }

    return null;
  }

  function localizeGeneratedName(text, kind = "place") {
    const key = norm(text);
    if (!key || /[一-鿿㐀-䶿]/.test(key) || !/[A-Za-z]/.test(key)) return text;
    if (kind === "route") return translateRouteName(key) || translateNamePhrase(key);
    return translateNamePhrase(key);
  }

  function translateRouteToken(token) {
    const clean = token.replace(/^[^\w']+|[^\w']+$/g, "");
    if (!clean) return "";
    if (ROUTE_WORD_CN[clean]) return ROUTE_WORD_CN[clean];
    const dictHit = state.dict[clean] || state.namesDict[clean];
    if (dictHit) return trimPhoneticName(dictHit, 2);
    const cn = translateName(clean);
    if (!cn || cn === clean) return clean;
    return trimPhoneticName(cn, 2);
  }

  function hashString(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function makePlaceFallback(word, phonetic) {
    const base = trimPhoneticName(phonetic, 2);
    if (!base) return phonetic;
    const suffix = PLACE_SUFFIX_FALLBACK[hashString(word) % PLACE_SUFFIX_FALLBACK.length];
    return base.endsWith(suffix) ? base : base + suffix;
  }

  function trimPhoneticName(name, maxLen) {
    const s = norm(name);
    if ([...s].length <= maxLen) return s;
    return [...s].slice(0, maxLen).join("");
  }

  function translateSemanticName(word) {
    if (!word || !/^[A-Za-z][A-Za-z'-]*$/.test(word)) return null;
    const parts = word.split(/[-']/).filter(Boolean);
    if (!parts.length) return null;

    const translated = parts.map(part => translateSemanticPart(part));
    if (!translated.some(item => item.semantic)) return null;
    return translated.map(item => item.text).join("");
  }

  function translateSemanticPart(part) {
    const roots = getSemanticRoots();
    const lower = part.toLowerCase();
    let i = 0;
    const pieces = [];
    let unknown = "";
    let semantic = 0;

    const flushUnknown = () => {
      if (!unknown) return;
      pieces.push({type: "unknown", value: unknown});
      unknown = "";
    };

    while (i < lower.length) {
      const hit = roots.find(([root]) => lower.startsWith(root, i));
      if (hit) {
        flushUnknown();
        pieces.push({type: "semantic", value: hit[1]});
        semantic++;
        i += hit[0].length;
      } else {
        unknown += part[i] || "";
        i++;
      }
    }

    flushUnknown();
    const hasSemantic = semantic > 0;
    const text = pieces.map(piece => {
      if (piece.type === "semantic") return piece.value;
      const phonetic = phoneticTranslit(piece.value);
      return hasSemantic ? trimPhoneticName(phonetic, 2) : phonetic;
    }).join("");
    return {text, semantic: hasSemantic};
  }

  let semanticRoots = null;
  function getSemanticRoots() {
    if (semanticRoots) return semanticRoots;
    const roots = [];
    for (const [word, cn] of Object.entries(NAME_WORD_CN)) roots.push([word.toLowerCase(), cn]);
    if (state.morphemes) {
      for (const [word, cn] of state.morphemes.prefixes || []) roots.push([word.toLowerCase(), cn]);
      for (const [word, cn] of state.morphemes.suffixes || []) roots.push([word.toLowerCase(), cn]);
    }
    semanticRoots = roots
      .filter(([root]) => root.length >= 3)
      .sort((a, b) => b[0].length - a[0].length);
    return semanticRoots;
  }

  function translateByPattern(text) {
    // 0. 地图悬停提示：宗教、城镇、河流等动态格式
    const religionMatch = text.match(/^(Folk religion|Organized religion|Cult|Heresy): (.+)$/);
    if (religionMatch) {
      return `${RELIGION_TYPE_CN[religionMatch[1]] || religionMatch[1]}：${translateReligionName(religionMatch[2])}`;
    }

    let m = text.match(/^(.+?) (capital|city|town|village|port|generic)\. Population: ([^.]+)\. Click to edit$/);
    if (m) {
      return `${translateNamePhrase(m[1])}${BURG_GROUP_CN[m[2]] || m[2]}。人口：${m[3]}。点击编辑`;
    }

    m = text.match(/^(.+?) (River|Creek|Brook|Stream)\. Click to edit$/);
    if (m) {
      return `${translateNamePhrase(m[1])}${GEOGRAPHIC_TYPE_CN[m[2]] || m[2]}。点击编辑`;
    }

    m = text.match(/^(.+?) (lake|freshwater|salt|frozen|lava|dry) lake\. Click to edit$/);
    if (m) {
      return `${translateNamePhrase(m[1])}${GEOGRAPHIC_TYPE_CN[m[2]] || "湖"}。点击编辑`;
    }

    m = text.match(/^(.+)\. Click to edit the Route$/);
    if (m) return `${translateRouteName(m[1]) || translateNamePhrase(m[1])}。点击编辑路线`;

    m = text.match(/^([A-Z][A-Za-z' -]{1,})\. Click to edit$/);
    if (m) return `${translateNamePhrase(m[1])}。点击编辑`;

    m = text.match(/^Click to edit the (Label|Route|Relief Icon|Marker|Burg|Ice)$/);
    if (m) {
      const nouns = {Label: "标签", Route: "路线", "Relief Icon": "地形图标", Marker: "标记", Burg: "城镇", Ice: "冰"};
      return `点击编辑${nouns[m[1]] || m[1]}`;
    }

    if (text === "Drag control points to change the route. Click on point to remove it. Click on the route to add additional control point. For major changes please create a new route instead") {
      return "拖动控制点以调整路线。点击控制点可移除；点击路线可添加控制点。如需大幅修改，请改为新建路线";
    }

    if (text === "Drag control points to change the river course. Click on point to remove it. Click on river to add additional control point. For major changes please create a new river instead") {
      return "拖动控制点以调整河道。点击控制点可移除；点击河流可添加控制点。如需大幅修改，请改为新建河流";
    }

    if (text === "Drag to move the vertex. Please use for fine-tuning only! Edit heightmap to change actual cell heights") {
      return "拖动顶点以调整位置。此功能仅适合微调；如需改变真实单元格高度，请编辑高度图";
    }

    // 1. 外交气泡（两种格式）
    const CCR = "Click to change relations. ";
    const isCCR = text.startsWith(CCR);
    const base = isCCR ? text.slice(CCR.length) : text;

    for (const [verb, pre, post] of DIPLO_VERBS) {
      const idx = base.indexOf(" " + verb + " ");
      if (idx < 0) continue;
      const a = base.slice(0, idx);
      const after = base.slice(idx + 1 + verb.length + 1);
      const dotIdx = after.indexOf(".");
      const b = dotIdx >= 0 ? after.slice(0, dotIdx) : after;
      const cn = `${translateNamePhrase(a)} ${pre} ${translateNamePhrase(b)} ${post}`;
      if (isCCR) return "点击更改邦交。" + cn;
      return cn + "。点击查看与 " + translateNamePhrase(a) + " 的邦交关系";
    }

    // "List below shows relations to X"
    const LBSR = "List below shows relations to ";
    if (text.startsWith(LBSR)) return "下方列表显示与 " + translateNamePhrase(text.slice(LBSR.length)) + " 的邦交关系";

    // 2. 人口气泡（分号格式，来自 states/provinces/zones 编辑器）
    // [^;]+? 而非 [^;.]+?：值本身可含小数点（如 "6.7K"）
    m = text.match(/^Total population: ([^;]+); Rural population: ([^;]+); Urban population: ([^;]+?)(?:\. (Click to change|Click to edit))?$/);
    if (m) {
      const suffix = m[4] ? (m[4] === "Click to edit" ? "。点击编辑" : "。点击修改") : "";
      return `总人口：${m[1].trim()}；农村人口：${m[2].trim()}；城市人口：${m[3].trim()}${suffix}`;
    }

    // 3. 人口气泡（点号格式，来自 cultures 编辑器）
    m = text.match(/^Total population: ([\d.,KMBkmb]+)\. Rural population: ([\d.,KMBkmb]+)\. Urban population: ([\d.,KMBkmb]+)\. (Click to change|Click to edit)$/);
    if (m) {
      const suffix = m[4] === "Click to edit" ? "点击编辑" : "点击修改";
      return `总人口：${m[1]}。农村人口：${m[2]}。城市人口：${m[3]}。${suffix}`;
    }

    // 4. 信众气泡（religions 编辑器）
    m = text.match(/^Believers: ([^;]+); Rural areas: ([^;]+); Urban areas: ([^;]+?)(\. Click to change)?$/);
    if (m) {
      const suffix = m[4] ? "。点击修改" : "";
      return `信众：${m[1].trim()}；农村地区：${m[2].trim()}；城镇地区：${m[3].trim()}${suffix}`;
    }

    // 5. 文化分布气泡 "State: X Culture: Y Total population: N (Z%)"
    if (text.startsWith("State: ")) {
      const ci = text.indexOf(" Culture: ");
      const ti = text.indexOf(" Total population: ");
      if (ci > 0 && ti > ci) {
        const st = text.slice(7, ci);
        const cu = text.slice(ci + 10, ti);
        const rest = text.slice(ti + 19);
        const pm = rest.match(/^([\d,]+) \((\d+)%\)$/);
        if (pm) return `国家：${translateNamePhrase(st)} 文化：${translateNamePhrase(cu)} 总人口：${pm[1]}（${pm[2]}%）`;
      }
    }

    const routeName = translateRouteName(text);
    if (routeName) return routeName;

    return null;
  }

  // 核心查表：命中→中文；未命中→尝试模板翻译→记缺键并返回原文
  function t(text) {
    if (state.locale === "en") return text;
    const key = norm(text);
    if (!key) return text;
    // 已是中文（CJK 字符+标点占比 > 30%）→ 原样返回，不记缺键
    // 包含 CJK 标点（如「。」U+3000-303F）：模板翻译输出中「。」也计入，
    // 使「点击更改邦交。Amugus 与 …」比率升至 32% 从而被正确拦截。
    const cjk = (key.match(/[一-鿿㐀-䶿　-〿]/g) || []).length;
    if (cjk / key.length > 0.3) return text;
    // 模板翻译的输出被 MutationObserver 二次触发时，直接放行
    if (state.patternOutputs.has(key)) return text;
    // 模板翻译（外交/人口/文化气泡）
    const patternHit = translateByPattern(key);
    if (patternHit !== null) {
      state.patternOutputs.add(norm(patternHit)); // 注册输出，防止 MutationObserver 重入
      const lead = (text.match(/^\s*/) || [""])[0];
      const tail = (text.match(/\s*$/) || [""])[0];
      return lead + patternHit + tail;
    }
    const hit = state.dict[key];
    if (hit !== undefined) {
      // 还原原文的首尾空白（DOM 文本节点常带缩进空白）
      const lead = (text.match(/^\s*/) || [""])[0];
      const tail = (text.match(/\s*$/) || [""])[0];
      return lead + hit + tail;
    }
    // 数字+单位 / "N of N" / 内部 ID — 不记缺键
    if (/^[\d.,]+[KMB]?(?:\s*(?:km[²2]?|m[³3]\/s|%))?$/.test(key)) return text;
    if (/^\d+ of \d+$/.test(key)) return text;
    if (/^regiment\d+-\d+$/.test(key)) return text;
    if (/^#[0-9a-f]{3,8}$/i.test(key)) return text;
    if (/^[A-Za-z]$/.test(key)) return text;
    if (/^[%()+*/.^|~°×÷•⇇⇈⇉⇊⇒≤►◄❓🔊👑-]$/.test(key)) return text;
    if (/^[xyXYn]：$/.test(key)) return text;
    if (/^\.\w+$/.test(key)) return text;
    if (/^\d+°$/.test(key)) return text;
    if (/^[\w.-]+\.[a-z]{2,}(?:\/.*)?$/i.test(key)) return text;
    if (/^[A-Z][A-Za-z'-]{1,}$/.test(key) && !PROPER_NAME_SKIP.has(key)) {
      const named = translateName(key, {placeFallback: true});
      if (named && named !== key) return named;
    }
    state.missing.add(key);
    return text;
  }

  // ---- 专名词根翻译（SVG 地图固有名词：州名/城市名/路线名）--------------

  // 检测节点是否在 SVG 地图元素内（map labels 都在 <svg id="svg"> 里）
  function isInsideSvg(node) {
    let el = node.nodeType === 3 ? node.parentNode : node;
    while (el && el !== document.body) {
      if (el.tagName && el.tagName.toLowerCase() === "svg") return true;
      el = el.parentNode;
    }
    return false;
  }

  // 音节音译：把剩余 Latin 部分按最长匹配拼成汉字（以 morphemes.phonetic 为表）
  function phoneticTranslit(text) {
    if (!text || !state.morphemes) return text;
    const table = state.morphemes.phonetic;
    const s = text.toLowerCase();
    let result = "";
    let i = 0;
    while (i < s.length) {
      let matched = false;
      const maxLen = Math.min(4, s.length - i);
      for (let len = maxLen; len >= 1; len--) {
        const chunk = s.slice(i, i + len);
        // 线性查表（表已按长度降序排列）
        for (const [pat, cn] of table) {
          if (pat.length === len && pat === chunk) {
            result += cn;
            i += len;
            matched = true;
            break;
          }
          if (pat.length < len) break;
        }
        if (matched) break;
      }
      if (!matched) i++; // 跳过无法匹配的字符
    }
    return result;
  }

  // 专名翻译主函数：词根匹配（前缀/后缀）+ 音译回退
  function translateName(word, options = {}) {
    if (!word || !state.morphemes) return null;

    // 1. 手动覆盖词典优先
    const override = state.namesDict[word] || state.namesDict[norm(word)];
    if (override) return override;

    // 2. 全局半意译：识别词内可理解词根，未知片段短音译
    const semantic = translateSemanticName(word);
    if (semantic) return semantic;

    const suffixes = state.morphemes.suffixes;
    const prefixes = state.morphemes.prefixes;
    let remaining = word;
    let prefixCn = "";
    let suffixCn = "";

    // 3. 前缀匹配（表已按长度降序）
    for (const [pat, cn] of prefixes) {
      if (remaining.length > pat.length &&
          remaining.slice(0, pat.length).toLowerCase() === pat.toLowerCase()) {
        prefixCn = cn;
        remaining = remaining.slice(pat.length);
        break;
      }
    }

    // 4. 后缀匹配（表已按长度降序）
    // 有前缀时允许 remaining 恰好等于后缀（如 Neu+burg→新+堡）；
    // 无前缀时要求后缀前至少还有 1 个字母（避免把 "Berg" 整体视为后缀）
    for (const [pat, cn] of suffixes) {
      const minLen = prefixCn ? pat.length : pat.length + 1;
      if (remaining.length >= minLen &&
          remaining.slice(-pat.length).toLowerCase() === pat.toLowerCase()) {
        suffixCn = cn;
        remaining = remaining.slice(0, -pat.length);
        break;
      }
    }

    // 5. 剩余部分音译
    const midCn = phoneticTranslit(remaining);
    if (!midCn && !prefixCn && !suffixCn) return null;

    // 6. 纯音译最多 4 字；有前后缀词根时保留词根并裁剪中段
    if (!prefixCn && !suffixCn && options.placeFallback) return makePlaceFallback(word, midCn);

    const MAX_LEN = prefixCn || suffixCn ? 5 : 4;
    const full = prefixCn + midCn + suffixCn;
    if (full.length <= MAX_LEN) return full;
    const budget = MAX_LEN - prefixCn.length - suffixCn.length;
    if (budget <= 0) return (prefixCn + suffixCn).slice(0, MAX_LEN);
    return prefixCn + midCn.slice(0, budget) + suffixCn;
  }

  // ---- 字典加载 ----------------------------------------------------------
  async function loadDict(locale) {
    const dict = Object.create(null);
    if (locale === "en") return dict;
    await Promise.all(
      DOMAINS.map(async domain => {
        try {
          const url = `${BASE}locales/${locale}/${domain}.json`;
          const res = await fetch(url, {cache: "no-cache"});
          if (!res.ok) return;
          const data = await res.json();
          for (const k in data) dict[norm(k)] = data[k];
        } catch (e) {
          /* 容错：缺域文件不阻断 */
        }
      })
    );
    // 加载词根表和手动覆盖词典（失败不阻断）
    await Promise.all([
      fetch(`${BASE}locales/${locale}/morphemes.json`, {cache: "no-cache"})
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (d) {
            state.morphemes = d;
            semanticRoots = null;
          }
        })
        .catch(() => {}),
      fetch(`${BASE}locales/${locale}/names.json`, {cache: "no-cache"})
        .then(r => r.ok ? r.json() : null)
        .then(d => {
          if (!d) return;
          for (const k in d) {
            if (k.startsWith("_")) continue;
            state.namesDict[k] = d[k];
            dict[norm(k)] = d[k]; // 同时注入主词典，支持 t() 直接命中
          }
        })
        .catch(() => {})
    ]);
    return dict;
  }

  // ---- DOM 翻译遍历 ------------------------------------------------------
  // 翻译的属性白名单（这些属性的值是给人看的文案）
  const ATTR_WHITELIST = ["data-tip", "placeholder", "title", "aria-label", "data-t"];
  // 这些标签内部不翻译（脚本/样式/SVG 几何/用户内容）
  const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "CODE"]);
  const TRANSLATED_FLAG = "__fmgI18nDone";

  function shouldSkip(node) {
    let el = node.nodeType === 3 ? node.parentNode : node;
    while (el && el.nodeType === 1) {
      if (SKIP_TAGS.has(el.tagName)) return true;
      if (el.isContentEditable) return true;
      el = el.parentNode;
    }
    return false;
  }

  // 翻译单个元素的属性
  function translateAttrs(el) {
    if (el.nodeType !== 1) return;
    for (const attr of ATTR_WHITELIST) {
      if (!el.hasAttribute(attr)) continue;
      const val = el.getAttribute(attr);
      const out = t(val);
      if (out !== val) el.setAttribute(attr, out);
    }
    // <option> / button[value] 文案
    if (el.tagName === "INPUT" && (el.type === "button" || el.type === "submit")) {
      const out = t(el.value);
      if (out !== el.value) el.value = out;
    }
    if (el.tagName === "INPUT") translateGeneratedInputValue(el);
    if (el.tagName === "OPTION") translateOptionText(el);
  }

  function translateGeneratedInputValue(el) {
    if (document.activeElement === el) return;
    const routeInput = el.id === "routeName";
    const placeNameInput = /^(lake|river|burg|marker|label|route)Name$/.test(el.id);
    const literal = {
      lakeInlets: {no: "无"},
      lakeOutlet: {no: "无"},
      riverType: {River: "河", Creek: "溪", Brook: "溪流", Stream: "溪流"}
    }[el.id];
    if (literal && literal[el.value]) {
      el.value = literal[el.value];
      if (el.id === "riverType") el.dispatchEvent(new Event("input", {bubbles: true}));
      return;
    }
    const generatedNameInput = ["riverBasin"].includes(el.id);
    if (el.id !== "mapName" && el.id !== "eraInput" && !routeInput && !placeNameInput && !generatedNameInput) return;
    const value = norm(el.value);
    if (!value || /[一-鿿㐀-䶿]/.test(value) || !/[A-Za-z]/.test(value)) return;
    const out = routeInput ? localizeGeneratedName(value, "route") : localizeGeneratedName(value);
    if (out && out !== value) {
      el.value = out;
      if (el.id === "eraInput" && window.options) window.options.era = out;
      if (placeNameInput || el.id === "riverType") el.dispatchEvent(new Event("input", {bubbles: true}));
    }
  }

  function translateOptionText(el) {
    const raw = el.textContent;
    const key = norm(raw);
    if (!key || /[一-鿿㐀-䶿]/.test(key)) return;
    let out = GROUP_NAME_CN[key] || t(raw);
    if (out === raw && /^[A-Z][A-Za-z'-]{1,}(?:\s+\([A-Za-z ]+\))?$/.test(key)) {
      out = raw.replace(key, translateNamePhrase(key));
    }
    if (out !== raw) el.textContent = out;
  }

  function scanGeneratedFormValues() {
    if (state.locale === "en") return;
    ["mapName", "eraInput", "routeName", "lakeName", "riverName", "riverType", "riverBasin", "burgName", "markerName", "labelName", "lakeInlets", "lakeOutlet"].forEach(id => {
      const el = document.getElementById(id);
      if (el) translateGeneratedInputValue(el);
    });
    document.querySelectorAll("#routeGroup option, #routeCreatorGroupSelect option, #lakeGroup option, #burgGroup option, #riverMainstem option").forEach(translateOptionText);
  }

  // 翻译纯文本节点（仅当节点不含其他元素时，避免破坏结构）
  function translateTextNode(textNode) {
    const raw = textNode.nodeValue;
    if (!raw || !norm(raw)) return;

    // 处理键盘快捷键模式：<label><u>B</u>iomes</label> 或 <label>Bor<u>D</u>ers</label>
    // 问题：TreeWalker 把 "iomes"/"Bor" 当独立文本节点翻译，且先清空前置节点后
    //       后续节点读到的 parent.textContent 已残缺（"BorDers"→"Ders"，查不到 "Borders"）。
    // 方案：首次遇到快捷键父元素时，在 DOM 修改前把完整 key 和译文存入 data-i18n-sc；
    //       同时把 <u> 内容小写化后重试（处理大写快捷键字母，如 <u>D</u> 在 "Borders" 里）。
    const parent = textNode.parentNode;
    if (parent && parent.nodeType === 1 && !SKIP_TAGS.has(parent.tagName)) {
      const siblings = Array.from(parent.childNodes);
      const hasShortcutU = siblings.some(
        n => n.nodeName === "U" && norm(n.textContent || "").length <= 2
      );
      if (hasShortcutU) {
        const ATTR = "data-i18n-sc";
        let stored = parent.getAttribute(ATTR);
        if (stored === null) {
          // 首次：在修改 DOM 前计算，并缓存到 attribute
          const raw2 = norm(parent.textContent || "");
          let hit = state.dict[raw2];
          if (hit === undefined) {
            // 大写快捷键回退：把 <u> 内容小写后重拼（"BorDers" → "Borders"）
            const lower = norm(
              siblings.map(n =>
                n.nodeName === "U"
                  ? (n.textContent || "").toLowerCase()
                  : n.nodeType === 3 ? n.nodeValue || "" : ""
              ).join("")
            );
            if (lower !== raw2) hit = state.dict[lower];
          }
          stored = hit !== undefined ? hit : "";
          parent.setAttribute(ATTR, stored);
        }
        if (stored) {
          const textSiblings = siblings.filter(
            n => n.nodeType === 3 && norm(n.nodeValue || "").length > 0
          );
          const isLast =
            textSiblings.length > 0 &&
            textSiblings[textSiblings.length - 1] === textNode;
          if (isLast) {
            const lead = (raw.match(/^\s*/) || [""])[0];
            const tail = (raw.match(/\s*$/) || [""])[0];
            textNode.nodeValue = lead + stored + tail;
            // 翻译成功后隐藏快捷键字母（纯视觉，不影响快捷键功能）
            for (const sib of siblings) {
              if (sib.nodeName === "U") sib.style.display = "none";
            }
          } else {
            textNode.nodeValue = (raw.match(/^\s*/) || [""])[0];
          }
          return;
        }
      }
    }

    // SVG 地图专名翻译：对 SVG 内以大写开头的纯字母单词（固有名词）做词根+音译
    if (state.morphemes && isInsideSvg(textNode)) {
      const trimmed = norm(raw);
      // 单词：仅字母/连字符/撇号，首字母大写，≥2 字符
      if (/^[A-Z][a-zA-Z'-]{1,}$/.test(trimmed)) {
        const cn = state.namesDict[trimmed] || translateName(trimmed, {placeFallback: true}) || state.dict[trimmed];
        if (cn) {
          const lead = (raw.match(/^\s*/) || [""])[0];
          const tail = (raw.match(/\s*$/) || [""])[0];
          textNode.nodeValue = lead + cn + tail;
          return;
        }
      }
      // 多词组合（如 "Helia Kingdom" 在同一文本节点时）：逐词翻译
      if (/^[A-Z][a-zA-Z'-]+(?:\s+[A-Z][a-zA-Z'-]+)+$/.test(trimmed)) {
        const parts = trimmed.split(/\s+/).map(w => {
          const dictHit = state.namesDict[norm(w)];
          if (dictHit) return dictHit;
          if (/^[A-Z][a-zA-Z'-]{1,}$/.test(w)) return translateName(w, {placeFallback: true}) || w;
          return w;
        });
        const combined = parts.join(" ");
        if (combined !== trimmed) {
          const lead = (raw.match(/^\s*/) || [""])[0];
          const tail = (raw.match(/\s*$/) || [""])[0];
          textNode.nodeValue = lead + combined + tail;
        }
        return;
      }
      // 半英半中兜底（如 "Jeonguk 王国"）：SVG 标签已被部分翻译，拉丁名段未命中
      const mixedM = trimmed.match(/^([A-Z][a-zA-Z'-]{1,})(\s+[一-鿿㐀-䶿].*)$/);
      if (mixedM) {
        const latinCn = translateName(mixedM[1], {placeFallback: true});
        if (latinCn && latinCn !== mixedM[1]) {
          const lead = (raw.match(/^\s*/) || [""])[0];
          const tail = (raw.match(/\s*$/) || [""])[0];
          textNode.nodeValue = lead + latinCn + mixedM[2] + tail;
        }
      }
    }

    const mixedOut = translateMixedProperNames(raw);
    if (mixedOut !== raw) {
      textNode.nodeValue = mixedOut;
      return;
    }

    const out = t(raw);
    if (out !== raw) {
      textNode.nodeValue = out;
      return;
    }
  }

  // 遍历子树：属性 + 文本节点
  function translateSubtree(root) {
    if (!root || state.locale === "en") return;
    if (root.nodeType === 1) {
      if (shouldSkip(root)) return;
      translateAttrs(root);
    }
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
      {
        acceptNode(node) {
          if (node.nodeType === 1) {
            if (SKIP_TAGS.has(node.tagName)) return NodeFilter.FILTER_REJECT;
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );
    let n;
    while ((n = walker.nextNode())) {
      if (n.nodeType === 1) translateAttrs(n);
      else translateTextNode(n);
    }
  }

  // ---- 钩子：包装中央 tip()（覆盖所有提示气泡 + 地图悬浮提示）------------
  function installTipHook() {
    if (typeof window.tip !== "function" || window.tip[TRANSLATED_FLAG]) return false;
    const orig = window.tip;
    const wrapped = function (text, main, type, time) {
      return orig.call(this, t(text), main, type, time);
    };
    wrapped[TRANSLATED_FLAG] = true;
    window.tip = wrapped;
    return true;
  }

  // ---- MutationObserver：动态注入节点入 DOM 即翻译 ----------------------
  let observer = null;
  function startObserver() {
    if (observer || state.locale === "en") return;
    observer = new MutationObserver(mutations => {
      for (const m of mutations) {
        if (m.type === "childList") {
          m.addedNodes.forEach(node => {
            if (node.nodeType === 1) translateSubtree(node);
            else if (node.nodeType === 3) translateTextNode(node);
          });
        } else if (m.type === "attributes" && m.target.nodeType === 1) {
          if (ATTR_WHITELIST.includes(m.attributeName)) translateAttrs(m.target);
        } else if (m.type === "characterData" && m.target.nodeType === 3) {
          // SVG 标签可能经由 textNode.data 直接写入（如 D3 的 .text()），
          // childList 不触发，需在此兜底
          if (state.morphemes && isInsideSvg(m.target)) translateTextNode(m.target);
        }
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ATTR_WHITELIST,
      characterData: true
    });
  }

  function stopObserver() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  // ---- 初始化与公共 API --------------------------------------------------
  async function applyLocale(locale) {
    state.locale = locale;
    if (locale === "en") {
      stopObserver();
      state.ready = true;
      // 切回英文需刷新页面才能完全还原（已写入 DOM 的中文不回滚）
      return;
    }
    state.dict = await loadDict(locale);
    state.ready = true;
    installTipHook();
    translateSubtree(document.body);
    startObserver();
    // 补扫：FMG 初始地图可能在 dict 加载期间异步渲染，characterData 观察上线前已入 DOM
    setTimeout(() => translateSubtree(document.body), 800);
    setTimeout(() => translateSubtree(document.body), 2000);
    setTimeout(scanGeneratedFormValues, 300);
    setInterval(scanGeneratedFormValues, 1500);
  }

  function setLocale(locale) {
    try {
      localStorage.setItem(STORAGE_KEY, locale);
    } catch (e) {}
    // 简化：切换语言刷新页面，保证干净状态
    location.reload();
  }

  window.FMGi18n = {
    t,
    localizeGeneratedName,
    translateNamePhrase,
    get locale() {
      return state.locale;
    },
    setLocale,
    applyLocale,
    get missing() {
      return Array.from(state.missing).sort();
    },
    // 导出缺键为可直接喂给翻译流水线的草稿（英文原文列表）
    dumpMissing() {
      const list = Array.from(state.missing).sort();
      console.log(JSON.stringify(list, null, 2));
      return list;
    },
    _state: state
  };

  // ---- 语言切换按钮（悬浮在右下角）--------------------------------------
  function injectSwitcher() {
    if (document.getElementById("fmgI18nSwitcher")) return;
    const isCn = state.locale !== "en";
    const btn = document.createElement("button");
    btn.id = "fmgI18nSwitcher";
    btn.title = isCn ? "Switch to English" : "切换到中文";
    btn.textContent = isCn ? "EN" : "中";
    Object.assign(btn.style, {
      position: "fixed", bottom: "10px", right: "10px", zIndex: "9999",
      width: "34px", height: "34px", borderRadius: "50%",
      background: isCn ? "#1a1a2e" : "#c8a96e",
      color: isCn ? "#c8a96e" : "#1a1a2e",
      border: "1.5px solid currentColor",
      fontSize: "12px", fontWeight: "bold", cursor: "pointer",
      fontFamily: "sans-serif", lineHeight: "1", padding: "0",
      opacity: "0.75", transition: "opacity 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,.4)"
    });
    btn.onmouseenter = () => { btn.style.opacity = "1"; };
    btn.onmouseleave = () => { btn.style.opacity = "0.75"; };
    btn.onclick = () => setLocale(isCn ? "en" : "zh-CN");
    document.body.appendChild(btn);
  }

  // tip() 在 general.js (defer) 里定义；本脚本作为最后一个 defer 脚本，
  // 此刻 general.js 已执行，可直接包装。再在 DOMContentLoaded 兜底一次。
  function boot() {
    applyLocale(state.locale);
    injectSwitcher();
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
