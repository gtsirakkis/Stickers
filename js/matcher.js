/* matcher.js — compare a list of detected numbers against my collection.
 *
 * Given the other collector's DUPLICATES (what they can give), split them into:
 *   - want    : they have it AND it is on my Missing list  -> I want these
 *   - owned   : I already own it (Owned or Duplicate)      -> no need
 *   - unknown : not on my list at all                      -> decide manually
 *   - lowconf : OCR wasn't confident (needs my review)
 */
(function (global) {
  "use strict";

  /**
   * @param {Array<{text:string, low?:boolean}>|string[]} detected
   * @returns categorised result with de-duplicated, display-ready numbers.
   */
  function match(detected) {
    const missing = Store.numberSet("Missing");
    const owned = Store.numberSet("Owned");
    const dup = Store.numberSet("Duplicate");

    // A NEED/HAVE list only records Missing + Duplicate; singles you own are
    // simply absent. So with no explicit "Owned" rows, a sticker that's not on
    // the list means you already own it (don't need it) rather than "unknown".
    const notListedMeansOwned = owned.size === 0;

    const want = [];
    const already = [];
    const unknown = [];
    const lowconf = [];
    const seen = new Set();

    for (const item of detected) {
      const text = typeof item === "string" ? item : item.text;
      const low = typeof item === "string" ? false : !!item.low;
      const key = Store.normalize(text);
      if (!key || seen.has(key)) continue;
      seen.add(key);

      if (low) {
        lowconf.push(text);
        continue;
      }
      if (missing.has(key)) {
        want.push(text);
      } else if (owned.has(key) || dup.has(key)) {
        already.push(text);
      } else if (notListedMeansOwned) {
        already.push(text);
      } else {
        unknown.push(text);
      }
    }

    const bynum = (a, b) => a.localeCompare(b, undefined, { numeric: true });
    want.sort(bynum);
    already.sort(bynum);
    unknown.sort(bynum);
    lowconf.sort(bynum);
    return { want, already, unknown, lowconf };
  }

  global.Matcher = { match };
})(window);
