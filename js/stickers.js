/* stickers.js — render and manage the collection list UI. */
(function (global) {
  "use strict";

  const listEl = () => document.getElementById("sticker-list");
  const countsEl = () => document.getElementById("status-counts");
  const summaryEl = () => document.getElementById("collection-summary");

  let searchTerm = "";
  let filterStatus = "all";

  /** Sort by numeric value when possible, else lexicographically. */
  function compareRecords(a, b) {
    const na = parseInt(String(a.number).replace(/\D/g, ""), 10);
    const nb = parseInt(String(b.number).replace(/\D/g, ""), 10);
    const aNum = String(a.number).match(/^\d+$/);
    const bNum = String(b.number).match(/^\d+$/);
    if (aNum && bNum) return na - nb;
    return String(a.number).localeCompare(String(b.number), undefined, { numeric: true });
  }

  function renderCounts() {
    const all = Store.all();
    const c = { Owned: 0, Missing: 0, Duplicate: 0 };
    for (const r of all) if (c[r.status] != null) c[r.status]++;
    countsEl().innerHTML = [
      `<span class="count-pill">Owned <b>${c.Owned}</b></span>`,
      `<span class="count-pill">Missing <b>${c.Missing}</b></span>`,
      `<span class="count-pill">Duplicate <b>${c.Duplicate}</b></span>`,
    ].join("");
    summaryEl().textContent = `${all.length} stickers`;
  }

  function render() {
    renderCounts();
    const term = searchTerm.trim().toUpperCase();
    let records = Store.all();
    if (filterStatus !== "all") records = records.filter((r) => r.status === filterStatus);
    if (term) records = records.filter((r) => String(r.number).toUpperCase().includes(term));
    records.sort(compareRecords);

    const el = listEl();
    if (!records.length) {
      el.innerHTML = `<div class="empty">No stickers${
        term || filterStatus !== "all" ? " match this filter" : " yet — import a list or add one above"
      }.</div>`;
      return;
    }

    el.innerHTML = "";
    for (const r of records) {
      const row = document.createElement("div");
      row.className = "sticker-row";
      row.innerHTML = `
        <span class="sticker-num">${escapeHtml(r.number)}</span>
        <select data-num="${escapeAttr(r.number)}" aria-label="status">
          ${Store.VALID.map(
            (v) => `<option value="${v}"${v === r.status ? " selected" : ""}>${v}</option>`
          ).join("")}
        </select>
        <button class="icon-btn" data-del="${escapeAttr(r.number)}" title="Delete">🗑</button>
      `;
      el.appendChild(row);
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }
  function escapeAttr(s) {
    return escapeHtml(s);
  }

  const Stickers = {
    render,
    setSearch(v) { searchTerm = v; render(); },
    setFilter(v) { filterStatus = v; render(); },

    init() {
      // status change / delete (event delegation)
      listEl().addEventListener("change", (e) => {
        const sel = e.target.closest("select[data-num]");
        if (sel) {
          Store.setStatus(sel.getAttribute("data-num"), sel.value);
          renderCounts();
        }
      });
      listEl().addEventListener("click", (e) => {
        const del = e.target.closest("button[data-del]");
        if (del) {
          Store.remove(del.getAttribute("data-del"));
          render();
        }
      });

      document.getElementById("add-form").addEventListener("submit", (e) => {
        e.preventDefault();
        const numEl = document.getElementById("add-number");
        const stEl = document.getElementById("add-status");
        const num = numEl.value.trim();
        if (!num) return;
        Store.upsert(num, stEl.value);
        numEl.value = "";
        numEl.focus();
        render();
      });

      document.getElementById("search-box").addEventListener("input", (e) => {
        this.setSearch(e.target.value);
      });
      document.getElementById("filter-status").addEventListener("change", (e) => {
        this.setFilter(e.target.value);
      });

      document.getElementById("export-btn").addEventListener("click", () => {
        const csv = Importer.toCsv(Store.all());
        const blob = new Blob([csv], { type: "text/csv" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "my-stickers.csv";
        a.click();
        URL.revokeObjectURL(a.href);
      });

      document.getElementById("clear-btn").addEventListener("click", () => {
        if (confirm("Delete your entire collection? This cannot be undone.")) {
          Store.clear();
          render();
        }
      });

      render();
    },
  };

  global.Stickers = Stickers;
})(window);
