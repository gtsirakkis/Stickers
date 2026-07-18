/* app.js — wire up tabs, imports, OCR review, matching and trade UI. */
(function (global) {
  "use strict";

  // Bump this on every release so you can confirm which build a phone is
  // running. Keep it in step with CACHE_VERSION in sw.js.
  const APP_VERSION = "1.1.0";

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

  /* ---------------- OCR review chips ---------------- */
  function renderChips() {
    const box = $("detected-chips");
    box.innerHTML = "";
    if (!detectedTokens.length) {
      box.innerHTML = '<span class="result-empty">No numbers detected — add them manually.</span>';
      return;
    }
    detectedTokens.forEach((tok, i) => {
      const chip = document.createElement("span");
      chip.className = "chip" + (tok.low ? " low" : "");
      chip.innerHTML = `${escapeHtml(tok.text)} <span class="x">✕</span>`;
      chip.title = tok.low
        ? `Low confidence (${Math.round(tok.confidence)}%) — tap to remove`
        : "Tap to remove";
      chip.addEventListener("click", () => {
        detectedTokens.splice(i, 1);
        renderChips();
      });
      box.appendChild(chip);
    });
  }

  function initOcr() {
    $("ocr-file").addEventListener("change", async (e) => {
      const file = e.target.files[0];
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
        const { tokens } = await Ocr.recognize(file, (frac, label) => {
          prog.textContent = `${label}… ${Math.round((frac || 0) * 100)}%`;
        });
        detectedTokens = tokens;
        prog.className = "status-line ok";
        prog.textContent = `Detected ${tokens.length} candidate number(s). Review below.`;
        renderChips();
        $("review-card").hidden = false;
      } catch (err) {
        console.error(err);
        prog.className = "status-line error";
        prog.textContent = "OCR failed: " + (err.message || err);
      } finally {
        e.target.value = "";
      }
    });

    $("add-detected-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const input = $("add-detected-number");
      const val = input.value.trim();
      if (!val) return;
      const key = Store.normalize(val);
      if (!detectedTokens.some((t) => Store.normalize(t.text) === key)) {
        detectedTokens.push({ text: val, confidence: 100, low: false });
      }
      input.value = "";
      input.focus();
      renderChips();
    });

    $("compare-btn").addEventListener("click", () => {
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
    $("match-results").innerHTML = `
      <div class="result-group">
        <h4><span class="dot want"></span>They have — you're MISSING (${res.want.length})</h4>
        ${numGrid(res.want)}
      </div>
      <div class="result-group">
        <h4><span class="dot have"></span>You already own these (${res.already.length})</h4>
        ${numGrid(res.already)}
      </div>
      <div class="result-group">
        <h4><span class="dot unknown"></span>Not on your list — check manually (${res.unknown.length})</h4>
        ${numGrid(res.unknown)}
      </div>
      <div class="result-group">
        <h4><span class="dot unknown"></span>Not confidently recognised (${res.lowconf.length})</h4>
        ${numGrid(res.lowconf)}
      </div>
    `;
  }

  /* ---------------- Trade tab ---------------- */
  function getTheirWanted() {
    return Importer.parseNumberList($("their-missing-text").value);
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
          nums = recs.map((r) => r.number);
        } else {
          const text = await file.text();
          nums = Importer.parseNumberList(text);
        }
        const existing = $("their-missing-text").value.trim();
        $("their-missing-text").value = (existing ? existing + "\n" : "") + nums.join(", ");
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
      // Not their wanted list — this fills nothing; scanned dups are used
      // automatically. Give feedback instead.
      const status = $("their-missing-status");
      status.className = "status-line";
      status.textContent = detectedTokens.length
        ? `Using ${detectedTokens.length} scanned duplicate(s) as their "give" list.`
        : "No scanned duplicates yet — use the Scan tab first.";
    });

    $("trade-btn").addEventListener("click", () => {
      const result = Trade.build(detectedTokens, getTheirWanted());
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
    renderChips();
    const ver = $("app-version");
    if (ver) ver.textContent = "World Cup Sticker Matcher · v" + APP_VERSION;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);
