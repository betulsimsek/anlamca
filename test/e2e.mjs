// End-to-end test in Chrome for Testing.
// Usage: node test/e2e.mjs   (needs puppeteer; PUPPETEER_MODULE may point to it)
// Talks to the real sozluk.gov.tr, so it needs network access.
import http from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const puppeteer = (await import(process.env.PUPPETEER_MODULE || "puppeteer")).default;
const EXT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = f => readFileSync(join(EXT, "src", f), "utf8");

const server = http.createServer((req, res) => {
  res.setHeader("content-type", "text/html; charset=utf-8");
  res.end(`<!doctype html><title>t</title><p style="margin:40px;font-size:20px">
    Bu akşam <span id="w">kitaplarımızdan</span> birini okuyacağız.</p>`);
});
await new Promise(r => server.listen(0, "127.0.0.1", r));
const base = `http://localhost:${server.address().port}`;

const browser = await puppeteer.launch({
  headless: true,
  args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`, "--no-first-run", "--lang=tr",
    ...(process.env.CI ? ["--no-sandbox"] : [])]
});

const results = [];
class Skip extends Error {}
async function check(name, fn) {
  try {
    await fn();
    results.push(["ok", name]);
  } catch (e) {
    results.push([e instanceof Skip ? "SKIP" : "FAIL", name, e.message]);
  }
}
let tdkReachable = true;

const swTarget = await browser.waitForTarget(t => t.type() === "service_worker" && t.url().endsWith("src/background.js"));
const sw = await swTarget.worker();
const extId = new URL(swTarget.url()).host;

await check("service worker loads the stemmer and TDK client", async () => {
  const ok = await sw.evaluate(() => typeof AnlamcaStem.candidates === "function" && typeof AnlamcaTdk.lookup === "function");
  assert.equal(ok, true);
});

await check("no broad host access at install; only sozluk.gov.tr", async () => {
  const perms = await sw.evaluate(() => chrome.permissions.getAll());
  assert.deepEqual(perms.origins, ["https://sozluk.gov.tr/*"]);
  const scripts = await sw.evaluate(() => chrome.scripting.getRegisteredContentScripts());
  assert.equal(scripts.length, 0);
});

await check("popup looks a word up on the real TDK API", async () => {
  const popup = await browser.newPage();
  await popup.goto(`chrome-extension://${extId}/src/popup.html`);
  await popup.type("#q", "güzel");
  await popup.click("#search button");
  await popup.waitForFunction(() => document.querySelector("#result .aw-word, #result .aw-status:not(:empty)") &&
    !/Aranıyor|Looking up|geç yanıt|slow to answer/.test(document.querySelector("#result").textContent), { timeout: 60000 });
  const word = await popup.$eval("#result", el => (el.querySelector(".aw-word") || {}).textContent);
  const status = await popup.$eval("#result", el => el.textContent);
  if (/yanıt vermiyor|isn't answering/.test(status)) {
    tdkReachable = false;
    // The offline state must still offer the fallback links.
    assert.equal(await popup.$$eval("#result .aw-link", l => l.length), 2);
    await popup.close();
    throw new Skip("TDK unreachable right now; checked the offline fallback instead");
  }
  assert.equal(word, "güzel", status.slice(0, 200));
  const meanings = await popup.$$eval("#result .aw-meanings li", l => l.length);
  assert.ok(meanings >= 1);
  await popup.close();
});

await check("lookups are cached and recorded in recent words", async () => {
  if (!tdkReachable) throw new Skip("needs a TDK answer");
  const { cache, recent } = await sw.evaluate(() => chrome.storage.local.get(["cache", "recent"]));
  assert.ok(cache["güzel"], "cached");
  assert.equal(recent[0], "güzel");
});

await check("double-click on a page opens the bubble and Escape closes it", async () => {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => m.type() === "error" && errors.push(m.text()));
  await page.goto(base);
  const fixture = JSON.parse(readFileSync(join(EXT, "test", "fixtures", "kitap.json"), "utf8"));
  const result = await sw.evaluate(f => ({ query: "kitaplarımızdan", word: "kitap", entries: AnlamcaTdk.parseEntries(f), url: "https://sozluk.gov.tr/?ara=kitap" }), fixture);
  // Without the optional permission the test cannot register the content
  // script, so load the same files into the page with a stubbed chrome API.
  await page.evaluate(r => {
    Object.defineProperty(window, "chrome", {
      configurable: true,
      writable: true,
      value: { i18n: { getMessage: k => k }, runtime: { sendMessage: async () => r, onMessage: { addListener() {} } } }
    });
    window.__anlamcaDblclick = true;
  }, result);
  await page.addScriptTag({ content: src("render.js") });
  await page.addScriptTag({ content: src("bubble.js") });
  const box = await page.$eval("#w", el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.click(box.x, box.y, { count: 2 });
  await page.waitForSelector("anlamca-bubble", { timeout: 5000 }).catch(e => { throw new Error(e.message + " | " + errors.join(" | ")); });
  const size = await page.$eval("anlamca-bubble", h => h.getBoundingClientRect().width >= 0);
  assert.ok(size);
  await page.keyboard.press("Escape");
  assert.equal(await page.$("anlamca-bubble"), null);
  await page.close();
});

await browser.close();
server.close();
for (const r of results) console.log(r.join("  "));
await new Promise(r => setTimeout(r, 0));
const failed = results.filter(r => r[0] === "FAIL").length;
const skipped = results.filter(r => r[0] === "SKIP").length;
console.log(`${results.length - failed - skipped} passed, ${skipped} skipped, ${failed} failed`);
process.exit(failed ? 1 : 0);
