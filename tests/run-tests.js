/* Minimal, dependency-free test runner for the pure logic modules.
 * Loads the browser IIFE modules against a fake `window`/`localStorage`
 * (Node's global object) so no browser or test framework is required.
 *
 *   node tests/run-tests.js
 */
"use strict";
const fs = require("fs");
const path = require("path");

// ---- Fake browser globals ----------------------------------------------
class FakeStorage {
  constructor() { this.m = {}; }
  getItem(k) { return k in this.m ? this.m[k] : null; }
  setItem(k, v) { this.m[k] = String(v); }
  removeItem(k) { delete this.m[k]; }
}
global.localStorage = new FakeStorage();
global.window = global; // modules do (function(global){...})(window)

// ---- Load modules in dependency order ----------------------------------
const root = path.join(__dirname, "..", "js");
for (const f of ["storage.js", "importer.js", "ocr.js", "matcher.js", "trade.js"]) {
  // eslint-disable-next-line no-eval
  eval(fs.readFileSync(path.join(root, f), "utf8"));
}

// ---- Tiny test harness --------------------------------------------------
let passed = 0, failed = 0;
function eq(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function test(name, fn) {
  global.localStorage.m = {}; // reset collection between tests
  try {
    fn();
    passed++;
    console.log("  ✓ " + name);
  } catch (e) {
    failed++;
    console.log("  ✗ " + name + "\n      " + e.message);
  }
}
function assert(cond, msg) { if (!cond) throw new Error(msg || "assertion failed"); }
function assertEq(a, b, msg) {
  if (!eq(a, b)) throw new Error((msg || "not equal") + `\n      got: ${JSON.stringify(a)}\n      want: ${JSON.stringify(b)}`);
}

// ---- Store --------------------------------------------------------------
console.log("Store");
test("normalize collapses case, whitespace & leading zeros", () => {
  assertEq(Store.normalize("  arg 3 "), "ARG 3");
  assertEq(Store.normalize("Arg  3"), "ARG 3");
  assertEq(Store.normalize("ecu 03"), "ECU 3"); // 0X == X
  assertEq(Store.normalize("07"), "7");
});
test("countryCodes and maxNumber summarise the collection", () => {
  Store.importRecords(
    [
      { number: "ECU 1", status: "Missing" },
      { number: "ECU 20", status: "Owned" },
      { number: "NED 5", status: "Duplicate" },
    ],
    false
  );
  const codes = Store.countryCodes();
  assert(codes.has("ECU") && codes.has("NED") && codes.size === 2);
  assertEq(Store.maxNumber(), 20);
});
test("normalizeStatus maps synonyms", () => {
  assertEq(Store.normalizeStatus("have"), "Owned");
  assertEq(Store.normalizeStatus("need"), "Missing");
  assertEq(Store.normalizeStatus("spare"), "Duplicate");
  assertEq(Store.normalizeStatus("???"), null);
});
test("upsert adds then updates", () => {
  assertEq(Store.upsert("12", "Owned"), "added");
  assertEq(Store.upsert("12", "Duplicate"), "updated");
  assertEq(Store.find("12").status, "Duplicate");
  assertEq(Store.all().length, 1);
});
test("upsert treats normalised numbers as the same sticker", () => {
  Store.upsert("arg 3", "Missing");
  Store.upsert("ARG3", "Owned"); // different raw text, different key (space matters)
  // "arg 3" -> "ARG 3", "ARG3" -> "ARG3" : these are intentionally distinct
  assertEq(Store.all().length, 2);
  Store.upsert("Arg 3", "Duplicate"); // same key as "arg 3"
  assertEq(Store.find("arg 3").status, "Duplicate");
  assertEq(Store.all().length, 2);
});
test("numberSet returns normalised keys per status", () => {
  Store.upsert("5", "Missing");
  Store.upsert("6", "Missing");
  Store.upsert("7", "Owned");
  const missing = Store.numberSet("Missing");
  assert(missing.has("5") && missing.has("6") && !missing.has("7"));
});
test("importRecords merges and counts", () => {
  Store.upsert("1", "Owned");
  const res = Store.importRecords(
    [{ number: "1", status: "Duplicate" }, { number: "2", status: "Missing" }],
    true
  );
  assertEq(res, { added: 1, updated: 1, total: 2 });
});
test("importRecords replace wipes previous", () => {
  Store.upsert("99", "Owned");
  Store.importRecords([{ number: "1", status: "Missing" }], false);
  assertEq(Store.all().length, 1);
  assert(!Store.find("99"));
});

// ---- Importer -----------------------------------------------------------
console.log("Importer");
test("parseNumberList splits on any separator", () => {
  assertEq(Importer.parseNumberList("12, 45\n200  ARG3;7"), ["12", "45", "200", "ARG3", "7"]);
});
test("toCsv escapes and round-trips headers", () => {
  const csv = Importer.toCsv([{ number: "1", status: "Owned", note: "a,b" }]);
  assertEq(csv, 'number,status,note\n1,Owned,"a,b"');
});
test("rowsToRecords parses a NEED/HAVE per-team grid", () => {
  const grid = [
    ["", "", "NEED", "", "", "", "HAVE", ""],
    ["", "MEX", "3", "6", "", "MEX", "9", "17"],
    ["", "FWC", "2", "", "", "FWC", "10", ""],
  ];
  const recs = Importer.rowsToRecords(grid);
  assertEq(recs, [
    { number: "MEX 3", status: "Missing" },
    { number: "MEX 6", status: "Missing" },
    { number: "MEX 9", status: "Duplicate" },
    { number: "MEX 17", status: "Duplicate" },
    { number: "FWC 2", status: "Missing" },
    { number: "FWC 10", status: "Duplicate" },
  ]);
});
test("rowsToRecords still parses a simple number/status list", () => {
  const recs = Importer.rowsToRecords([
    ["number", "status"],
    ["12", "Owned"],
    ["13", "Missing"],
  ]);
  assertEq(recs, [
    { number: "12", status: "Owned" },
    { number: "13", status: "Missing" },
  ]);
});

// ---- Ocr.parseLines -----------------------------------------------------
console.log("Ocr");
const KNOWN = new Set(["ECU", "NED", "JPN", "COL", "JOR"]);
test("parseLines combines each country with its numbers", () => {
  const toks = Ocr.parseLines(["ECU 1, 2, 8, 16, 17, 20"], { knownCodes: KNOWN, maxNumber: 20 });
  assertEq(toks.map((t) => t.text), ["ECU 1", "ECU 2", "ECU 8", "ECU 16", "ECU 17", "ECU 20"]);
  assert(toks.every((t) => !t.low), "all should be high confidence");
});
test("parseLines ignores flag/colon punctuation between code and numbers", () => {
  const toks = Ocr.parseLines(["JPN @: 1, 2, 4"], { knownCodes: KNOWN, maxNumber: 20 });
  assertEq(toks.map((t) => t.text), ["JPN 1", "JPN 2", "JPN 4"]);
});
test("parseLines fuzzily corrects a mis-read country code (flagged low)", () => {
  const toks = Ocr.parseLines(["COLM 3, 4"], { knownCodes: KNOWN, maxNumber: 20 });
  assertEq(toks.map((t) => t.text), ["COL 3", "COL 4"]);
  assert(toks.every((t) => t.low), "fuzzy-matched code should be low confidence");
});
test("parseLines flags out-of-range junk numbers", () => {
  const toks = Ocr.parseLines(["ECU 171, 616"], { knownCodes: KNOWN, maxNumber: 20 });
  assert(toks.every((t) => t.low), "numbers above maxNumber should be low");
});
test("parseLines treats 0X and X as the same sticker (via later normalise)", () => {
  const toks = Ocr.parseLines(["ECU 03, 3"], { knownCodes: KNOWN, maxNumber: 20 });
  // parseInt drops the leading zero, so both collapse to ECU 3 (deduped).
  assertEq(toks.map((t) => t.text), ["ECU 3"]);
});
test("parseLines de-duplicates repeats across accumulated images", () => {
  // e.g. two screenshots that both include the ECU line.
  const toks = Ocr.parseLines(
    ["ECU 1, 2, 8", "NED 4, 5", "ECU 1, 2, 8"],
    { knownCodes: KNOWN, maxNumber: 20 }
  );
  assertEq(toks.map((t) => t.text), ["ECU 1", "ECU 2", "ECU 8", "NED 4", "NED 5"]);
});
test("matchCode returns exact then fuzzy", () => {
  assertEq(Ocr.matchCode("NED", KNOWN), { code: "NED", fuzzy: false });
  assertEq(Ocr.matchCode("NAD", KNOWN), { code: "NED", fuzzy: true });
  assertEq(Ocr.matchCode("ZZZ", KNOWN), null);
});

// ---- Matcher ------------------------------------------------------------
console.log("Matcher");
test("match splits want / already / unknown / lowconf", () => {
  Store.importRecords(
    [
      { number: "3", status: "Missing" },
      { number: "4", status: "Owned" },
      { number: "5", status: "Duplicate" },
    ],
    false
  );
  const res = Matcher.match([
    { text: "3", low: false }, // missing -> want
    { text: "4", low: false }, // owned -> already
    { text: "5", low: false }, // duplicate -> already
    { text: "8", low: false }, // not on list -> unknown
    { text: "9", low: true },  // low confidence
  ]);
  assertEq(res.want, ["3"]);
  assertEq(res.already.sort(), ["4", "5"]);
  assertEq(res.unknown, ["8"]);
  assertEq(res.lowconf, ["9"]);
});
test("match de-duplicates and treats 03 == 3", () => {
  Store.upsert("ECU 3", "Missing");
  const res = Matcher.match(["ECU 3", "ECU 03", "ECU 3"]);
  assertEq(res.want, ["ECU 3"]); // all collapse to one via leading-zero normalise
  assertEq(res.unknown, []);
});
test("match works on country+number tokens", () => {
  Store.importRecords(
    [
      { number: "ECU 3", status: "Missing" },
      { number: "NED 3", status: "Owned" }, // same number, different country
    ],
    false
  );
  const res = Matcher.match([{ text: "ECU 3" }, { text: "NED 3" }]);
  assertEq(res.want, ["ECU 3"]);   // missing for Ecuador
  assertEq(res.already, ["NED 3"]); // owned for Netherlands
});

// ---- Trade --------------------------------------------------------------
console.log("Trade");
test("build proposes a two-way exchange", () => {
  Store.importRecords(
    [
      { number: "10", status: "Missing" },   // I want 10
      { number: "11", status: "Missing" },   // I want 11
      { number: "20", status: "Duplicate" }, // I can give 20
      { number: "21", status: "Duplicate" }, // I can give 21
    ],
    false
  );
  const theirDuplicates = ["10", "99"];        // they can give 10 (I want) & 99 (I don't)
  const theirWanted = ["20", "50"];            // they want 20 (I have) & 50 (I don't)
  const r = Trade.build(theirDuplicates, theirWanted);
  assertEq(r.iReceive, ["10"]);
  assertEq(r.iGive, ["20"]);
  assertEq(r.pairs, 1);
  assert(r.balanced === true);
});
test("build reports no pairs when nothing lines up", () => {
  Store.upsert("10", "Missing");
  const r = Trade.build(["77"], ["88"]);
  assertEq(r.pairs, 0);
  assertEq(r.iReceive, []);
  assertEq(r.iGive, []);
});

// ---- Summary ------------------------------------------------------------
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
