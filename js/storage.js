/* storage.js — data layer backed by localStorage.
 *
 * A sticker record is: { number: string, status: 'Owned'|'Missing'|'Duplicate', note?: string }
 * `number` is the raw label the user typed/imported. We key records by a
 * NORMALISED form so "arg 3", "ARG3" and "Arg  3" are treated as the same
 * sticker for matching, while still displaying the original text.
 */
(function (global) {
  "use strict";

  const KEY = "wcsm.collection.v1";
  const VALID = ["Owned", "Missing", "Duplicate"];

  /**
   * Normalise a sticker label for comparison/keying.
   * Leading zeros on the number are stripped so "ECU 03" == "ECU 3" == "ecu 3".
   */
  function normalize(raw) {
    return String(raw == null ? "" : raw)
      .trim()
      .toUpperCase()
      .replace(/\s+/g, " ")
      .replace(/\d+/g, (d) => String(parseInt(d, 10)));
  }

  /** Map a free-text status onto a valid status, or null if unrecognised. */
  function normalizeStatus(raw) {
    const s = String(raw == null ? "" : raw).trim().toLowerCase();
    if (!s) return null;
    if (["owned", "own", "have", "got", "o", "yes", "y"].includes(s)) return "Owned";
    if (["missing", "miss", "need", "want", "m", "no", "n"].includes(s)) return "Missing";
    if (["duplicate", "dup", "dupe", "double", "swap", "spare", "d"].includes(s))
      return "Duplicate";
    // Exact case-insensitive match to a canonical value
    const hit = VALID.find((v) => v.toLowerCase() === s);
    return hit || null;
  }

  function load() {
    try {
      const raw = global.localStorage.getItem(KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      console.error("Failed to read collection", e);
      return [];
    }
  }

  function persist(records) {
    global.localStorage.setItem(KEY, JSON.stringify(records));
  }

  const Store = {
    VALID,
    normalize,
    normalizeStatus,

    /** All records (array copy). */
    all() {
      return load();
    },

    /** Records whose status matches (already an array copy). */
    byStatus(status) {
      return load().filter((r) => r.status === status);
    },

    /** Set of normalised numbers for a given status. */
    numberSet(status) {
      const set = new Set();
      for (const r of load()) {
        if (r.status === status) set.add(normalize(r.number));
      }
      return set;
    },

    /** Distinct country/team codes present in the collection (e.g. "ECU"). */
    countryCodes() {
      const set = new Set();
      for (const r of load()) {
        const m = String(r.number).trim().toUpperCase().match(/^([A-Z][A-Z .]*?)\s*\d+$/);
        if (m && m[1].trim()) set.add(m[1].trim());
      }
      return set;
    },

    /** Highest sticker number seen in the collection (Infinity if none). */
    maxNumber() {
      let max = 0;
      for (const r of load()) {
        const m = String(r.number).match(/(\d+)\s*$/);
        if (m) max = Math.max(max, parseInt(m[1], 10));
      }
      return max || Infinity;
    },

    /** Look up a record by (normalised) number. */
    find(number) {
      const key = normalize(number);
      return load().find((r) => normalize(r.number) === key) || null;
    },

    /**
     * Insert or update a record. Later status wins on conflict.
     * Returns 'added' | 'updated'.
     */
    upsert(number, status, note) {
      const st = normalizeStatus(status) || "Missing";
      const key = normalize(number);
      if (!key) return null;
      const records = load();
      const existing = records.find((r) => normalize(r.number) === key);
      if (existing) {
        existing.status = st;
        if (note != null) existing.note = note;
        persist(records);
        return "updated";
      }
      records.push({ number: String(number).trim(), status: st, note: note || "" });
      persist(records);
      return "added";
    },

    /** Change just the status of an existing record. */
    setStatus(number, status) {
      const st = normalizeStatus(status);
      if (!st) return false;
      const key = normalize(number);
      const records = load();
      const rec = records.find((r) => normalize(r.number) === key);
      if (!rec) return false;
      rec.status = st;
      persist(records);
      return true;
    },

    remove(number) {
      const key = normalize(number);
      const records = load().filter((r) => normalize(r.number) !== key);
      persist(records);
    },

    /** Replace the whole collection with the given array. */
    replaceAll(records) {
      persist(Array.isArray(records) ? records : []);
    },

    clear() {
      global.localStorage.removeItem(KEY);
    },

    /**
     * Bulk import. `merge` keeps existing records (updating on conflict);
     * otherwise the collection is replaced. Returns {added, updated, total}.
     */
    importRecords(incoming, merge) {
      let base = merge ? load() : [];
      const index = new Map(base.map((r) => [normalize(r.number), r]));
      let added = 0;
      let updated = 0;
      for (const item of incoming) {
        const key = normalize(item.number);
        if (!key) continue;
        const st = normalizeStatus(item.status) || "Missing";
        if (index.has(key)) {
          const rec = index.get(key);
          rec.status = st;
          if (item.note != null) rec.note = item.note;
          updated++;
        } else {
          const rec = {
            number: String(item.number).trim(),
            status: st,
            note: item.note || "",
          };
          index.set(key, rec);
          base.push(rec);
          added++;
        }
      }
      persist(base);
      return { added, updated, total: base.length };
    },
  };

  global.Store = Store;
})(window);
