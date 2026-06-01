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
  repairXmlWithDois: null,
  oldMode: "xml",
  oldText: "",
  oldDoiText: "",
  oldDoiArticles: [],
  newText: "",
  newResourceMode: "xml",
  newUrlText: "",
  oldAnalysis: null,
  newAnalysis: null,
  outputXml: "",
};

const els = {
  oldInputModes: [...document.querySelectorAll("input[name='oldInputMode']")],
  oldXmlInput: document.querySelector("#oldXmlInput"),
  oldDoiPanel: document.querySelector("#oldDoiPanel"),
  oldDoiInput: document.querySelector("#oldDoiInput"),
  lookupDoiButton: document.querySelector("#lookupDoiButton"),
  newXmlInput: document.querySelector("#newXmlInput"),
  newResourceModes: [...document.querySelectorAll("input[name='newResourceMode']")],
  newUrlPanel: document.querySelector("#newUrlPanel"),
  newUrlInput: document.querySelector("#newUrlInput"),
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
  outputResourceSummary: document.querySelector("#outputResourceSummary"),
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
  els.oldInputModes.forEach((input) => {
    input.addEventListener("change", handleOldModeChange);
  });
  els.oldXmlInput.addEventListener("change", () => handleFileChange("old"));
  els.oldDoiInput.addEventListener("input", handleDoiTextInput);
  els.lookupDoiButton.addEventListener("click", lookupOldDois);
  els.newXmlInput.addEventListener("change", () => handleFileChange("new"));
  els.newResourceModes.forEach((input) => {
    input.addEventListener("change", handleNewResourceModeChange);
  });
  els.newUrlInput.addEventListener("input", handleNewUrlInput);
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
    state.repairXmlWithDois = state.pyodide.globals.get("repair_xml_with_dois_json");
    els.oldXmlInput.disabled = false;
    els.oldDoiInput.disabled = false;
    els.newXmlInput.disabled = false;
    els.newResourceModes.forEach((input) => {
      input.disabled = false;
    });
    setNewResourceMode("xml", { clear: false });
    setOldMode("xml");
  } catch (error) {
    setNotice(
      els.mappingStatus,
      `Runtime Python gagal dimuat: ${cleanError(error)}`,
      "error",
    );
  }
}

function handleOldModeChange(event) {
  setOldMode(event.target.value);
}

function setOldMode(mode) {
  state.oldMode = mode;
  clearOutput();
  els.oldInputModes.forEach((input) => {
    input.checked = input.value === mode;
  });
  els.oldXmlInput.closest(".file-drop").hidden = mode !== "xml";
  els.oldDoiPanel.hidden = mode !== "doi";

  if (mode === "xml") {
    state.oldDoiArticles = [];
    state.oldDoiText = "";
    els.oldDoiInput.value = "";
    els.lookupDoiButton.disabled = true;
    if (!state.oldAnalysis) {
      els.oldSummary.className = "summary muted";
      els.oldSummary.textContent = "Belum ada file.";
    } else {
      renderSummary(els.oldSummary, state.oldAnalysis);
    }
  } else {
    state.oldText = "";
    state.oldAnalysis = null;
    els.oldXmlInput.value = "";
    els.oldFileName.textContent = "Pilih file XML lama";
    renderDoiSummary();
  }
  renderMapping();
}

function handleDoiTextInput() {
  state.oldDoiText = els.oldDoiInput.value;
  state.oldDoiArticles = [];
  clearOutput();
  els.lookupDoiButton.disabled = parseDoiLines(state.oldDoiText).length === 0;
  renderDoiSummary();
  renderMapping();
}

function handleNewResourceModeChange(event) {
  setNewResourceMode(event.target.value);
}

function setNewResourceMode(mode, options = {}) {
  state.newResourceMode = mode;
  els.newResourceModes.forEach((input) => {
    input.checked = input.value === mode;
  });
  const manualMode = mode === "manual";
  els.newUrlPanel.hidden = !manualMode;
  els.newUrlInput.disabled = !manualMode;
  if (options.clear !== false) {
    clearOutput();
    renderMapping();
  }
}

function handleNewUrlInput() {
  state.newUrlText = els.newUrlInput.value;
  clearOutput();
  renderMapping();
}

async function handleFileChange(kind) {
  const input = kind === "old" ? els.oldXmlInput : els.newXmlInput;
  const fileName = kind === "old" ? els.oldFileName : els.newFileName;
  const summary = kind === "old" ? els.oldSummary : els.newSummary;
  const file = input.files && input.files.length ? input.files[0] : null;

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
    const xmlText = await readFileAsText(file);
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
  const warnings = analysis.warnings && analysis.warnings.length
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

async function lookupOldDois() {
  const dois = parseDoiLines(state.oldDoiText);
  clearOutput();
  if (!dois.length) {
    setNotice(els.oldSummary, "Tulis minimal satu DOI lama.", "warn");
    return;
  }
  const duplicateDois = dois.filter((doi, index) => dois.indexOf(doi) !== index);
  if (duplicateDois.length) {
    state.oldDoiArticles = [];
    renderDoiSummary([
      `DOI lama tidak boleh ditulis lebih dari sekali: ${[...new Set(duplicateDois)].join(", ")}.`,
    ]);
    renderMapping();
    return;
  }

  els.lookupDoiButton.disabled = true;
  setNotice(
    els.oldSummary,
    `Mengambil metadata ${dois.length} DOI dari Crossref...`,
    "",
  );

  const articles = [];
  const failures = [];
  for (const [index, doi] of dois.entries()) {
    try {
      const metadata = await fetchCrossrefWork(doi);
      articles.push(articleFromCrossref(metadata, doi, index));
      if (index < dois.length - 1) {
        await wait(250);
      }
    } catch (error) {
      failures.push(`${doi}: ${cleanError(error)}`);
    }
  }

  els.lookupDoiButton.disabled = parseDoiLines(state.oldDoiText).length === 0;
  if (failures.length) {
    state.oldDoiArticles = [];
    renderDoiSummary(failures);
  } else {
    state.oldDoiArticles = articles;
    renderDoiSummary();
  }
  renderMapping();
}

async function fetchCrossrefWork(doi) {
  const url = `https://api.crossref.org/works/${encodeURIComponent(doi)}`;
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });
  if (response.status === 404) {
    throw new Error("DOI tidak ditemukan di Crossref.");
  }
  if (response.status === 429) {
    throw new Error("Rate limit Crossref tercapai. Coba ulang beberapa saat lagi.");
  }
  if (!response.ok) {
    throw new Error(`Crossref mengembalikan status ${response.status}.`);
  }
  const payload = await response.json();
  return payload.message;
}

function articleFromCrossref(work, requestedDoi, index) {
  const title = firstArrayValue(work.title) || "(judul tidak tersedia di Crossref)";
  const dateSource =
    getNested(work, ["published", "date-parts"]) ||
    getNested(work, ["issued", "date-parts"]) ||
    getNested(work, ["published-print", "date-parts"]) ||
    getNested(work, ["published-online", "date-parts"]);
  const year = yearFromDateParts(dateSource);
  const doi = normalizeDoi(work.DOI || requestedDoi);
  return {
    index,
    number: index + 1,
    doi,
    title,
    subtitle: arrayValues(work.subtitle),
    year,
    published_date: datePartsToString(dateSource),
    published_print: crossrefDate(work["published-print"]),
    published_online: crossrefDate(work["published-online"]),
    created_date: crossrefDate(work.created),
    deposited_date: crossrefDate(work.deposited),
    indexed_date: crossrefDate(work.indexed),
    first_page: firstPageFromPage(work.page || ""),
    page: work.page || "",
    article_number: work["article-number"] || "",
    container_title: firstArrayValue(work["container-title"]),
    short_container_title: firstArrayValue(work["short-container-title"]),
    original_title: arrayValues(work["original-title"]),
    volume: work.volume || "",
    issue: work.issue || getNested(work, ["journal-issue", "issue"]) || "",
    publisher: work.publisher || "",
    type: work.type || "",
    language: work.language || "",
    prefix: work.prefix || "",
    member: work.member || "",
    issn: arrayValues(work.ISSN),
    issn_type: issnTypes(work["issn-type"]),
    subject: arrayValues(work.subject),
    authors: peopleNames(work.author),
    editors: peopleNames(work.editor),
    funders: funderNames(work.funder),
    licenses: licenseLinks(work.license),
    full_text_links: linkEntries(work.link),
    relations: relationEntries(work.relation),
    content_domain: contentDomains(work["content-domain"]),
    alternative_id: arrayValues(work["alternative-id"]),
    update_policy: work["update-policy"] || "",
    abstract: stripMarkup(work.abstract || ""),
    original_url: getNested(work, ["resource", "primary", "URL"]) || "",
    doi_url: work.URL || (doi ? `https://doi.org/${doi}` : ""),
    reference_count: String(work["reference-count"] ?? work["references-count"] ?? ""),
    cited_by_count: String(work["is-referenced-by-count"] ?? ""),
    raw_metadata: work,
    source: "crossref",
  };
}

function renderDoiSummary(failures = []) {
  if (state.oldMode !== "doi") return;
  const pendingDois = parseDoiLines(state.oldDoiText);

  if (!pendingDois.length) {
    els.oldSummary.className = "summary muted";
    els.oldSummary.textContent = "Belum ada DOI.";
    return;
  }

  if (!state.oldDoiArticles.length && !failures.length) {
    els.oldSummary.className = "summary muted";
    els.oldSummary.textContent = `${pendingDois.length} DOI siap dicek ke Crossref.`;
    return;
  }

  const warnings = failures.length
    ? `<div class="notice error">${escapeHtml(failures.join(" "))}</div>`
    : "";
  const articles = state.oldDoiArticles
    .map(
      (article) => `
        <li class="article-item">
          <span class="article-title">${escapeHtml(article.number)}. ${escapeHtml(article.title)}</span>
          <div class="doi-code">${escapeHtml(article.doi)}</div>
          <div class="article-meta">${formatCrossrefMeta(article)}</div>
          ${renderCrossrefDetails(article)}
        </li>
      `,
    )
    .join("");

  els.oldSummary.className = "summary crossref-summary";
  els.oldSummary.innerHTML = `
    <div class="summary-header">
      <span>${escapeHtml(state.oldDoiArticles.length)} DOI ditemukan</span>
      <span>Sumber: Crossref REST API</span>
    </div>
    ${warnings}
    <ul class="article-list">${articles}</ul>
  `;
}

function renderMapping() {
  const oldArticles = currentOldArticles();
  const newArticles = state.newAnalysis ? state.newAnalysis.articles : [];
  els.mappingBody.innerHTML = "";
  els.mappingTable.hidden = true;
  els.generateButton.disabled = true;

  if (!oldArticles.length || !state.newAnalysis) {
    const message =
      state.oldMode === "doi"
        ? "Ambil metadata DOI lama dari Crossref, lalu upload XML baru."
        : "Upload XML lama dan XML baru untuk membuat XML akhir.";
    setNotice(els.mappingStatus, message, "");
    return;
  }

  const warnings = [];
  const urlValidation = validateNewArticleUrls();
  if (oldArticles.length !== newArticles.length) {
    const oldLabel = state.oldMode === "doi" ? "DOI lama" : "XML lama";
    warnings.push(
      `Jumlah artikel berbeda: ${oldLabel} ${oldArticles.length}, XML baru ${newArticles.length}.`,
    );
  }
  if (!urlValidation.valid) {
    warnings.push(urlValidation.message);
  }

  newArticles.forEach((newArticle, index) => {
    const tr = document.createElement("tr");
    const titleCell = document.createElement("td");
    const selectCell = document.createElement("td");
    const title = document.createElement("span");
    const doi = document.createElement("div");
    const resource = document.createElement("div");
    const select = document.createElement("select");

    title.className = "article-title";
    title.textContent = `${newArticle.number}. ${newArticle.title}`;
    doi.className = "doi-code";
    doi.textContent = `DOI pada XML baru: ${newArticle.doi}`;
    resource.className = "doi-code";
    resource.textContent = articleResourceLabel(newArticle, urlValidation.urls[index]);

    select.dataset.newIndex = String(index);
    select.appendChild(new Option("Pilih DOI lama", ""));
    oldArticles.forEach((oldArticle, oldIndex) => {
      const option = new Option(
        `${oldArticle.number}. ${oldArticle.doi} - ${oldArticle.title}`,
        String(oldIndex),
      );
      select.appendChild(option);
    });
    const picked = pickOldArticleIndex(newArticle, oldArticles, index);
    select.value = picked.value;
    select.dataset.matchScore = String(picked.score);
    select.dataset.matchMethod = picked.method;
    select.addEventListener("change", () => {
      clearOutput();
      validateMapping();
    });

    titleCell.appendChild(title);
    titleCell.appendChild(doi);
    titleCell.appendChild(resource);
    selectCell.appendChild(select);
    tr.appendChild(titleCell);
    tr.appendChild(selectCell);
    els.mappingBody.appendChild(tr);
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
  if (
    valid &&
    oldArticles.length === newArticles.length &&
    (state.oldMode === "xml" || hasHighConfidenceMapping())
  ) {
    generateXml({ auto: true });
  }
}

function validateMapping() {
  const selects = [...els.mappingBody.querySelectorAll("select")];
  const selected = selects.map((select) => select.value).filter(Boolean);
  const urlValidation = validateNewArticleUrls();
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
  } else if (!complete && currentOldArticles().length && state.newAnalysis) {
    setNotice(
      els.mappingStatus,
      "Semua artikel baru harus dipasangkan dengan DOI lama.",
      "warn",
    );
  } else if (!urlValidation.valid && currentOldArticles().length && state.newAnalysis) {
    setNotice(els.mappingStatus, urlValidation.message, "error");
  } else if (currentOldArticles().length && state.newAnalysis) {
    const oldCount = currentOldArticles().length;
    const newCount = state.newAnalysis.articles.length;
    let type = oldCount === newCount ? "success" : "warn";
    let message =
      oldCount === newCount
        ? "Pemetaan valid. XML siap dibuat."
        : `Pemetaan valid, tetapi jumlah artikel berbeda: lama ${oldCount}, baru ${newCount}.`;
    if (state.oldMode === "doi" && !hasHighConfidenceMapping()) {
      type = "warn";
      message =
        "Pemetaan DOI dari Crossref perlu diperiksa. Jika pasangan artikel sudah benar, klik Generate Ulang.";
    }
    setNotice(els.mappingStatus, message, type);
  }

  els.generateButton.disabled = !complete || hasDuplicate || !urlValidation.valid;
  return complete && !hasDuplicate && urlValidation.valid;
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
    const mappingJson = JSON.stringify(collectMapping());
    const newResourceUrlsJson = JSON.stringify(validateNewArticleUrls().urls);
    const result =
      state.oldMode === "doi"
        ? JSON.parse(
            state.repairXmlWithDois(
              JSON.stringify(currentOldArticles().map((article) => article.doi)),
              state.newText,
              mappingJson,
              newResourceUrlsJson,
            ),
          )
        : JSON.parse(
            state.repairXml(
              state.oldText,
              state.newText,
              mappingJson,
              newResourceUrlsJson,
            ),
          );
    state.outputXml = result.xml;
    els.xmlOutput.value = result.xml;
    els.copyButton.disabled = false;
    els.downloadButton.disabled = false;
    renderOutputResourceSummary(result.mapping || []);
    const warningText = result.warnings && result.warnings.length
      ? ` ${result.warnings.join(" ")}`
      : "";
    const prefix = options.auto
      ? "XML akhir dibuat otomatis."
      : "XML berhasil dibuat.";
    const resourceText = result.resource_url_override_count
      ? ` ${result.resource_url_override_count} URL artikel baru dipakai untuk doi_data/resource.`
      : "";
    setNotice(
      els.outputInfo,
      `${prefix} ${result.article_count} artikel memakai DOI lama. Timestamp dinaikkan untuk update Crossref: ${result.timestamp}.${resourceText}${warningText}`,
      result.warnings && result.warnings.length ? "warn" : "success",
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
  const filename = `crossref-doi-repair-${timestampForFile()}.xml`;
  const blob = new Blob([state.outputXml], { type: "application/xml;charset=utf-8" });
  if (window.navigator && window.navigator.msSaveOrOpenBlob) {
    window.navigator.msSaveOrOpenBlob(blob, filename);
    return;
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.target = "_blank";
  document.body.appendChild(anchor);
  anchor.click();
  if (anchor.parentNode) {
    anchor.parentNode.removeChild(anchor);
  }
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function resetApp() {
  state.oldText = "";
  state.oldDoiText = "";
  state.oldDoiArticles = [];
  state.newText = "";
  state.newResourceMode = "xml";
  state.newUrlText = "";
  state.oldAnalysis = null;
  state.newAnalysis = null;
  state.outputXml = "";
  els.oldXmlInput.value = "";
  els.oldDoiInput.value = "";
  els.lookupDoiButton.disabled = true;
  els.newXmlInput.value = "";
  els.newUrlInput.value = "";
  els.oldFileName.textContent = "Pilih file XML lama";
  els.newFileName.textContent = "Pilih file XML baru";
  els.oldSummary.className = "summary muted";
  els.newSummary.className = "summary muted";
  els.oldSummary.textContent = "Belum ada file.";
  els.newSummary.textContent = "Belum ada file.";
  setNewResourceMode("xml", { clear: false });
  setOldMode("xml");
}

function clearOutput() {
  state.outputXml = "";
  els.xmlOutput.value = "";
  els.copyButton.disabled = true;
  els.downloadButton.disabled = true;
  els.outputResourceSummary.hidden = true;
  els.outputResourceSummary.innerHTML = "";
  setNotice(
    els.outputInfo,
    "Output akan dibuat otomatis setelah data lama dan XML baru siap.",
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
  if (article.resource_url) parts.push(`URL: ${article.resource_url}`);
  return parts.join(" - ") || "Metadata ringkas tidak tersedia";
}

function formatCrossrefMeta(article) {
  const parts = [];
  if (article.container_title) parts.push(article.container_title);
  if (article.year) parts.push(`Tahun ${article.year}`);
  if (article.volume) parts.push(`Vol. ${article.volume}`);
  if (article.issue) parts.push(`No. ${article.issue}`);
  if (article.first_page) parts.push(`Hal. ${article.first_page}`);
  return parts.join(" - ") || "Metadata Crossref ringkas tidak tersedia";
}

function renderOutputResourceSummary(mapping) {
  if (!mapping.length) {
    els.outputResourceSummary.hidden = true;
    els.outputResourceSummary.innerHTML = "";
    return;
  }
  els.outputResourceSummary.hidden = false;
  els.outputResourceSummary.innerHTML = `
    <h3>DOI dan URL artikel yang dipakai</h3>
    <ul>
      ${mapping
        .map(
          (item) => `
            <li>
              <span class="doi-code">${escapeHtml(item.doi)}</span>
              <span>${safeExternalLink(item.resource_url || "") || "URL artikel kosong"}</span>
            </li>
          `,
        )
        .join("")}
    </ul>
  `;
}

function articleResourceLabel(article, overrideUrl) {
  if (overrideUrl) {
    return `URL output dari input: ${overrideUrl}`;
  }
  if (article.resource_url) {
    return `URL output dari XML baru: ${article.resource_url}`;
  }
  return "URL output belum tersedia di XML baru.";
}

function validateNewArticleUrls() {
  if (state.newResourceMode !== "manual") {
    return { valid: true, urls: [], message: "" };
  }
  const urls = parseArticleUrlLines(state.newUrlText);
  if (!state.newAnalysis && !urls.length) {
    return { valid: true, urls, message: "" };
  }
  if (state.newAnalysis && !urls.length) {
    return {
      valid: false,
      urls,
      message: "Mode URL manual dipilih. Tulis URL artikel baru satu URL per artikel, atau pilih Pakai URL dari XML baru.",
    };
  }
  if (!state.newAnalysis) {
    return { valid: true, urls, message: "" };
  }
  const expectedCount = state.newAnalysis.article_count;
  if (urls.length !== expectedCount) {
    return {
      valid: false,
      urls,
      message: `Jumlah URL artikel baru harus sama dengan jumlah artikel XML baru: ${urls.length} URL untuk ${expectedCount} artikel.`,
    };
  }

  const invalidLines = urls
    .map((url, index) => ({ url, index }))
    .filter((item) => !/^https?:\/\//i.test(item.url))
    .map((item) => item.index + 1);
  if (invalidLines.length) {
    return {
      valid: false,
      urls,
      message: `URL artikel baru harus diawali http:// atau https://. Baris: ${invalidLines.join(", ")}.`,
    };
  }

  return { valid: true, urls, message: "" };
}

function renderCrossrefDetails(article) {
  const originalUrl = article.original_url
    ? safeExternalLink(article.original_url)
    : `
        <span class="metadata-empty">
          Crossref tidak menyediakan resource.primary.URL.
          ${article.doi_url ? `DOI resolver: ${safeExternalLink(article.doi_url)}` : ""}
        </span>
      `;
  const rows = [
    metadataRow("URL artikel asli", article.original_url, { link: true }),
    metadataRow("DOI resolver", article.doi_url, { link: true }),
    metadataRow("Penerbit", article.publisher),
    metadataRow("Tipe record", article.type),
    metadataRow("Jurnal/prosiding", article.container_title),
    metadataRow("Judul pendek", article.short_container_title),
    metadataRow("Judul asli", article.original_title),
    metadataRow("Subjudul", article.subtitle),
    metadataRow("Volume", article.volume),
    metadataRow("Nomor", article.issue),
    metadataRow("Halaman", article.page),
    metadataRow("Nomor artikel", article.article_number),
    metadataRow("Tanggal terbit", article.published_date),
    metadataRow("Tanggal cetak", article.published_print),
    metadataRow("Tanggal online", article.published_online),
    metadataRow("Dibuat di Crossref", article.created_date),
    metadataRow("Deposit terakhir", article.deposited_date),
    metadataRow("Index Crossref", article.indexed_date),
    metadataRow("Bahasa", article.language),
    metadataRow("ISSN", article.issn),
    metadataRow("ISSN type", article.issn_type),
    metadataRow("Prefix", article.prefix),
    metadataRow("Member ID", article.member),
    metadataRow("Jumlah referensi", article.reference_count),
    metadataRow("Disitasi oleh", article.cited_by_count),
    metadataRow("Update policy", article.update_policy, { link: true }),
    metadataRow("Alternative ID", article.alternative_id),
    metadataRow("Content domain", article.content_domain),
  ].join("");
  const abstractBlock = article.abstract
    ? `
        <div class="metadata-block">
          <h4>Abstrak</h4>
          <p>${escapeHtml(article.abstract)}</p>
        </div>
      `
    : "";

  return `
    <div class="crossref-metadata">
      <div class="article-url">
        <span>URL artikel asli</span>
        ${originalUrl}
      </div>
      <details class="metadata-details" open>
        <summary>Metadata Crossref lengkap</summary>
        <dl class="metadata-grid">${rows}</dl>
        ${metadataListBlock("Penulis", article.authors)}
        ${metadataListBlock("Editor", article.editors)}
        ${metadataListBlock("Subjek", article.subject)}
        ${metadataListBlock("Funder", article.funders)}
        ${metadataUrlListBlock("Lisensi", article.licenses)}
        ${metadataUrlListBlock("Full-text/TDM links", article.full_text_links)}
        ${metadataListBlock("Relasi", article.relations)}
        ${abstractBlock}
        <details class="raw-metadata">
          <summary>JSON metadata lengkap dari Crossref</summary>
          <pre>${escapeHtml(JSON.stringify(article.raw_metadata, null, 2))}</pre>
        </details>
      </details>
    </div>
  `;
}

function metadataRow(label, value, options = {}) {
  const normalized = normalizeDisplayValue(value);
  if (!normalized) return "";
  const content = options.link
    ? safeExternalLink(normalized)
    : escapeHtml(normalized);
  return `
    <div>
      <dt>${escapeHtml(label)}</dt>
      <dd>${content}</dd>
    </div>
  `;
}

function metadataListBlock(label, values) {
  const items = normalizeDisplayList(values);
  if (!items.length) return "";
  return `
    <div class="metadata-block">
      <h4>${escapeHtml(label)}</h4>
      <ul>
        ${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </div>
  `;
}

function metadataUrlListBlock(label, entries) {
  const items = Array.isArray(entries) ? entries.filter((entry) => entry.url) : [];
  if (!items.length) return "";
  return `
    <div class="metadata-block">
      <h4>${escapeHtml(label)}</h4>
      <ul>
        ${items
          .map(
            (entry) => `
              <li>
                ${safeExternalLink(entry.url)}
                ${entry.note ? `<span>${escapeHtml(entry.note)}</span>` : ""}
              </li>
            `,
          )
          .join("")}
      </ul>
    </div>
  `;
}

function safeExternalLink(url) {
  const text = String(url || "").trim();
  if (!text) return "";
  if (!/^https?:\/\//i.test(text)) {
    return escapeHtml(text);
  }
  return `<a href="${escapeHtml(text)}" target="_blank" rel="noopener noreferrer">${escapeHtml(text)}</a>`;
}

function normalizeDisplayValue(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean).join(", ");
  }
  return String(value || "").trim();
}

function normalizeDisplayList(values) {
  if (!Array.isArray(values)) {
    const value = normalizeDisplayValue(values);
    return value ? [value] : [];
  }
  return values.map((item) => String(item || "").trim()).filter(Boolean);
}

function currentOldArticles() {
  if (state.oldMode === "doi") {
    return state.oldDoiArticles;
  }
  return state.oldAnalysis ? state.oldAnalysis.articles : [];
}

function parseDoiLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => normalizeDoi(line))
    .filter(Boolean);
}

function parseArticleUrlLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function normalizeDoi(value) {
  return String(value || "")
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .trim();
}

function firstArrayValue(value) {
  return Array.isArray(value) && value.length ? String(value[0]) : "";
}

function arrayValues(value) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
}

function yearFromDateParts(dateParts) {
  if (!Array.isArray(dateParts) || !Array.isArray(dateParts[0])) return "";
  return dateParts[0][0] ? String(dateParts[0][0]) : "";
}

function datePartsToString(dateParts) {
  if (!Array.isArray(dateParts) || !Array.isArray(dateParts[0])) return "";
  return dateParts[0]
    .filter((part) => part !== undefined && part !== null && part !== "")
    .map((part, index) => String(part).padStart(index === 0 ? 4 : 2, "0"))
    .join("-");
}

function crossrefDate(value) {
  if (!value) return "";
  if (value["date-time"]) return String(value["date-time"]).split("T")[0];
  return datePartsToString(value["date-parts"]);
}

function firstPageFromPage(page) {
  return String(page || "").split(/[-\u2013\u2014]/)[0].trim();
}

function peopleNames(people) {
  if (!Array.isArray(people)) return [];
  return people.map((person) => {
    const name = [person.given, person.family].filter(Boolean).join(" ");
    const fallback = person.name || person.family || person.given || "";
    const orcid = person.ORCID ? ` (${person.ORCID})` : "";
    return `${name || fallback}${orcid}`.trim();
  }).filter(Boolean);
}

function funderNames(funders) {
  if (!Array.isArray(funders)) return [];
  return funders.map((funder) => {
    const awards = Array.isArray(funder.award) && funder.award.length
      ? `; award: ${funder.award.join(", ")}`
      : "";
    const doi = funder.DOI ? ` (${funder.DOI})` : "";
    return `${funder.name || ""}${doi}${awards}`.trim();
  }).filter(Boolean);
}

function licenseLinks(licenses) {
  if (!Array.isArray(licenses)) return [];
  return licenses.map((license) => ({
    url: license.URL || "",
    note: [
      license["content-version"],
      license["delay-in-days"] !== undefined
        ? `delay ${license["delay-in-days"]} hari`
        : "",
      crossrefDate(license.start),
    ].filter(Boolean).join(" - "),
  }));
}

function linkEntries(links) {
  if (!Array.isArray(links)) return [];
  return links.map((link) => ({
    url: link.URL || "",
    note: [
      link["content-type"],
      link["content-version"],
      link["intended-application"],
    ].filter(Boolean).join(" - "),
  }));
}

function issnTypes(types) {
  if (!Array.isArray(types)) return [];
  return types.map((item) => [item.value, item.type].filter(Boolean).join(" - "));
}

function relationEntries(relation) {
  if (!relation || typeof relation !== "object") return [];
  return Object.entries(relation).map(([type, entries]) => {
    const ids = Array.isArray(entries)
      ? entries
          .map((entry) => [entry["id-type"], entry.id].filter(Boolean).join(": "))
          .filter(Boolean)
      : [];
    return `${type}: ${ids.join(", ")}`.trim();
  }).filter((entry) => !entry.endsWith(":"));
}

function contentDomains(contentDomain) {
  if (!contentDomain || typeof contentDomain !== "object") return [];
  const domains = Array.isArray(contentDomain.domain) ? contentDomain.domain : [];
  const restriction = contentDomain["crossmark-restriction"] === true
    ? "crossmark restricted"
    : "";
  return [...domains, restriction].filter(Boolean);
}

function stripMarkup(value) {
  return String(value || "")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pickOldArticleIndex(newArticle, oldArticles, fallbackIndex) {
  if (!oldArticles.length) return { value: "", score: 0, method: "empty" };
  const used = new Set(
    [...els.mappingBody.querySelectorAll("select")]
      .map((select) => select.value)
      .filter(Boolean),
  );
  let best = { index: -1, score: -1 };
  oldArticles.forEach((oldArticle, oldIndex) => {
    if (used.has(String(oldIndex))) return;
    const score = matchScore(newArticle, oldArticle);
    if (score > best.score) {
      best = { index: oldIndex, score };
    }
  });
  if (best.index >= 0 && best.score >= 45) {
    return { value: String(best.index), score: Math.round(best.score), method: "match" };
  }
  if (fallbackIndex < oldArticles.length && !used.has(String(fallbackIndex))) {
    return { value: String(fallbackIndex), score: Math.round(best.score), method: "order" };
  }
  return { value: "", score: Math.round(best.score), method: "none" };
}

function hasHighConfidenceMapping() {
  return [...els.mappingBody.querySelectorAll("select")].every(
    (select) => select.dataset.matchMethod === "match",
  );
}

function matchScore(newArticle, oldArticle) {
  let score = 0;
  const titleScore = textSimilarity(newArticle.title, oldArticle.title);
  score += titleScore * 70;
  if (newArticle.year && oldArticle.year && newArticle.year === oldArticle.year) {
    score += 10;
  }
  if (
    newArticle.first_page &&
    oldArticle.first_page &&
    newArticle.first_page === oldArticle.first_page
  ) {
    score += 10;
  }
  if (
    newArticle.volume &&
    oldArticle.volume &&
    newArticle.volume === oldArticle.volume
  ) {
    score += 5;
  }
  if (
    newArticle.issue &&
    oldArticle.issue &&
    newArticle.issue === oldArticle.issue
  ) {
    score += 5;
  }
  return score;
}

function textSimilarity(left, right) {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  if (!leftTokens.size || !rightTokens.size) return 0;
  const intersection = [...leftTokens].filter((token) => rightTokens.has(token));
  const union = new Set([...leftTokens, ...rightTokens]);
  return intersection.length / union.size;
}

function tokenSet(value) {
  return new Set(
    String(value || "")
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2),
  );
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function cleanError(error) {
  const message = String((error && error.message) || error || "Terjadi kesalahan.");
  return message
    .replace(/^PythonError:\s*/, "")
    .replace(/Traceback[\s\S]*?XmlRepairError:\s*/m, "")
    .trim();
}

function escapeHtml(value) {
  return String(value === null || value === undefined ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function readFileAsText(file) {
  if (file && typeof file.text === "function") {
    return file.text();
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("File tidak dapat dibaca."));
    reader.readAsText(file);
  });
}

function getNested(source, path) {
  let value = source;
  path.forEach((key) => {
    if (value && Object.prototype.hasOwnProperty.call(value, key)) {
      value = value[key];
    } else {
      value = undefined;
    }
  });
  return value;
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
