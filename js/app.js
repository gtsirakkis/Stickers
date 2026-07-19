/* app.js — wire up tabs, imports, OCR review, matching and trade UI. */
(function (global) {
  "use strict";

  // Bump this on every release so you can confirm which build a phone is
  // running. Keep it in step with CACHE_VERSION in sw.js.
  const APP_VERSION = "1.5.0";

  const $ = (id) => document.getElementById(id);

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

  /* ---------------- Match & swap (two-sided scan) ---------------- */

  // Widgets for each side: what they GIVE (spares) and what they NEED (wants).
  const SIDES = {
    give: { text: "give-text", prog: "give-progress", preview: "give-preview", summary: "give-summary" },
    need: { text: "need-text", prog: "need-progress", preview: "need-preview", summary: "need-summary" },
  };

  function parseSide(side) {
    const lines = String($(SIDES[side].text).value || "").split(/\r?\n/);
    return Ocr.parseLines(lines, {
      knownCodes: Store.countryCodes(),
      maxNumber: Store.maxNumber(),
    });
  }

  function updateSideSummary(side) {
    const toks = parseSide(side);
    const flagged = toks.filter((t) => t.low).length;
    const el = $(SIDES[side].summary);
    el.className = "status-line";
    el.textContent = toks.length
      ? `${toks.length} sticker(s)` + (flagged ? ` · ${flagged} to check` : "")
      : "";
  }

  function appendLinesTo(textId, lines) {
    const ta = $(textId);
    const existing = ta.value.replace(/\s+$/, "");
    const add = (lines || []).join("\n");
    if (!add) return;
    ta.value = existing ? existing + "\n" + add : add;
  }

  // OCR one or many images into the given side's review box (accumulates).
  async function handleImageFiles(fileList, inputEl, side) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const cfg = SIDES[side];
    const prog = $(cfg.prog);
    const preview = $(cfg.preview);
    $("results-card").hidden = true;

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        preview.src = URL.createObjectURL(file);
        preview.hidden = false;
        const tag = files.length > 1 ? `Image ${i + 1}/${files.length}: ` : "";
        prog.className = "status-line";
        prog.textContent = tag + "starting…";
        const { lines } = await Ocr.recognize(file, (frac, label) => {
          prog.textContent = `${tag}${label}… ${Math.round((frac || 0) * 100)}%`;
        });
        appendLinesTo(cfg.text, lines);
        updateSideSummary(side);
      }
      prog.className = "status-line ok";
      prog.textContent =
        (files.length > 1 ? `Added ${files.length} images. ` : "Done. ") +
        "Review the list, then compare.";
    } catch (err) {
      console.error(err);
      prog.className = "status-line error";
      prog.textContent = "OCR failed: " + (err.message || err);
    } finally {
      if (inputEl) inputEl.value = ""; // allow re-selecting the same file(s)
    }
  }

  function initScan() {
    ["give", "need"].forEach((side) => {
      [side + "-camera", side + "-upload"].forEach((id) => {
        const el = $(id);
        if (el) el.addEventListener("change", (e) => handleImageFiles(e.target.files, e.target, side));
      });
      $(side + "-text").addEventListener("input", () => updateSideSummary(side));
      $(side + "-clear").addEventListener("click", () => {
        $(SIDES[side].text).value = "";
        updateSideSummary(side);
        $(SIDES[side].preview).hidden = true;
        $(SIDES[side].prog).textContent = "";
        $("results-card").hidden = true;
      });
    });

    $("compare-btn").addEventListener("click", () => {
      renderSwapResults(parseSide("give"), parseSide("need"));
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

  function renderSwapResults(give, need) {
    const giveOk = give.filter((t) => !t.low); // their spares (confident reads)
    const needOk = need.filter((t) => !t.low); // their wants (confident reads)
    const low = give.filter((t) => t.low).concat(need.filter((t) => t.low)).map((t) => t.text);

    const swap = Trade.build(giveOk, needOk); // iReceive (I get) / iGive (I give)
    const giveMatch = Matcher.match(giveOk);  // to surface "you already have"

    const note = swap.pairs
      ? `A balanced swap of <b>${swap.pairs}</b> for <b>${swap.pairs}</b> is possible` +
        (swap.balanced ? "." : ", with extras on one side.")
      : giveOk.length || needOk.length
      ? "No matching pairs yet — nothing lines up both ways."
      : "Add their spares (①) and/or their wants (②) above, then compare.";

    let html = `<div class="trade-summary">${note}</div>
      <div class="result-group">
        <h4><span class="dot want"></span>You RECEIVE — they give, you need (${swap.iReceive.length})</h4>
        ${numGrid(swap.iReceive)}
      </div>
      <div class="result-group">
        <h4><span class="dot give"></span>You GIVE — they want, you have spare (${swap.iGive.length})</h4>
        ${numGrid(swap.iGive)}
      </div>`;
    if (giveMatch.already.length) {
      html += `
      <div class="result-group">
        <h4><span class="dot have"></span>They give, but you already have / don't need (${giveMatch.already.length})</h4>
        ${numGrid(giveMatch.already)}
      </div>`;
    }
    if (low.length) {
      low.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
      html += `
      <div class="result-group">
        <h4><span class="dot unknown"></span>Couldn't read confidently — fix above &amp; re-compare (${low.length})</h4>
        ${numGrid(low)}
      </div>`;
    }
    $("match-results").innerHTML = html;
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
    initScan();
    const ver = $("app-version");
    if (ver) ver.textContent = "World Cup Sticker Matcher · v" + APP_VERSION;
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(window);
