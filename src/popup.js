const t = (key, subs) => chrome.i18n.getMessage(key, subs);
const $ = id => document.getElementById(id);
const ALL_SITES = { origins: ["<all_urls>"] };

// The definition card's styles live with the renderer (shared with the bubble).
const cardStyle = document.createElement("style");
cardStyle.textContent = AnlamcaRender.CSS;
document.head.appendChild(cardStyle);

async function search(text) {
  const query = text.trim();
  if (!query) return;
  $("q").value = query;
  $("result").replaceChildren(AnlamcaRender.renderResult({ loading: true }, t));
  const slow = setTimeout(() => $("result").replaceChildren(AnlamcaRender.renderResult({ loading: true, slow: true }, t)), 3000);
  const result = await chrome.runtime.sendMessage({ type: "anlamca:lookup", text: query });
  clearTimeout(slow);
  $("result").replaceChildren(AnlamcaRender.renderResult(result, t, { full: true }));
  renderRecent();
}

async function renderRecent() {
  const { recent = [] } = await chrome.storage.local.get("recent");
  $("recent-wrap").classList.toggle("hidden", recent.length === 0);
  $("recent").replaceChildren(...recent.slice(0, 12).map(word => {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = word;
    b.addEventListener("click", () => search(word));
    return b;
  }));
}

$("search").addEventListener("submit", e => {
  e.preventDefault();
  search($("q").value);
});

$("dblclick").addEventListener("change", async e => {
  if (e.target.checked) {
    // Must run inside the click handler: Chrome only shows the permission
    // prompt in response to a user gesture.
    const granted = await chrome.permissions.request(ALL_SITES);
    e.target.checked = granted;
    await chrome.storage.local.set({ dblclick: granted });
  } else {
    await chrome.storage.local.set({ dblclick: false });
    await chrome.permissions.remove(ALL_SITES).catch(() => {});
  }
});

(async () => {
  const [{ dblclick = false }, granted, commands] = await Promise.all([
    chrome.storage.local.get("dblclick"),
    chrome.permissions.contains(ALL_SITES),
    chrome.commands.getAll()
  ]);
  $("dblclick").checked = dblclick && granted;
  const cmd = commands.find(c => c.name === "lookup-selection");
  $("shortcut-line").textContent = cmd && cmd.shortcut ? t("shortcutLine", [cmd.shortcut]) : t("menuLine");
  renderRecent();
  // Prefill with the page selection when the popup opens (activeTab).
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [{ result } = {}] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => String(window.getSelection() || "").trim().slice(0, 40)
    });
    if (result && result.split(/\s+/).length <= 3) search(result);
  } catch (e) {
    // No selection access on this page (chrome://, Web Store); that's fine.
  }
  $("q").focus();
})();
