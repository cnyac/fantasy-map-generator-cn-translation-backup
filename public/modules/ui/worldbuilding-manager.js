"use strict";

const WorldbuildingManager = (() => {
  const statuses = {
    Draft: "草稿",
    Ready: "待定稿",
    Canon: "正史",
    "Needs work": "需补完"
  };

  const stateForms = {
    Duchy: "公国",
    "Grand Duchy": "大公国",
    Principality: "亲王国",
    Kingdom: "王国",
    Empire: "帝国",
    Marches: "边区",
    Dominion: "自治领",
    Protectorate: "保护国",
    Khanate: "汗国",
    Beylik: "贝伊国",
    Tsardom: "沙皇国",
    Khaganate: "可汗国",
    Shogunate: "幕府",
    Caliphate: "哈里发国",
    Emirate: "埃米尔国",
    Despotate: "专制君主国",
    Ulus: "兀鲁思",
    Horde: "游牧汗国",
    Satrapy: "总督辖区",
    Republic: "共和国",
    Federation: "联邦",
    "Trade Company": "贸易公司",
    "Most Serene Republic": "最尊贵共和国",
    Oligarchy: "寡头国",
    Tetrarchy: "四头政体",
    Triumvirate: "三头政体",
    Diarchy: "二头政体",
    Junta: "军政府",
    "Free City": "自由城邦",
    "City-state": "城邦",
    Union: "联盟",
    League: "同盟",
    Confederation: "邦联",
    "United Kingdom": "联合王国",
    "United Republic": "联合共和国",
    "United Provinces": "联合省",
    Commonwealth: "共和国联邦",
    Heptarchy: "七国联盟",
    Theocracy: "神权国",
    Brotherhood: "兄弟会",
    Thearchy: "神治国",
    See: "圣座",
    "Holy State": "圣国",
    Diocese: "教区",
    Bishopric: "主教国",
    Eparchy: "东正教教区",
    Exarchate: "总主教辖区",
    Patriarchate: "牧首区",
    Imamah: "伊玛目国",
    "Free Territory": "自由地区",
    Council: "议会国",
    Commune: "公社",
    Community: "社区"
  };

  const types = {
    states: {
      title: "国家",
      notePrefix: "state",
      fields: ["ruler", "history"],
      labels: ["统治者 / 权力结构", "历史"],
      getItems: () =>
        pack.states
          .filter(s => s.i && !s.removed)
          .map(s => ({
            key: `state:${s.i}`,
            type: "state",
            id: s.i,
            name: localizeName(s.fullName || s.name),
            context: `${localizeStateForm(s.formName || s.form || "国家")}；首都：${localizeName(pack.burgs[s.capital]?.name || "无")}`,
            noteId: `state${s.i}`,
            locate: () => highlightElement(regions.select("#state" + s.i).node(), 4)
          }))
    },
    burgs: {
      title: "城镇",
      fields: ["ruler", "economy"],
      labels: ["统治者 / 重要人物", "经济 / 分区"],
      getItems: () =>
        pack.burgs
          .filter(b => b.i && !b.removed)
          .map(b => ({
            key: `burg:${b.i}`,
            type: "burg",
            id: b.i,
            name: localizeName(b.name),
            context: `${localizeName(pack.states[b.state]?.name || "中立")}；${localizeName(pack.cultures[b.culture]?.name || "无文化")}`,
            noteId: `burg${b.i}`,
            locate: () => zoomTo(b.x, b.y, 8, 1000)
          }))
    },
    cultures: {
      title: "文化",
      fields: ["origins", "customs"],
      labels: ["起源", "习俗 / 审美"],
      getItems: () =>
        pack.cultures
          .filter(c => c.i && !c.removed)
          .map(c => ({
            key: `culture:${c.i}`,
            type: "culture",
            id: c.i,
            name: localizeName(c.name),
            context: `${c.type || "通用"}；名字库：${nameBases[c.base]?.name || "无"}`,
            noteId: `culture${c.i}`,
            locate: () => {
              const center = pack.cells.p[c.center];
              if (center) zoomTo(center[0], center[1], 6, 1000);
            }
          }))
    },
    religions: {
      title: "宗教",
      fields: ["doctrine", "holySites"],
      labels: ["教义 / 禁忌", "圣地 / 组织"],
      getItems: () =>
        pack.religions
          .filter(r => r.i && !r.removed)
          .map(r => ({
            key: `religion:${r.i}`,
            type: "religion",
            id: r.i,
            name: localizeName(r.name),
            context: `${r.type || "宗教"}；形式：${r.form || "无"}；神祇：${localizeName(r.deity || "无")}`,
            noteId: `religion${r.i}`,
            locate: () => {
              const center = pack.cells.p[r.center];
              if (center) zoomTo(center[0], center[1], 6, 1000);
            }
          }))
    }
  };

  let activeType = "states";
  let activeKey = null;
  let rows = [];

  function open() {
    closeDialogs("#worldbuildingManager, .stable");
    ensureStore();
    render();

    $("#worldbuildingManager").dialog({
      title: "世界观管理器",
      width: Math.min(window.innerWidth * 0.92, 1180),
      height: Math.min(window.innerHeight * 0.82, 760),
      resizable: true,
      position: {my: "center", at: "center", of: "svg"}
    });

    if (modules.worldbuildingManager) return;
    modules.worldbuildingManager = true;
    addListeners();
  }

  function ensureStore() {
    if (!worldbuilding || typeof worldbuilding !== "object") worldbuilding = {};
    if (!worldbuilding.version) worldbuilding.version = 1;
    if (!worldbuilding.entities) worldbuilding.entities = {};
  }

  function addListeners() {
    document.querySelectorAll(".worldbuildingTab").forEach(tab => tab.addEventListener("click", changeType));
    ensureEl("worldbuildingSearch").addEventListener("input", renderRows);
    ensureEl("worldbuildingRefresh").addEventListener("click", render);
    ensureEl("worldbuildingExport").addEventListener("click", exportData);
    ensureEl("worldbuildingRows").addEventListener("click", handleRowsClick);
    ensureEl("worldbuildingRows").addEventListener("change", updateSelectedCount);
    ensureEl("worldbuildingBulkApply").addEventListener("click", applyBulk);
    ensureEl("worldbuildingStatus").addEventListener("change", updateStatus);
    ensureEl("worldbuildingLocate").addEventListener("click", locateActive);
    ensureEl("worldbuildingOpenNotes").addEventListener("click", openLinkedNotes);
    ensureEl("worldbuildingForm").addEventListener("input", updateField);
  }

  function changeType() {
    activeType = this.dataset.type;
    activeKey = null;
    document.querySelectorAll(".worldbuildingTab").forEach(tab => tab.classList.toggle("pressed", tab === this));
    render();
  }

  function render() {
    ensureStore();
    rows = types[activeType].getItems();
    renderRows();
    renderDetails(null);
  }

  function renderRows() {
    const query = ensureEl("worldbuildingSearch").value.trim().toLowerCase();
    const filtered = rows.filter(item => !query || getSearchText(item).includes(query));
    const html = filtered.map(getRowHtml).join("");
    ensureEl("worldbuildingRows").innerHTML = html || `<div class="worldbuildingNoRows italic">没有匹配条目</div>`;

    const completed = rows.filter(item => getCompletion(item) === 100).length;
    ensureEl("worldbuildingFooter").innerHTML =
      `${types[activeType].title}：显示 ${filtered.length} / ${rows.length}，已完成 ${completed}`;
    updateSelectedCount();
  }

  function getRowHtml(item) {
    const data = getData(item.key);
    const tags = (data.tags || []).join(", ");
    const complete = getCompletion(item);
    const selected = item.key === activeKey ? " selected" : "";
    const name = escapeHtml(item.name);
    const context = escapeHtml(item.context);
    const status = escapeHtml(statuses[data.status] || data.status || "");
    const tagText = escapeHtml(tags);
    return /* html */ `<div class="worldbuildingRow${selected}" data-key="${item.key}">
      <div class="worldbuildingSelectCell"><input type="checkbox" class="worldbuildingSelect native" data-key="${item.key}" /></div>
      <div class="worldbuildingName" title="${name}">${name}</div>
      <div title="${context}">${context}</div>
      <div>${status}</div>
      <div>${tagText}</div>
      <div>${complete}%</div>
    </div>`;
  }

  function getSearchText(item) {
    const data = getData(item.key);
    return [item.name, item.context, data.status, data.summary, data.notes, ...(data.tags || [])].join(" ").toLowerCase();
  }

  function getData(key) {
    ensureStore();
    if (!worldbuilding.entities[key]) worldbuilding.entities[key] = {status: "Draft", tags: []};
    if (!Array.isArray(worldbuilding.entities[key].tags)) {
      worldbuilding.entities[key].tags = parseTags(worldbuilding.entities[key].tags);
    }
    return worldbuilding.entities[key];
  }

  function getCompletion(item) {
    const data = getData(item.key);
    const fields = ["summary", ...types[activeType].fields, "notes"];
    const filled = fields.filter(field => String(data[field] || "").trim()).length;
    return Math.round((filled / fields.length) * 100);
  }

  function handleRowsClick(event) {
    if (event.target.classList.contains("worldbuildingSelect")) return;
    const row = event.target.closest(".worldbuildingRow");
    if (!row) return;
    activeKey = row.dataset.key;
    renderRows();
    renderDetails(rows.find(item => item.key === activeKey));
  }

  function renderDetails(item) {
    ensureEl("worldbuildingEmpty").style.display = item ? "none" : "block";
    ensureEl("worldbuildingForm").style.display = item ? "block" : "none";
    if (!item) return;

    const data = getData(item.key);
    const config = types[activeType];
    ensureEl("worldbuildingEntityName").textContent = item.name;
    ensureEl("worldbuildingEntityMeta").textContent = " " + item.context;
    ensureEl("worldbuildingStatus").innerHTML = Object.entries(statuses)
      .map(([status, label]) => `<option value="${status}" ${data.status === status ? "selected" : ""}>${label}</option>`)
      .join("");
    ensureEl("worldbuildingTags").value = (data.tags || []).join(", ");
    ensureEl("worldbuildingSummary").value = data.summary || "";
    setTextarea("worldbuildingFieldA", "worldbuildingFieldALabel", config.fields[0], config.labels[0], data);
    setTextarea("worldbuildingFieldB", "worldbuildingFieldBLabel", config.fields[1], config.labels[1], data);
    ensureEl("worldbuildingNotes").value = data.notes || "";
  }

  function setTextarea(inputId, labelId, field, label, data) {
    const input = ensureEl(inputId);
    input.dataset.field = field;
    input.value = data[field] || "";
    ensureEl(labelId).querySelector("span").textContent = label + ":";
  }

  function updateField(event) {
    const field = event.target.dataset.field;
    if (!activeKey || !field) return;
    const data = getData(activeKey);
    data[field] = field === "tags" ? parseTags(event.target.value) : event.target.value;
    updateActiveRow();
  }

  function updateStatus() {
    if (!activeKey) return;
    getData(activeKey).status = this.value;
    updateActiveRow();
  }

  function updateActiveRow() {
    const item = rows.find(item => item.key === activeKey);
    const row = document.querySelector(`#worldbuildingRows .worldbuildingRow[data-key="${CSS.escape(activeKey)}"]`);
    if (!item || !row) return;

    const data = getData(activeKey);
    const cells = row.querySelectorAll(":scope > div");
    cells[3].textContent = statuses[data.status] || data.status || "";
    cells[4].textContent = (data.tags || []).join(", ");
    cells[5].textContent = getCompletion(item) + "%";

    const completed = rows.filter(item => getCompletion(item) === 100).length;
    ensureEl("worldbuildingFooter").innerHTML =
      `${types[activeType].title}：显示 ${rows.length} / ${rows.length}，已完成 ${completed}`;
  }

  function updateSelectedCount() {
    const count = document.querySelectorAll("#worldbuildingRows .worldbuildingSelect:checked").length;
    ensureEl("worldbuildingSelectedCount").textContent = count;
  }

  function applyBulk() {
    const selected = Array.from(document.querySelectorAll("#worldbuildingRows .worldbuildingSelect:checked")).map(
      input => input.dataset.key
    );
    if (!selected.length) return tip("请先选择要更新的条目", false, "error");

    const tags = parseTags(ensureEl("worldbuildingBulkTags").value);
    const status = ensureEl("worldbuildingBulkStatus").value;
    selected.forEach(key => {
      const data = getData(key);
      if (tags.length) data.tags = unique([...(data.tags || []), ...tags]);
      if (status) data.status = status;
    });

    ensureEl("worldbuildingBulkTags").value = "";
    ensureEl("worldbuildingBulkStatus").value = "";
    renderRows();
    if (activeKey) renderDetails(rows.find(item => item.key === activeKey));
    tip(`已更新 ${selected.length} 个世界观条目`, false, "success");
  }

  function parseTags(value) {
    if (Array.isArray(value)) return value.map(tag => String(tag).trim()).filter(Boolean);
    return String(value || "")
      .split(",")
      .map(tag => tag.trim())
      .filter(Boolean);
  }

  function locateActive() {
    const item = rows.find(item => item.key === activeKey);
    if (!item) return;
    item.locate();
  }

  function openLinkedNotes() {
    const item = rows.find(item => item.key === activeKey);
    if (!item) return;
    editNotes(item.noteId, item.name);
  }

  function exportData() {
    const data = JSON.stringify(worldbuilding, null, 2);
    downloadFile(data, getFileName("世界观") + ".json");
  }

  function localizeName(name) {
    return window.FMGi18n?.localizeGeneratedName?.(name) || window.FMGi18n?.translateNamePhrase?.(name) || name;
  }

  function localizeStateForm(form) {
    if (stateForms[form]) return stateForms[form];
    if (form?.startsWith("Divine ") && stateForms[form.slice(7)]) return `神权${stateForms[form.slice(7)]}`;
    return window.FMGi18n?.t?.(form) || form;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  return {open};
})();

function openWorldbuildingManager() {
  WorldbuildingManager.open();
}
