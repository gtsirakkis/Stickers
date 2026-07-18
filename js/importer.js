/* importer.js — parse CSV / Excel / plain-text into sticker records.
 * Uses PapaParse (CSV) and SheetJS (Excel), both loaded in index.html.
 */
(function (global) {
  "use strict";

  const NUMBER_HEADERS = ["number", "no", "num", "sticker", "id", "code", "#"];
  const STATUS_HEADERS = ["status", "state", "have", "type", "owned"];

  // "NEED / HAVE" per-team grid support (a very common collector layout).
  const NEED_RE = /^(need|needs|want|wanted|wants|missing|miss)$/i;
  const HAVE_RE = /^(have|haves|spare|spares|swap|swaps|double|doubles|dup|dupe|dupes|duplicate|duplicates|got)$/i;
  const TEAM_RE = /^[A-Za-z][A-Za-z.\- ]{1,11}$/; // a team/country code or name
  const NUM_RE = /^\d{1,4}$/;

  /**
   * Detect a NEED/HAVE grid header within the first few rows.
   * Returns { headerIndex, needCol, haveCol } or null.
   */
  function findMatrixHeader(rows) {
    const limit = Math.min(rows.length, 5);
    for (let r = 0; r < limit; r++) {
      const row = rows[r] || [];
      let needCol = -1;
      let haveCol = -1;
      for (let i = 0; i < row.length; i++) {
        const v = String(row[i] == null ? "" : row[i]).trim();
        if (needCol === -1 && NEED_RE.test(v)) needCol = i;
        if (HAVE_RE.test(v)) haveCol = i; // last HAVE wins (right-hand block)
      }
      if (needCol !== -1 && haveCol !== -1 && haveCol > needCol) {
        return { headerIndex: r, needCol, haveCol };
      }
    }
    return null;
  }

  /**
   * Convert a NEED/HAVE grid into records. Each row is a team; numbers under
   * NEED become "TEAM n" (Missing) and numbers under HAVE become "TEAM n"
   * (Duplicate). The left block is columns [0, haveCol); the right block is
   * [haveCol, end). The team code is the first alphabetic cell in each block.
   */
  function matrixToRecords(rows, m) {
    const records = [];
    const isNum = (v) => NUM_RE.test(String(v == null ? "" : v).trim());
    const isTeam = (v) => TEAM_RE.test(String(v == null ? "" : v).trim());
    for (let r = m.headerIndex + 1; r < rows.length; r++) {
      const row = rows[r];
      if (!row) continue;
      const left = row.slice(0, m.haveCol);
      const right = row.slice(m.haveCol);

      let leftTeam = "";
      for (const c of left) if (isTeam(c)) { leftTeam = String(c).trim().toUpperCase(); break; }
      let rightTeam = "";
      for (const c of right) if (isTeam(c)) { rightTeam = String(c).trim().toUpperCase(); break; }
      if (!rightTeam) rightTeam = leftTeam; // right block often omits the code

      for (let i = m.needCol; i < left.length; i++) {
        if (leftTeam && isNum(left[i])) {
          records.push({ number: leftTeam + " " + String(left[i]).trim(), status: "Missing" });
        }
      }
      for (let i = 0; i < right.length; i++) {
        if (rightTeam && isNum(right[i])) {
          records.push({ number: rightTeam + " " + String(right[i]).trim(), status: "Duplicate" });
        }
      }
    }
    return records;
  }

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

    // Per-team NEED/HAVE grid takes priority over the simple 2-column layout.
    const matrix = findMatrixHeader(cleaned);
    if (matrix) return matrixToRecords(cleaned, matrix);

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
    rowsToRecords, // exposed for tests / reuse

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
