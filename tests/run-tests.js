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
test("normalize collapses case & whitespace", () => {
  assertEq(Store.normalize("  arg 3 "), "ARG 3");
  assertEq(Store.normalize("Arg  3"), "ARG 3");
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

// ---- Ocr.extractTokens --------------------------------------------------
console.log("Ocr");
test("extractTokens keeps valid labels & flags low confidence", () => {
  const words = [
    { text: "12", confidence: 95 },
    { text: "ARG3", confidence: 88 },
    { text: "hello", confidence: 99 },   // not a sticker label
    { text: "45", confidence: 40 },      // low confidence
    { text: "99999", confidence: 90 },   // too many digits -> rejected
  ];
  const toks = Ocr.extractTokens(words);
  const map = Object.fromEntries(toks.map((t) => [t.text, t]));
  assert(map["12"] && !map["12"].low, "12 should be present, high conf");
  assert(map["ARG3"], "ARG3 should be present");
  assert(map["45"] && map["45"].low, "45 should be low confidence");
  assert(!map["HELLO"], "words should be rejected");
  assert(!map["99999"], "5-digit token should be rejected");
});
test("extractTokens splits words containing several numbers", () => {
  const toks = Ocr.extractTokens([{ text: "12,45/7", confidence: 90 }]);
  assertEq(toks.map((t) => t.text).sort(), ["12", "45", "7"]);
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
test("match de-duplicates detected numbers", () => {
  Store.upsert("3", "Missing");
  const res = Matcher.match(["3", "3", "03"]);
  assertEq(res.want, ["3"]); // "3" and "03" are different keys; "3" appears once
  assert(res.unknown.includes("03"));
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
