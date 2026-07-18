/* importer.js — parse CSV / Excel / plain-text into sticker records.
 * Uses PapaParse (CSV) and SheetJS (Excel), both loaded in index.html.
 */
(function (global) {
  "use strict";

  const NUMBER_HEADERS = ["number", "no", "num", "sticker", "id", "code", "#"];
  const STATUS_HEADERS = ["status", "state", "have", "type", "owned"];

  function pickColumn(headers, candidates) {
    const lower = headers.map((h) => String(h || "").trim().toLowerCase());
    for (const cand of candidates) {
      const i = lower.indexOf(cand);
      if (i !== -1) return i;
    }
    // partial match (e.g. "sticker number")
    for (let i = 0; i < lower.length; i++) {
      if (candidates.some((c) => lower[i].includes(c))) return i;
    }
    return -1;
  }

  /**
   * Turn an array-of-arrays (rows) into records.
   * Detects a header row; if none, assumes col0=number, col1=status.
   */
  function rowsToRecords(rows) {
    const cleaned = rows.filter((r) => r && r.some((c) => String(c).trim() !== ""));
    if (!cleaned.length) return [];

    const first = cleaned[0].map((c) => String(c || "").trim().toLowerCase());
    const looksLikeHeader =
      first.some((c) => NUMBER_HEADERS.includes(c) || c.includes("number")) ||
      first.some((c) => STATUS_HEADERS.includes(c));

    let numCol = 0;
    let statCol = 1;
    let body = cleaned;

    if (looksLikeHeader) {
      const headers = cleaned[0];
      numCol = pickColumn(headers, NUMBER_HEADERS);
      statCol = pickColumn(headers, STATUS_HEADERS);
      if (numCol === -1) numCol = 0;
      body = cleaned.slice(1);
    }

    const records = [];
    for (const row of body) {
      const number = row[numCol];
      if (number == null || String(number).trim() === "") continue;
      const status = statCol !== -1 ? row[statCol] : "";
      records.push({ number: String(number).trim(), status: String(status || "").trim() });
    }
    return records;
  }

  const Importer = {
    /** Parse a File (CSV or Excel) -> Promise<records[]> */
    parseFile(file) {
      const name = (file.name || "").toLowerCase();
      if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
        return this.parseExcel(file);
      }
      return this.parseCsv(file);
    },

    parseCsv(file) {
      return new Promise((resolve, reject) => {
        if (!global.Papa) {
          reject(new Error("CSV library not loaded (check your internet connection)."));
          return;
        }
        global.Papa.parse(file, {
          skipEmptyLines: true,
          complete: (res) => {
            try {
              resolve(rowsToRecords(res.data));
            } catch (e) {
              reject(e);
            }
          },
          error: reject,
        });
      });
    },

    parseExcel(file) {
      return new Promise((resolve, reject) => {
        if (!global.XLSX) {
          reject(new Error("Excel library not loaded (check your internet connection)."));
          return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = new Uint8Array(e.target.result);
            const wb = global.XLSX.read(data, { type: "array" });
            const sheet = wb.Sheets[wb.SheetNames[0]];
            const rows = global.XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false });
            resolve(rowsToRecords(rows));
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
      });
    },

    /** Parse free text / a wanted-list file into an array of raw number strings. */
    parseNumberList(text) {
      return String(text || "")
        .split(/[\s,;\n\r\t]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    },

    /** Build CSV text from the current collection for export. */
    toCsv(records) {
      const header = "number,status,note";
      const lines = records.map((r) => {
        const esc = (v) => {
          const s = String(v == null ? "" : v);
          return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        };
        return [esc(r.number), esc(r.status), esc(r.note || "")].join(",");
      });
      return [header, ...lines].join("\n");
    },
  };

  global.Importer = Importer;
})(window);
