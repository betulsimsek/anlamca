// Anlamca: builds the definition card as DOM nodes (never innerHTML), so it
// is safe to use inside any page's shadow root and in the popup.
(function (root) {
  "use strict";

  const MAX_MEANINGS = 4;
  const MAX_PROVERBS = 3;

  function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text) n.textContent = text;
    return n;
  }

  function link(text, href) {
    const a = el("a", "aw-link", text);
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    return a;
  }

  // t: function(key, subs) returning localized UI strings.
  function renderResult(result, t, opts) {
    const options = opts || {};
    const card = el("div", "aw-card");
    if (!result || result.loading) {
      card.appendChild(el("div", "aw-status", t(result && result.slow ? "slow" : "loading")));
      return card;
    }
    if (!result.entries || result.entries.length === 0) {
      card.appendChild(el("div", "aw-word", result.query || ""));
      card.appendChild(el("div", "aw-status", result.offline ? t("offline") : t("notFound")));
      // Still give the reader somewhere to go: TDK's own site and Wiktionary.
      const word = (result.tried && result.tried[0]) || result.query || "";
      if (word) {
        const foot = el("div", "aw-foot");
        foot.appendChild(link(t("openInTdk"), "https://sozluk.gov.tr/?ara=" + encodeURIComponent(word)));
        foot.appendChild(link(t("openInWiktionary"), "https://tr.wiktionary.org/wiki/" + encodeURIComponent(word)));
        card.appendChild(foot);
      }
      return card;
    }

    const head = el("div", "aw-head");
    head.appendChild(el("div", "aw-word", result.entries[0].word));
    if (result.word && result.query && result.word !== result.query.toLocaleLowerCase("tr")) {
      head.appendChild(el("div", "aw-from", t("fromQuery", [result.query])));
    }
    card.appendChild(head);

    const maxMeanings = options.full ? 50 : MAX_MEANINGS;
    let shown = 0;
    for (const entry of result.entries) {
      if (entry.origin) card.appendChild(el("div", "aw-origin", entry.origin));
      const list = el("ol", "aw-meanings");
      for (const m of entry.meanings) {
        if (shown >= maxMeanings) break;
        const li = el("li");
        if (m.tags.length) li.appendChild(el("span", "aw-tags", m.tags.join(", ") + " "));
        li.appendChild(document.createTextNode(m.text));
        if (m.example) {
          const ex = el("div", "aw-example", "“" + m.example + "”");
          if (m.author) ex.appendChild(el("span", "aw-author", " — " + m.author));
          li.appendChild(ex);
        }
        list.appendChild(li);
        shown++;
      }
      if (list.childNodes.length) card.appendChild(list);
    }

    const proverbs = result.entries.flatMap(e => e.proverbs).slice(0, options.full ? 10 : MAX_PROVERBS);
    if (proverbs.length) {
      card.appendChild(el("div", "aw-label", t("proverbs")));
      const ul = el("ul", "aw-proverbs");
      for (const p of proverbs) ul.appendChild(el("li", "", p));
      card.appendChild(ul);
    }

    const total = result.entries.reduce((n, e) => n + e.meanings.length, 0);
    const foot = el("div", "aw-foot");
    if (total > shown) foot.appendChild(el("span", "aw-more", t("moreMeanings", [String(total - shown)])));
    foot.appendChild(link(t("openInTdk"), result.url));
    card.appendChild(foot);
    return card;
  }

  const CSS = `
    .aw-card{font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--aw-text);}
    .aw-head{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:4px}
    .aw-word{font-weight:700;font-size:16px}
    .aw-from{font-size:12px;color:var(--aw-muted)}
    .aw-origin{font-size:12px;color:var(--aw-muted);font-style:italic;margin-bottom:4px}
    .aw-status{color:var(--aw-muted);padding:2px 0}
    .aw-meanings{margin:4px 0 6px 18px;padding:0}
    .aw-meanings li{margin:0 0 6px}
    .aw-tags{font-size:11.5px;color:var(--aw-accent);font-style:italic}
    .aw-example{font-size:12.5px;color:var(--aw-muted);margin-top:2px}
    .aw-author{font-style:italic}
    .aw-label{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--aw-muted);margin-top:6px}
    .aw-proverbs{margin:2px 0 6px 18px;padding:0;font-size:13px}
    .aw-foot{display:flex;justify-content:space-between;align-items:center;gap:8px;border-top:1px solid var(--aw-border);padding-top:6px;margin-top:4px;font-size:12px}
    .aw-more{color:var(--aw-muted)}
    .aw-link{color:var(--aw-accent);text-decoration:none}
    .aw-more + .aw-link,.aw-foot > .aw-link:first-child{margin-left:auto}
    .aw-link:hover{text-decoration:underline}
  `;

  const THEME = `
    :host, .aw-root{--aw-bg:#fffdf8;--aw-text:#2c2c2a;--aw-muted:#6b6a64;--aw-border:#e3e1d8;--aw-accent:#b5482c}
    @media (prefers-color-scheme: dark){
      :host, .aw-root{--aw-bg:#2a2927;--aw-text:#f1efe8;--aw-muted:#b4b2a9;--aw-border:#46453f;--aw-accent:#f0a183}
    }
  `;

  root.AnlamcaRender = { renderResult, CSS, THEME };
})(typeof globalThis !== "undefined" ? globalThis : this);
