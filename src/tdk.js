// Anlamca: TDK Güncel Türkçe Sözlük client.
// Queries https://sozluk.gov.tr/gts for the lookup candidates one at a time
// and stops at the first one TDK knows. The API is slow and often hangs,
// and parallel requests make it worse, so requests are sequential, each has
// a timeout and one retry, and the whole lookup has a time budget.
(function (root) {
  "use strict";

  const API = "https://sozluk.gov.tr/gts?ara=";
  const TIMEOUT_MS = 13000;
  const BUDGET_MS = 30000;

  async function fetchJson(url, fetchImpl, deadline) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const left = deadline - Date.now();
      if (left <= 0) break;
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), Math.min(TIMEOUT_MS, left));
      try {
        const res = await fetchImpl(url, { signal: ctrl.signal, credentials: "omit" });
        const text = await res.text();
        if (text.trim()) return JSON.parse(text);
      } catch (e) {
        // Timeout, network error or invalid JSON: retry once, then give up.
      } finally {
        clearTimeout(timer);
      }
    }
    return null;
  }

  // Keeps only what the bubble shows; never passes TDK's HTML through.
  function parseEntries(data) {
    if (!Array.isArray(data)) return [];
    return data.map(m => ({
      word: m.madde || "",
      origin: (m.lisan || "").trim(),
      meanings: (m.anlamlarListe || []).map(a => ({
        text: (a.anlam || "").trim(),
        tags: (a.ozelliklerListe || []).map(o => o.tam_adi).filter(Boolean),
        example: ((a.orneklerListe || [])[0] || {}).ornek || "",
        author: ((((a.orneklerListe || [])[0] || {}).yazar || [])[0] || {}).tam_adi || ""
      })).filter(a => a.text),
      compounds: (m.birlesikler || "").split(",").map(s => s.trim()).filter(Boolean),
      proverbs: (m.atasozu || []).map(a => a.madde).filter(Boolean)
    })).filter(e => e.word && e.meanings.length);
  }

  function tdkUrl(word) {
    return "https://sozluk.gov.tr/?ara=" + encodeURIComponent(word);
  }

  // Returns { query, word, entries, url } or { query, entries: [], offline }.
  async function lookup(text, options) {
    const opts = options || {};
    const fetchImpl = opts.fetch || root.fetch.bind(root);
    const tried = root.AnlamcaStem.candidates(text, opts.maxCandidates || 6);
    if (tried.length === 0) return { query: text, entries: [], tried };
    const deadline = Date.now() + (opts.budgetMs || BUDGET_MS);
    let answered = 0;
    for (const c of tried) {
      if (Date.now() >= deadline) break;
      const data = await fetchJson(API + encodeURIComponent(c), fetchImpl, deadline);
      if (data === null) break; // TDK stopped answering; later candidates would hang too.
      answered++;
      const entries = parseEntries(data);
      if (entries.length) {
        return { query: text, word: c, entries, tried, url: tdkUrl(c) };
      }
    }
    // "Not found" only when TDK answered for every candidate; if any request
    // timed out the answer is unknown, which the UI shows as unreachable.
    return { query: text, entries: [], tried, offline: answered < tried.length, url: tdkUrl(tried[0]) };
  }

  root.AnlamcaTdk = { lookup, parseEntries };
})(typeof globalThis !== "undefined" ? globalThis : this);
