// Anlamca: in-page definition bubble.
// Injected on demand (context menu, keyboard shortcut) through activeTab, or
// registered as a content script on every page when the user turns on
// "double-click to look up" and grants the optional host permission.
// Safe to inject more than once.
(function () {
  "use strict";
  if (window.__anlamcaBubble) return;
  window.__anlamcaBubble = true;

  const { renderResult, CSS, THEME } = AnlamcaRender;
  const t = (key, subs) => chrome.i18n.getMessage(key, subs);

  let host = null;
  let shadow = null;
  let panel = null;
  let requestId = 0;

  function ensureHost() {
    if (host && host.isConnected) return;
    host = document.createElement("anlamca-bubble");
    host.style.cssText = "all:initial;position:absolute;top:0;left:0;z-index:2147483647;";
    shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = THEME + CSS + `
      .aw-panel{position:absolute;width:340px;max-width:calc(100vw - 24px);max-height:360px;overflow:auto;
        background:var(--aw-bg);border:1px solid var(--aw-border);border-radius:10px;padding:10px 12px;
        box-shadow:0 10px 30px rgba(0,0,0,.18);box-sizing:border-box}
      .aw-close{position:absolute;top:4px;right:6px;border:none;background:none;color:var(--aw-muted);
        font-size:16px;line-height:1;cursor:pointer;padding:4px}
    `;
    panel = document.createElement("div");
    panel.className = "aw-panel";
    shadow.append(style, panel);
    (document.body || document.documentElement).appendChild(host);
  }

  function selectionRect() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    return rect.width || rect.height ? rect : null;
  }

  function place(rect) {
    const width = Math.min(340, window.innerWidth - 24);
    let left = window.scrollX + (rect ? rect.left : window.innerWidth / 2 - width / 2);
    left = Math.max(window.scrollX + 12, Math.min(left, window.scrollX + window.innerWidth - width - 12));
    panel.style.left = left + "px";
    // Prefer below the word; flip above when it would run off the viewport.
    const height = panel.offsetHeight;
    const fitsBelow = !rect || rect.bottom + 8 + height <= window.innerHeight;
    const top = !rect ? 80 : fitsBelow || rect.top - 8 - height < 0 ? rect.bottom + 8 : rect.top - 8 - height;
    panel.style.top = window.scrollY + top + "px";
  }

  function show(result, rect) {
    ensureHost();
    panel.replaceChildren();
    const close = document.createElement("button");
    close.className = "aw-close";
    close.textContent = "×";
    close.title = t("close");
    close.addEventListener("click", hide);
    panel.append(close, renderResult(result, t));
    place(rect);
  }

  function hide() {
    if (host) host.remove();
    host = null;
  }

  async function lookupAndShow(text, rect) {
    const id = ++requestId;
    show({ loading: true }, rect);
    const slow = setTimeout(() => id === requestId && show({ loading: true, slow: true }, rect), 3000);
    let result;
    try {
      result = await chrome.runtime.sendMessage({ type: "anlamca:lookup", text });
    } catch (e) {
      result = { query: text, entries: [], offline: true };
    }
    clearTimeout(slow);
    if (id === requestId) show(result, rect);
  }

  function selectedWord() {
    const text = String(window.getSelection() || "").trim();
    // A dictionary lookup is one word or a short phrase, not a paragraph.
    if (!text || text.length > 40 || text.split(/\s+/).length > 3) return "";
    return /\p{L}/u.test(text) ? text : "";
  }

  document.addEventListener("dblclick", event => {
    if (!window.__anlamcaDblclick) return;
    if (event.target && event.target.closest && event.target.closest("input, textarea, [contenteditable='true']")) return;
    const word = selectedWord();
    if (word) lookupAndShow(word, selectionRect());
  }, true);

  document.addEventListener("mousedown", event => {
    if (host && !event.composedPath().includes(host)) hide();
  }, true);
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") hide();
  }, true);
  window.addEventListener("resize", hide);

  chrome.runtime.onMessage.addListener(msg => {
    if (!msg) return;
    if (msg.type === "anlamca:show" && msg.text) lookupAndShow(msg.text, selectionRect());
    if (msg.type === "anlamca:showSelection") {
      const word = selectedWord();
      if (word) lookupAndShow(word, selectionRect());
    }
  });
})();
