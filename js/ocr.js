/* ocr.js — run in-browser OCR (Tesseract.js) on an uploaded image and
 * extract candidate sticker numbers, each tagged with a confidence.
 *
 * Detected token shape: { text: string, confidence: number, low: boolean }
 */
(function (global) {
  "use strict";

  // Tokens whose confidence is below this are flagged "low" (still shown,
  // but the user is nudged to double-check them).
  const LOW_CONFIDENCE = 60;

  // Sticker labels: mostly digits, sometimes a short country/team prefix.
  // Accept 1–4 letters optionally, then 1–4 digits (e.g. 12, 205, ARG3, FWC12).
  const TOKEN_RE = /^[A-Z]{0,4}\d{1,4}$/;

  function cleanToken(raw) {
    return String(raw || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
  }

  /**
   * Extract candidate numbers from Tesseract word data.
   * Returns a de-duplicated array of tokens (best confidence kept per token).
   */
  function extractTokens(words) {
    const byText = new Map();
    for (const w of words || []) {
      // A word may itself contain several numbers separated by punctuation.
      const parts = String(w.text || "").split(/[\s,;/|]+/);
      for (const part of parts) {
        const t = cleanToken(part);
        if (!t || !TOKEN_RE.test(t)) continue;
        const conf = typeof w.confidence === "number" ? w.confidence : 0;
        const prev = byText.get(t);
        if (!prev || conf > prev.confidence) {
          byText.set(t, { text: t, confidence: conf, low: conf < LOW_CONFIDENCE });
        }
      }
    }
    return Array.from(byText.values()).sort((a, b) =>
      a.text.localeCompare(b.text, undefined, { numeric: true })
    );
  }

  const Ocr = {
    LOW_CONFIDENCE,
    extractTokens, // exported for tests

    /**
     * Recognise an image File. `onProgress(fraction, label)` is optional.
     * Resolves to { tokens, rawText }.
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
        const words =
          data.words ||
          (data.blocks || []).flatMap((b) =>
            (b.paragraphs || []).flatMap((p) =>
              (p.lines || []).flatMap((l) => l.words || [])
            )
          );
        return { tokens: extractTokens(words), rawText: data.text || "" };
      } finally {
        URL.revokeObjectURL(url);
      }
    },
  };

  global.Ocr = Ocr;
})(window);
