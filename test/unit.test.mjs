import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = name => readFileSync(join(ROOT, "test", "fixtures", name + ".json"), "utf8");

// Load the scripts the way the extension does: classic scripts on globalThis.
const ctx = vm.createContext({ AbortController, setTimeout, clearTimeout, encodeURIComponent });
for (const f of ["stem.js", "tdk.js"]) vm.runInContext(readFileSync(join(ROOT, "src", f), "utf8"), ctx);
const { candidates, normalize } = ctx.AnlamcaStem;
const { lookup, parseEntries } = ctx.AnlamcaTdk;
const list = (w, n) => [...candidates(w, n)];

test("normalize trims punctuation, quotes and proper-noun suffixes", () => {
  assert.equal(normalize("  “Kitabı,” "), "kitabı");
  assert.equal(normalize("İstanbul’da"), "istanbul");
  assert.equal(normalize("IŞIK"), "ışık");
  assert.equal(normalize("göz   atmak"), "göz atmak");
});

test("plural, possessive and case suffixes peel off to the lemma", () => {
  assert.ok(list("kitaplarımızdan").includes("kitap"));
  assert.ok(list("evlerimizden").includes("ev"));
});

test("consonant softening is undone", () => {
  assert.ok(list("ağacı").includes("ağaç"));
  assert.ok(list("gözlüğünü", 7).includes("gözlük"));
  assert.ok(list("renginden", 7).includes("renk"));
});

test("verbal suffixes put the infinitive before the bare stem", () => {
  const c = list("okuyorlar");
  assert.ok(c.indexOf("okumak") !== -1 && c.indexOf("okumak") < c.indexOf("ok"), c.join());
  assert.ok(list("gidiyorum").includes("gitmek"));
  assert.ok(list("sevdik")[1] === "sevmek");
});

test("the original word is always tried first; phrases are not stemmed", () => {
  assert.equal(list("güzel")[0], "güzel");
  assert.deepEqual(list("göz atmak"), ["göz atmak"]);
  assert.deepEqual(list("   "), []);
});

test("parseEntries keeps meanings, tags, examples, authors and proverbs", () => {
  const [e] = parseEntries(JSON.parse(fixture("güzel")));
  assert.equal(e.word, "güzel");
  assert.ok(e.meanings.length >= 10);
  assert.equal(e.meanings[0].tags[0], "sıfat");
  assert.ok(e.meanings.some(m => m.author));
  assert.ok(e.proverbs.length > 0);
  const [k] = parseEntries(JSON.parse(fixture("kitap")));
  assert.equal(k.origin, "Arapça kitāb");
});

test("parseEntries returns nothing for TDK's not-found answer", () => {
  assert.deepEqual([...parseEntries(JSON.parse(fixture("zzzq")))], []);
});

function fakeFetch(map, calls) {
  return async url => {
    const word = decodeURIComponent(url.split("ara=")[1]);
    calls && calls.push(word);
    const body = map[word];
    if (body === "hang") return new Promise(() => {});
    return { text: async () => (body === undefined ? fixture("zzzq") : body) };
  };
}

test("lookup returns the first candidate TDK knows", async () => {
  const r = await lookup("kitaplarımızdan", { fetch: fakeFetch({ kitap: fixture("kitap") }) });
  assert.equal(r.word, "kitap");
  assert.equal(r.url, "https://sozluk.gov.tr/?ara=kitap");
  assert.equal(r.entries[0].word, "kitap");
});

test("lookup retries an empty body once", async () => {
  let n = 0;
  const flaky = async () => ({ text: async () => (n++ === 0 ? "" : fixture("güzel")) });
  const r = await lookup("güzel", { fetch: flaky, maxCandidates: 1 });
  assert.equal(r.entries[0].word, "güzel");
  assert.equal(n, 2);
});

test("lookup reports offline when every request fails", async () => {
  const down = async () => { throw new Error("network"); };
  const r = await lookup("güzel", { fetch: down });
  assert.equal(r.entries.length, 0);
  assert.equal(r.offline, true);
});

test("lookup says not found (not offline) when TDK answers but has no entry", async () => {
  const r = await lookup("zzzq", { fetch: fakeFetch({}) });
  assert.equal(r.entries.length, 0);
  assert.ok(!r.offline);
});

test("a timeout part-way through is reported as offline, not as not-found", async () => {
  let n = 0;
  const partial = async () => (n++ === 0 ? { text: async () => fixture("zzzq") } : Promise.reject(new Error("timeout")));
  const r = await lookup("kitaplarımızdan", { fetch: partial });
  assert.equal(r.entries.length, 0);
  assert.equal(r.offline, true);
});
