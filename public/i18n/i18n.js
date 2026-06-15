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
    patternOutputs: new Set() // translateByPattern 输出过的文本，拦截 MutationObserver 二次调用
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

  function translateByPattern(text) {
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
      const cn = `${a} ${pre} ${b} ${post}`;
      if (isCCR) return "点击更改邦交。" + cn;
      return cn + "。点击查看与 " + a + " 的邦交关系";
    }

    // "List below shows relations to X"
    const LBSR = "List below shows relations to ";
    if (text.startsWith(LBSR)) return "下方列表显示与 " + text.slice(LBSR.length) + " 的邦交关系";

    // 2. 人口气泡（分号格式，来自 states/provinces/zones 编辑器）
    // [^;]+? 而非 [^;.]+?：值本身可含小数点（如 "6.7K"）
    let m = text.match(/^Total population: ([^;]+); Rural population: ([^;]+); Urban population: ([^;]+?)(?:\. (Click to change|Click to edit))?$/);
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
        if (pm) return `国家：${st} 文化：${cu} 总人口：${pm[1]}（${pm[2]}%）`;
      }
    }

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
    const hit = state.dict[key];
    if (hit !== undefined) {
      // 还原原文的首尾空白（DOM 文本节点常带缩进空白）
      const lead = (text.match(/^\s*/) || [""])[0];
      const tail = (text.match(/\s*$/) || [""])[0];
      return lead + hit + tail;
    }
    // 模板翻译（外交/人口/文化气泡）
    const patternHit = translateByPattern(key);
    if (patternHit !== null) {
      state.patternOutputs.add(norm(patternHit)); // 注册输出，防止 MutationObserver 重入
      const lead = (text.match(/^\s*/) || [""])[0];
      const tail = (text.match(/\s*$/) || [""])[0];
      return lead + patternHit + tail;
    }
    // 数字+单位 / "N of N" / 内部 ID — 不记缺键
    if (/^[\d.,]+[KMB]?(?:\s*(?:km[²2]?|m[³3]\/s|%))?$/.test(key)) return text;
    if (/^\d+ of \d+$/.test(key)) return text;
    if (/^regiment\d+-\d+$/.test(key)) return text;
    state.missing.add(key);
    return text;
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
  }

  // 翻译纯文本节点（仅当节点不含其他元素时，避免破坏结构）
  function translateTextNode(textNode) {
    const raw = textNode.nodeValue;
    if (!raw || !norm(raw)) return;
    const out = t(raw);
    if (out !== raw) textNode.nodeValue = out;
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
        }
      }
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ATTR_WHITELIST
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
