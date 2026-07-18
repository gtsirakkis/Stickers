/* trade.js — build a proposed two-way exchange.
 *
 * Inputs:
 *   theirDuplicates : numbers the other collector can give (from the Scan tab)
 *   theirWanted     : numbers the other collector is missing (typed/imported)
 *
 * Output:
 *   iReceive : theirDuplicates ∩ myMissing      (they give -> I receive)
 *   iGive    : theirWanted     ∩ myDuplicates   (I give   -> they receive)
 *   plus the number of matched pairs (min of the two) for a "fair" swap.
 */
(function (global) {
  "use strict";

  function toKeySet(list) {
    const set = new Set();
    const display = new Map(); // key -> original display text
    for (const item of list || []) {
      const text = typeof item === "string" ? item : item.text;
      const key = Store.normalize(text);
      if (!key) continue;
      set.add(key);
      if (!display.has(key)) display.set(key, String(text).trim());
    }
    return { set, display };
  }

  function intersectDisplay(keySet, displayMap, otherSet) {
    const out = [];
    for (const key of keySet) {
      if (otherSet.has(key)) out.push(displayMap.get(key));
    }
    return out.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }

  function build(theirDuplicates, theirWanted) {
    const myMissing = Store.numberSet("Missing");
    const myDup = Store.numberSet("Duplicate");

    const theirDup = toKeySet(theirDuplicates);
    const theirWant = toKeySet(theirWanted);

    const iReceive = intersectDisplay(theirDup.set, theirDup.display, myMissing);
    const iGive = intersectDisplay(theirWant.set, theirWant.display, myDup);

    return {
      iReceive,
      iGive,
      pairs: Math.min(iReceive.length, iGive.length),
      balanced: iReceive.length === iGive.length,
    };
  }

  global.Trade = { build };
})(window);
