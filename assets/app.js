/*
 * DOI XML Repair
 * Hak cipta (c) 2026 Ikhwan Arief (ikhwan[at]unand.ac.id).
 * Aplikasi ini dapat digunakan oleh publik berdasarkan lisensi Creative
 * Commons Attribution-NonCommercial (CC BY-NC) untuk tujuan nonkomersial
 * dengan atribusi yang jelas kepada pembuat.
 */

const state = {
  pyodide: null,
  analyzeXml: null,
  repairXml: null,
  oldText: "",
  newText: "",
  oldAnalysis: null,
  newAnalysis: null,
  outputXml: "",
};

const els = {
  oldXmlInput: document.querySelector("#oldXmlInput"),
  newXmlInput: document.querySelector("#newXmlInput"),
  oldFileName: document.querySelector("#oldFileName"),
  newFileName: document.querySelector("#newFileName"),
  oldSummary: document.querySelector("#oldSummary"),
  newSummary: document.querySelector("#newSummary"),
  mappingStatus: document.querySelector("#mappingStatus"),
  mappingTable: document.querySelector("#mappingTable"),
  mappingBody: document.querySelector("#mappingBody"),
  generateButton: document.querySelector("#generateButton"),
  resetButton: document.querySelector("#resetButton"),
  outputInfo: document.querySelector("#outputInfo"),
  xmlOutput: document.querySelector("#xmlOutput"),
  copyButton: document.querySelector("#copyButton"),
  downloadButton: document.querySelector("#downloadButton"),
};

document.addEventListener("DOMContentLoaded", () => {
  if (window.lucide) {
    window.lucide.createIcons();
  }
  bindEvents();
  bootPython();
});

function bindEvents() {
  els.oldXmlInput.addEventListener("change", () => handleFileChange("old"));
  els.newXmlInput.addEventListener("change", () => handleFileChange("new"));
  els.generateButton.addEventListener("click", generateXml);
  els.resetButton.addEventListener("click", resetApp);
  els.copyButton.addEventListener("click", copyOutput);
  els.downloadButton.addEventListener("click", downloadOutput);
}

async function bootPython() {
  try {
    state.pyodide = await loadPyodide();
    const response = await fetch("doi_xml_repair.py", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("doi_xml_repair.py tidak dapat dimuat.");
    }
    const pythonCode = await response.text();
    await state.pyodide.runPythonAsync(pythonCode);
    state.analyzeXml = state.pyodide.globals.get("analyze_xml_json");
    state.repairXml = state.pyodide.globals.get("repair_xml_json");
    els.oldXmlInput.disabled = false;
    els.newXmlInput.disabled = false;
  } catch (error) {
    setNotice(
      els.mappingStatus,
      `Runtime Python gagal dimuat: ${cleanError(error)}`,
      "error",
    );
  }
}

async function handleFileChange(kind) {
  const input = kind === "old" ? els.oldXmlInput : els.newXmlInput;
  const fileName = kind === "old" ? els.oldFileName : els.newFileName;
  const summary = kind === "old" ? els.oldSummary : els.newSummary;
  const file = input.files?.[0];

  clearOutput();
  if (!file) {
    if (kind === "old") {
      state.oldText = "";
      state.oldAnalysis = null;
      fileName.textContent = "Pilih file XML lama";
    } else {
      state.newText = "";
      state.newAnalysis = null;
      fileName.textContent = "Pilih file XML baru";
    }
    summary.className = "summary muted";
    summary.textContent = "Belum ada file.";
    renderMapping();
    return;
  }

  fileName.textContent = file.name;
  try {
    const xmlText = await file.text();
    const analysis = JSON.parse(state.analyzeXml(xmlText));
    if (kind === "old") {
      state.oldText = xmlText;
      state.oldAnalysis = analysis;
    } else {
      state.newText = xmlText;
      state.newAnalysis = analysis;
    }
    renderSummary(summary, analysis);
  } catch (error) {
    if (kind === "old") {
      state.oldText = "";
      state.oldAnalysis = null;
    } else {
      state.newText = "";
      state.newAnalysis = null;
    }
    summary.className = "summary";
    summary.innerHTML = `<div class="notice error">${escapeHtml(cleanError(error))}</div>`;
  }
  renderMapping();
}

function renderSummary(container, analysis) {
  const warnings = analysis.warnings?.length
    ? `<div class="notice warn">${escapeHtml(analysis.warnings.join(" "))}</div>`
    : "";
  const articles = analysis.articles
    .map(
      (article) => `
        <li class="article-item">
          <span class="article-title">${escapeHtml(article.number)}. ${escapeHtml(article.title)}</span>
          <div class="doi-code">${escapeHtml(article.doi)}</div>
          <div class="article-meta">${formatMeta(article)}</div>
        </li>
      `,
    )
    .join("");

  container.className = "summary";
  container.innerHTML = `
    <div class="summary-header">
      <span>${escapeHtml(analysis.article_count)} artikel</span>
      <span>Timestamp: ${escapeHtml(analysis.timestamp || "-")}</span>
    </div>
    ${warnings}
    <ul class="article-list">${articles}</ul>
  `;
}

function renderMapping() {
  const oldArticles = state.oldAnalysis?.articles || [];
  const newArticles = state.newAnalysis?.articles || [];
  els.mappingBody.innerHTML = "";
  els.mappingTable.hidden = true;
  els.generateButton.disabled = true;

  if (!state.oldAnalysis || !state.newAnalysis) {
    setNotice(els.mappingStatus, "Upload kedua XML untuk membuat XML akhir.", "");
    return;
  }

  const warnings = [];
  if (oldArticles.length !== newArticles.length) {
    warnings.push(
      `Jumlah artikel berbeda: XML lama ${oldArticles.length}, XML baru ${newArticles.length}.`,
    );
  }

  newArticles.forEach((newArticle, index) => {
    const tr = document.createElement("tr");
    const titleCell = document.createElement("td");
    const selectCell = document.createElement("td");
    const title = document.createElement("span");
    const doi = document.createElement("div");
    const select = document.createElement("select");

    title.className = "article-title";
    title.textContent = `${newArticle.number}. ${newArticle.title}`;
    doi.className = "doi-code";
    doi.textContent = `DOI pada XML baru: ${newArticle.doi}`;

    select.dataset.newIndex = String(index);
    select.append(new Option("Pilih DOI lama", ""));
    oldArticles.forEach((oldArticle, oldIndex) => {
      const option = new Option(
        `${oldArticle.number}. ${oldArticle.doi} - ${oldArticle.title}`,
        String(oldIndex),
      );
      select.append(option);
    });
    if (oldArticles.length === newArticles.length) {
      select.value = String(index);
    }
    select.addEventListener("change", () => {
      clearOutput();
      validateMapping();
    });

    titleCell.append(title, doi);
    selectCell.append(select);
    tr.append(titleCell, selectCell);
    els.mappingBody.append(tr);
  });

  els.mappingTable.hidden = false;
  if (warnings.length) {
    setNotice(els.mappingStatus, warnings.join(" "), "warn");
  } else {
    setNotice(
      els.mappingStatus,
      "Output dibuat otomatis berdasarkan urutan artikel. Ubah pemetaan jika perlu.",
      "success",
    );
  }
  const valid = validateMapping();
  if (valid && oldArticles.length === newArticles.length) {
    generateXml({ auto: true });
  }
}

function validateMapping() {
  const selects = [...els.mappingBody.querySelectorAll("select")];
  const selected = selects.map((select) => select.value).filter(Boolean);
  const duplicateValues = selected.filter(
    (value, index) => selected.indexOf(value) !== index,
  );
  const duplicateSet = new Set(duplicateValues);
  let complete = true;
  let hasDuplicate = false;

  selects.forEach((select) => {
    const missing = !select.value;
    const duplicate = duplicateSet.has(select.value);
    select.classList.toggle("invalid", missing || duplicate);
    complete = complete && !missing;
    hasDuplicate = hasDuplicate || duplicate;
  });

  if (hasDuplicate) {
    setNotice(
      els.mappingStatus,
      "Satu DOI lama tidak boleh dipakai lebih dari sekali.",
      "error",
    );
  } else if (!complete && state.oldAnalysis && state.newAnalysis) {
    setNotice(
      els.mappingStatus,
      "Semua artikel baru harus dipasangkan dengan DOI lama.",
      "warn",
    );
  } else if (state.oldAnalysis && state.newAnalysis) {
    const oldCount = state.oldAnalysis.articles.length;
    const newCount = state.newAnalysis.articles.length;
    const type = oldCount === newCount ? "success" : "warn";
    const message =
      oldCount === newCount
        ? "Pemetaan valid. XML siap dibuat."
        : `Pemetaan valid, tetapi jumlah artikel berbeda: lama ${oldCount}, baru ${newCount}.`;
    setNotice(els.mappingStatus, message, type);
  }

  els.generateButton.disabled = !complete || hasDuplicate;
  return complete && !hasDuplicate;
}

function collectMapping() {
  return [...els.mappingBody.querySelectorAll("select")].map((select) => ({
    new_index: Number(select.dataset.newIndex),
    old_index: Number(select.value),
  }));
}

function generateXml(options = {}) {
  clearOutput();
  try {
    const result = JSON.parse(
      state.repairXml(state.oldText, state.newText, JSON.stringify(collectMapping())),
    );
    state.outputXml = result.xml;
    els.xmlOutput.value = result.xml;
    els.copyButton.disabled = false;
    els.downloadButton.disabled = false;
    const warningText = result.warnings?.length ? ` ${result.warnings.join(" ")}` : "";
    const prefix = options.auto
      ? "XML akhir dibuat otomatis."
      : "XML berhasil dibuat.";
    setNotice(
      els.outputInfo,
      `${prefix} ${result.article_count} artikel memakai DOI lama. Timestamp dinaikkan untuk update Crossref: ${result.timestamp}.${warningText}`,
      result.warnings?.length ? "warn" : "success",
    );
  } catch (error) {
    setNotice(els.outputInfo, cleanError(error), "error");
  }
}

async function copyOutput() {
  if (!state.outputXml) return;
  try {
    await navigator.clipboard.writeText(state.outputXml);
    setNotice(els.outputInfo, "XML berhasil disalin ke clipboard.", "success");
  } catch (_error) {
    els.xmlOutput.select();
    document.execCommand("copy");
    setNotice(els.outputInfo, "XML disalin dari area teks.", "success");
  }
}

function downloadOutput() {
  if (!state.outputXml) return;
  const blob = new Blob([state.outputXml], { type: "application/xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `crossref-doi-repair-${timestampForFile()}.xml`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function resetApp() {
  state.oldText = "";
  state.newText = "";
  state.oldAnalysis = null;
  state.newAnalysis = null;
  state.outputXml = "";
  els.oldXmlInput.value = "";
  els.newXmlInput.value = "";
  els.oldFileName.textContent = "Pilih file XML lama";
  els.newFileName.textContent = "Pilih file XML baru";
  els.oldSummary.className = "summary muted";
  els.newSummary.className = "summary muted";
  els.oldSummary.textContent = "Belum ada file.";
  els.newSummary.textContent = "Belum ada file.";
  els.mappingBody.innerHTML = "";
  els.mappingTable.hidden = true;
  els.generateButton.disabled = true;
  setNotice(els.mappingStatus, "Upload kedua XML untuk membuat XML akhir.", "");
  clearOutput();
}

function clearOutput() {
  state.outputXml = "";
  els.xmlOutput.value = "";
  els.copyButton.disabled = true;
  els.downloadButton.disabled = true;
  setNotice(
    els.outputInfo,
    "Output akan dibuat otomatis setelah kedua XML diupload.",
    "",
  );
}

function setNotice(element, message, type) {
  element.textContent = message;
  element.className = `notice ${type}`.trim();
}

function formatMeta(article) {
  const parts = [];
  if (article.year) parts.push(`Tahun ${article.year}`);
  if (article.first_page) parts.push(`Hal. ${article.first_page}`);
  return parts.join(" - ") || "Metadata ringkas tidak tersedia";
}

function cleanError(error) {
  const message = String(error?.message || error || "Terjadi kesalahan.");
  return message
    .replace(/^PythonError:\s*/, "")
    .replace(/Traceback[\s\S]*?XmlRepairError:\s*/m, "")
    .trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function timestampForFile() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join("");
}
