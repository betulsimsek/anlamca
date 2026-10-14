// Renders 1280x800 Chrome Web Store screenshots (TR and EN) with the real
// bubble and popup code, fed with saved TDK answers from test/fixtures.
// Usage: node scripts/store-screenshots.mjs   (PUPPETEER_MODULE may point to puppeteer)
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const puppeteer = (await import(process.env.PUPPETEER_MODULE || "puppeteer")).default;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "store-assets");
const read = p => readFileSync(join(ROOT, p), "utf8");

const ctx = vm.createContext({ AbortController, setTimeout, clearTimeout, encodeURIComponent });
for (const f of ["src/stem.js", "src/tdk.js"]) vm.runInContext(read(f), ctx);
const result = word => JSON.parse(JSON.stringify({
  query: word === "kitap" ? "kitaplarımızdan" : word,
  word,
  entries: ctx.AnlamcaTdk.parseEntries(JSON.parse(read(`test/fixtures/${word}.json`))),
  url: "https://sozluk.gov.tr/?ara=" + encodeURIComponent(word)
}));
const KITAP = result("kitap");
const GUZEL = result("güzel");

const COPY = {
  tr: {
    title: "Kelimeyi seç, anlamı orada.",
    lines: ["TDK Güncel Türkçe Sözlük, sayfadan ayrılmadan", "Ekli kelimeleri de çözer: kitaplarımızdan → kitap", "Örnek cümleler, köken, atasözleri", "Sadece aradığın kelime TDK'ya gider. Veri toplanmaz."],
    article: "Akşam yemeğinden sonra hep birlikte oturup <mark>kitaplarımızdan</mark> birini sesli okumaya karar verdik. Herkes sırayla bir sayfa okuyacak, sonra okuduklarımızı konuşacaktık."
  },
  en: {
    title: "Select a word. The meaning is right there.",
    lines: ["The TDK Turkish dictionary, without leaving the page", "Understands inflected words: kitaplarımızdan → kitap", "Example sentences, etymology, proverbs", "Only the word you look up goes to TDK. No data collection."],
    article: "Akşam yemeğinden sonra hep birlikte oturup <mark>kitaplarımızdan</mark> birini sesli okumaya karar verdik. Herkes sırayla bir sayfa okuyacak, sonra okuduklarımızı konuşacaktık."
  }
};

const browser = await puppeteer.launch({
  headless: true,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`, "--no-first-run"]
});
const swTarget = await browser.waitForTarget(t => t.type() === "service_worker" && t.url().includes("background.js"));
const extId = new URL(swTarget.url()).host;
const icon = "data:image/png;base64," + readFileSync(join(ROOT, "icons", "icon128.png")).toString("base64");

function messagesFor(lang) {
  const msgs = JSON.parse(read(`_locales/${lang}/messages.json`));
  return msgs;
}

// Same placeholder rules as chrome.i18n.getMessage.
const stubI18n = `
  window.__msg = (msgs, key, subs) => {
    const m = msgs[key]; if (!m) return key;
    let s = m.message;
    for (const [name, ph] of Object.entries(m.placeholders || {})) {
      const idx = Number(ph.content.slice(1)) - 1;
      s = s.replace(new RegExp("\\\\$" + name + "\\\\$", "gi"), [].concat(subs || [])[idx] ?? "");
    }
    return s;
  };`;

for (const [lang, copy] of Object.entries(COPY)) {
  const msgs = messagesFor(lang);

  // 1) The bubble over an article.
  const page = await browser.newPage();
  await page.setViewport({ width: 600, height: 560, deviceScaleFactor: 2 });
  await page.setContent(`<!doctype html><html><body style="margin:0;background:#fff;font:19px/1.7 Georgia,serif;color:#222">
    <div style="padding:28px 40px 0"><div style="font:600 13px -apple-system,sans-serif;color:#999;letter-spacing:.05em">BLOG · OKUMA ALIŞKANLIĞI</div>
    <h1 style="font-size:30px;margin:8px 0 14px">Ailece sesli okuma akşamları</h1>
    <p id="p" style="margin:0">${copy.article}</p></div></body></html>`);
  await page.evaluate((stub, msgs, r) => {
    eval(stub);
    Object.defineProperty(window, "chrome", { configurable: true, writable: true, value: {
      i18n: { getMessage: (k, s) => window.__msg(msgs, k, s) },
      runtime: { sendMessage: async () => r, onMessage: { addListener() {} } }
    } });
    window.__anlamcaDblclick = true;
    document.querySelectorAll("mark").forEach(m => { m.style.background = "#fde8d8"; });
  }, stubI18n, msgs, KITAP);
  await page.addScriptTag({ content: read("src/render.js") });
  await page.addScriptTag({ content: read("src/bubble.js") });
  const box = await page.$eval("mark", el => { const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await page.mouse.click(box.x, box.y, { count: 2 });
  await page.waitForSelector("anlamca-bubble");
  await new Promise(r => setTimeout(r, 300));
  const bubbleShot = await page.screenshot({ encoding: "base64" });
  await page.close();

  // 2) The popup with a full result.
  const popup = await browser.newPage();
  await popup.setViewport({ width: 360, height: 600, deviceScaleFactor: 2 });
  await popup.evaluateOnNewDocument((stub, msgs, r) => {
    eval(stub);
    chrome.i18n.getMessage = (k, s) => window.__msg(msgs, k, s);
    chrome.runtime.sendMessage = async () => r;
    chrome.tabs.query = async () => [];
    chrome.storage.local.get = async () => ({ recent: ["güzel", "kitap", "ağaç", "göz atmak", "gitmek"], dblclick: true });
  }, stubI18n, msgs, GUZEL);
  await popup.goto(`chrome-extension://${extId}/src/popup.html`);
  await popup.type("#q", "güzel");
  await popup.click("#search button");
  await popup.waitForSelector("#result .aw-word");
  await new Promise(r => setTimeout(r, 300));
  const ph = await popup.evaluate(() => Math.min(document.body.scrollHeight, 600));
  const popupShot = await popup.screenshot({ encoding: "base64", clip: { x: 0, y: 0, width: 360, height: ph } });
  await popup.close();

  const card = await browser.newPage();
  await card.setViewport({ width: 1280, height: 800 });
  await card.setContent(`<!doctype html><html><body style="margin:0;width:1280px;height:800px;box-sizing:border-box;padding:56px 64px;
    background:linear-gradient(135deg,#b5482c,#7d2e1a);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#fff;display:flex;gap:40px">
    <div style="width:370px;flex-shrink:0;display:flex;flex-direction:column;justify-content:center">
      <img src="${icon}" width="72" height="72" style="border-radius:16px">
      <h1 style="font-size:38px;line-height:1.15;margin:24px 0 26px;font-weight:700">${copy.title}</h1>
      ${copy.lines.map(l => `<p style="font-size:18px;margin:0 0 12px;color:#fde8d8">✓ ${l}</p>`).join("")}
    </div>
    <div style="flex:1;display:flex;gap:22px;align-items:center">
      <img src="data:image/png;base64,${bubbleShot}" style="width:470px;border-radius:12px;box-shadow:0 24px 60px rgba(0,0,0,.35)">
      <img src="data:image/png;base64,${popupShot}" style="width:270px;border-radius:12px;box-shadow:0 24px 60px rgba(0,0,0,.4)">
    </div>
  </body></html>`);
  await card.screenshot({ path: join(OUT, `screenshot-${lang}.png`) });
  await card.close();
  console.log(`store-assets/screenshot-${lang}.png`);
}

await browser.close();
