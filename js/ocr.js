/* ocr.js — in-browser OCR (Tesseract.js) plus line-aware parsing.
 *
 * Collectors' lists are structured one country per line:
 *     ECU 🏴: 1, 2, 8, 16, 17, 20
 *     NED 🏴: 2, 3, 4, 5, 7, 8, 18, 19, 20
 * A bare number is meaningless (number 2 exists for every country), so we
 * read the COUNTRY first and combine it with each number -> "ECU 2".
 *
 * parseLines() is pure (no Tesseract, no DOM) so it is unit-testable. It uses
 * the set of known country codes (from the user's own collection) to validate
 * and fuzzily correct the code OCR read, and a max sticker number to flag junk.
 *
 * Token shape: { text: "ECU 2", confidence: number, low: boolean }
 */
(function (global) {
  "use strict";

  const LOW_CONFIDENCE = 60;

  /** Levenshtein distance, capped early for speed. */
  function editDistance(a, b) {
    const m = a.length, n = b.length;
    if (Math.abs(m - n) > 1) return 2; // we only care about <= 1
    const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      }
    }
    return dp[m][n];
  }

  /**
   * Resolve a leading letter-run to a known country code.
   * Handles the common OCR artifact where the flag emoji is read as 1-2 extra
   * letters AFTER the code (TUR -> "TURKS", ALG -> "ALGER", CIV -> "CIVID").
   */
  function matchCode(candidate, knownCodes) {
    const cand = String(candidate || "").toUpperCase();
    if (!cand) return null;
    if (knownCodes.has(cand)) return { code: cand, fuzzy: false };

    // Trailing junk from the flag: a known code is a prefix of the candidate.
    // Prefer the longest matching code (e.g. so "USA…" beats a 2-letter code).
    let prefix = null;
    for (const code of knownCodes) {
      if (cand.length > code.length && cand.startsWith(code)) {
        if (!prefix || code.length > prefix.length) prefix = code;
      }
    }
    if (prefix) return { code: prefix, fuzzy: true };

    // A single wrong/missing letter anywhere (on the run or its first 3 chars).
    const tries = cand.length > 3 ? [cand, cand.slice(0, 3)] : [cand];
    for (const t of tries) {
      if (knownCodes.has(t)) return { code: t, fuzzy: true };
      let best = null;
      for (const code of knownCodes) {
        if (editDistance(t, code) <= 1) {
          if (!best || Math.abs(code.length - t.length) < Math.abs(best.length - t.length)) {
            best = code;
          }
        }
      }
      if (best) return { code: best, fuzzy: true };
    }
    return null;
  }

  /**
   * Parse OCR line strings into country+number tokens.
   * @param {string[]} lines
   * @param {{knownCodes?: Set<string>, maxNumber?: number}} opts
   */
  function parseLines(lines, opts) {
    opts = opts || {};
    const known = opts.knownCodes || new Set();
    const maxNumber = opts.maxNumber || Infinity;
    const tokens = [];
    const seen = new Set();

    let lastCode = null; // for wrapped continuation lines

    for (const raw of lines || []) {
      const line = String(raw == null ? "" : raw).trim();
      if (!line) continue;

      // Leading letters = candidate country code (+ any flag letters OCR added).
      const lead = line.match(/^([A-Za-z]{2,6})/);
      let code = null;
      let unresolved = false; // letters present but not identifiable
      if (lead) {
        if (known.size) {
          const hit = matchCode(lead[1], known);
          if (hit) {
            // Exact OR fuzzy: a code that resolves to one already in your
            // collection is trustworthy (the flag emoji is often mis-read as an
            // extra letter), so we use it for matching rather than discarding it.
            code = hit.code;
          } else {
            code = lead[1].toUpperCase(); // show it, but flag for review
            unresolved = true;
          }
        } else {
          code = lead[1].toUpperCase();
        }
      }

      // A numbers-only line inherits the previous country — this is a row that
      // wrapped onto a second line (e.g. "ECU 1, 2, 8" then "16, 17, 20").
      let inherited = false;
      if (!lead && lastCode) {
        code = lastCode;
        inherited = true;
      }
      if (code && !inherited && !unresolved) lastCode = code;

      // Numbers after the leading letters (ignores flag/colon punctuation).
      const rest = lead ? line.slice(lead[1].length) : line;
      const nums = rest.match(/\d{1,3}/g) || [];
      for (const ns of nums) {
        const n = parseInt(ns, 10);
        if (!n) continue;
        const outOfRange = n > maxNumber;
        const text = code ? code + " " + n : String(n);
        const key = text.toUpperCase();
        if (seen.has(key)) continue;
        seen.add(key);
        const low = !code || outOfRange || unresolved;
        tokens.push({ text, confidence: low ? 40 : 90, low });
      }
    }
    return tokens;
  }

  const Ocr = {
    LOW_CONFIDENCE,
    parseLines,
    matchCode, // exported for tests

    /**
     * Recognise an image File. `onProgress(fraction, label)` is optional.
     * Resolves to { lines: string[], rawText }.
     */
    async recognize(file, onProgress) {
      if (!global.Tesseract) {
        throw new Error("OCR library not loaded (check your internet connection).");
      }
      const url = URL.createObjectURL(file);
      try {
        const result = await global.Tesseract.recognize(url, "eng", {
          logger: (m) => {
            if (onProgress && m.status) onProgress(m.progress || 0, m.status);
          },
        });
        const data = result.data || {};
        let lines = (data.lines || []).map((l) => (l.text || "").trim()).filter(Boolean);
        if (!lines.length && data.text) {
          lines = String(data.text).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
        }
        return { lines, rawText: data.text || "" };
      } finally {
        URL.revokeObjectURL(url);
      }
    },
  };

  global.Ocr = Ocr;
})(window);
