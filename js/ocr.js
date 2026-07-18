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

  /** Find a known code equal to (or within 1 edit of) the candidate. */
  function matchCode(candidate, knownCodes) {
    const cand = String(candidate || "").toUpperCase();
    if (!cand) return null;
    if (knownCodes.has(cand)) return { code: cand, fuzzy: false };
    let best = null;
    for (const code of knownCodes) {
      if (editDistance(cand, code) <= 1) {
        if (!best || Math.abs(code.length - cand.length) < Math.abs(best.length - cand.length)) {
          best = code;
        }
      }
    }
    return best ? { code: best, fuzzy: true } : null;
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

    for (const raw of lines || []) {
      const line = String(raw == null ? "" : raw).trim();
      if (!line) continue;

      // Leading letters = candidate country code.
      const lead = line.match(/^([A-Za-z]{2,5})/);
      let code = null;
      let fuzzy = false;
      if (lead && known.size) {
        const hit = matchCode(lead[1], known);
        if (hit) { code = hit.code; fuzzy = hit.fuzzy; }
      } else if (lead) {
        code = lead[1].toUpperCase();
      }

      // Numbers after the leading letters (ignores flag/colon punctuation).
      const rest = lead ? line.slice(lead[1].length) : line;
      const nums = rest.match(/\d{1,3}/g) || [];
      for (const ns of nums) {
        const n = parseInt(ns, 10);
        if (!n) continue;
        const outOfRange = n > maxNumber;
        const text = code ? code + " " + n : String(n);
        const key = code ? code + " " + n : String(n);
        if (seen.has(key)) continue;
        seen.add(key);
        const low = !code || fuzzy || outOfRange;
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
