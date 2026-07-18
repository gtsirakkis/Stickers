/* app.js — wire up tabs, imports, OCR review, matching and trade UI. */
(function (global) {
  "use strict";

  // Bump this on every release so you can confirm which build a phone is
  // running. Keep it in step with CACHE_VERSION in sw.js.
  const APP_VERSION = "1.3.0";

  const $ = (id) => document.getElementById(id);

  // State shared between the Scan and Trade tabs.
  let detectedTokens = []; // [{text, confidence, low}]

  /* ---------------- Tab navigation ---------------- */
  function initTabs() {
    document.querySelectorAll(".tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const name = btn.getAttribute("data-tab");
        document.querySelectorAll(".tab-btn").forEach((b) =>
          b.classList.toggle("is-active", b === btn)
        );
        document.querySelectorAll(".tab-panel").forEach((p) =>
          p.classList.toggle("is-active", p.id === "tab-" + name)
        );
        global.scrollTo(0, 0);
      });
    });
  }

  /* ---------------- Import master list ---------------- */
  function initImport() {
    $("import-file").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const status = $("import-status");
      status.className = "status-line";
      status.textContent = "Reading file…";
      try {
        const records = await Importer.parseFile(file);
        if (!records.length) {
          status.className = "status-line error";
          status.textContent = "No rows found. Check the file has number/status columns.";
          return;
        }
        const merge = !$("import-replace").checked;
        const res = Store.importRecords(records, merge);
        status.className = "status-line ok";
        status.textContent = `Imported ${res.added} new, updated ${res.updated}. Total: ${res.total}.`;
        Stickers.render();
      } catch (err) {
        console.error(err);
        status.className = "status-line error";
        status.textContent = "Could not read that file: " + (err.message || err);
      } finally {
        e.target.value = "";
      }
    });
  }

  /* ---------------- OCR review (text) ---------------- */

  // Parse the review textarea into country+number tokens, anchored on the
  // country codes already in the collection.
  function parseReview() {
    const lines = String($("detected-text").value || "").split(/\r?\n/);
    return Ocr.parseLines(lines, {
      knownCodes: Store.countryCodes(),
      maxNumber: Store.maxNumber(),
    });
  }

  function updateDetectedSummary() {
    const toks = parseReview();
    detectedTokens = toks;
    const flagged = toks.filter((t) => t.low).length;
    const el = $("detected-summary");
    el.className = "status-line";
    el.textContent =
      `${toks.length} sticker(s) recognised` +
      (flagged ? ` · ${flagged} need a check (unknown country or number > ${Store.maxNumber()})` : "");
  }

  // Shared by both the camera and the upload inputs.
  async function handleImageFile(file, inputEl) {
    if (!file) return;
    const preview = $("ocr-preview");
    preview.src = URL.createObjectURL(file);
    preview.hidden = false;

    const prog = $("ocr-progress");
    prog.className = "status-line";
    prog.textContent = "Starting OCR…";
    $("review-card").hidden = true;
    $("results-card").hidden = true;

    try {
      const { lines } = await Ocr.recognize(file, (frac, label) => {
        prog.textContent = `${label}… ${Math.round((frac || 0) * 100)}%`;
      });
      $("detected-text").value = lines.join("\n");
      updateDetectedSummary();
      prog.className = "status-line ok";
      prog.textContent = "Done. Check the country codes and numbers below, then compare.";
      $("review-card").hidden = false;
    } catch (err) {
      console.error(err);
      prog.className = "status-line error";
      prog.textContent = "OCR failed: " + (err.message || err);
    } finally {
      if (inputEl) inputEl.value = ""; // allow re-selecting the same file
    }
  }

  function initOcr() {
    ["ocr-camera", "ocr-upload"].forEach((id) => {
      const el = $(id);
      if (el) el.addEventListener("change", (e) => handleImageFile(e.target.files[0], e.target));
    });

    $("detected-text").addEventListener("input", updateDetectedSummary);

    $("compare-btn").addEventListener("click", () => {
      detectedTokens = parseReview();
      const res = Matcher.match(detectedTokens);
      renderMatchResults(res);
      $("results-card").hidden = false;
      $("results-card").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function numGrid(nums) {
    if (!nums.length) return '<div class="result-empty">None.</div>';
    return (
      '<div class="num-grid">' +
      nums.map((n) => `<span class="num-tag">${escapeHtml(n)}</span>`).join("") +
      "</div>"
    );
  }

  function renderMatchResults(res) {
    let html = `
      <div class="result-group">
        <h4><span class="dot want"></span>They have — you NEED these (${res.want.length})</h4>
        ${numGrid(res.want)}
      </div>
      <div class="result-group">
        <h4><span class="dot have"></span>You already have / don't need (${res.already.length})</h4>
        ${numGrid(res.already)}
      </div>`;
    if (res.unknown.length) {
      html += `
      <div class="result-group">
        <h4><span class="dot unknown"></span>Not on your list — check manually (${res.unknown.length})</h4>
        ${numGrid(res.unknown)}
      </div>`;
    }
    html += `
      <div class="result-group">
        <h4><span class="dot unknown"></span>Couldn't read confidently — fix above &amp; re-compare (${res.lowconf.length})</h4>
        ${numGrid(res.lowconf)}
      </div>`;
    $("match-results").innerHTML = html;
  }

  /* ---------------- Trade tab ---------------- */
  function getTheirWanted() {
    const lines = String($("their-missing-text").value || "").split(/\r?\n/);
    return Ocr.parseLines(lines, {
      knownCodes: Store.countryCodes(),
      maxNumber: Store.maxNumber(),
    });
  }

  function initTrade() {
    $("their-missing-file").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const status = $("their-missing-status");
      status.className = "status-line";
      status.textContent = "Reading…";
      try {
        const name = (file.name || "").toLowerCase();
        let nums;
        if (name.endsWith(".csv") || name.endsWith(".xlsx") || name.endsWith(".xls")) {
          const recs = await Importer.parseFile(file);
          // Their "wanted" list = the stickers they're missing.
          const miss = recs.filter((r) => Store.normalizeStatus(r.status) === "Missing");
          nums = (miss.length ? miss : recs).map((r) => r.number);
        } else {
          const text = await file.text();
          nums = Importer.parseNumberList(text);
        }
        const existing = $("their-missing-text").value.trim();
        $("their-missing-text").value = (existing ? existing + "\n" : "") + nums.join("\n");
        status.className = "status-line ok";
        status.textContent = `Loaded ${nums.length} number(s).`;
      } catch (err) {
        status.className = "status-line error";
        status.textContent = "Could not read that file.";
      } finally {
        e.target.value = "";
      }
    });

    $("use-scan-btn").addEventListener("click", () => {
      // The scanned list (their duplicates) is used automatically as their
      // "give" side; this just reports how many were read.
      const scanned = parseReview();
      const status = $("their-missing-status");
      status.className = "status-line";
      status.textContent = scanned.length
        ? `Using ${scanned.length} scanned sticker(s) as their "give" list.`
        : "No scanned list yet — use the Scan tab first.";
    });

    $("trade-btn").addEventListener("click", () => {
      const result = Trade.build(parseReview(), getTheirWanted());
      renderTradeResults(result);
      $("trade-results-card").hidden = false;
      $("trade-results-card").scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function renderTradeResults(r) {
    const note = r.pairs
      ? `A balanced swap of <b>${r.pairs}</b> for <b>${r.pairs}</b> is possible` +
        (r.balanced ? "." : `, with extras on one side.`)
      : "No matching pairs yet — nothing lines up between your duplicates/missing and theirs.";
    $("trade-results").innerHTML = `
      <div class="trade-summary">${note}</div>
      <div class="result-group">
        <h4><span class="dot want"></span>You receive (their duplicates you're missing) — ${r.iReceive.length}</h4>
        ${numGrid(r.iReceive)}
      </div>
      <div class="result-group">
        <h4><span class="dot give"></span>You give (your duplicates they want) — ${r.iGive.length}</h4>
        ${numGrid(r.iGive)}
      </div>
    `;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  /* ---------------- Boot ---------------- */
  function boot() {
    initTabs();
    initImport();
    Stickers.init();
    initOcr();
    initTrade();
    const ver = $("app-version");
    if (ver) ver.textContent = "World Cup Sticker Matcher · v" + APP_VERSION;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);
