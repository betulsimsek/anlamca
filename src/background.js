// Anlamca service worker: TDK lookups (with a small local cache), the
// context menu, the keyboard shortcut and the optional double-click mode.
importScripts("stem.js", "tdk.js");

const CACHE_KEY = "cache";
const CACHE_MAX = 500;
const RECENT_MAX = 20;
const DBLCLICK_SCRIPT_ID = "anlamca-dblclick";
const BUBBLE_FILES = ["src/render.js", "src/bubble.js"];
const ALL_SITES = { origins: ["<all_urls>"] };

async function cachedLookup(text) {
  const key = AnlamcaStem.normalize(text);
  if (!key) return { query: text, entries: [] };
  const { [CACHE_KEY]: cache = {} } = await chrome.storage.local.get(CACHE_KEY);
  if (cache[key]) {
    cache[key].at = Date.now();
    await chrome.storage.local.set({ [CACHE_KEY]: cache });
    return { ...cache[key].result, query: text };
  }
  const result = await AnlamcaTdk.lookup(text);
  // Only cache answers TDK actually gave; failures may be a hiccup.
  if (!result.offline) {
    cache[key] = { at: Date.now(), result };
    const keys = Object.keys(cache);
    if (keys.length > CACHE_MAX) {
      keys.sort((a, b) => cache[a].at - cache[b].at).slice(0, keys.length - CACHE_MAX).forEach(k => delete cache[k]);
    }
    await chrome.storage.local.set({ [CACHE_KEY]: cache });
  }
  if (result.entries.length) await rememberRecent(result.word);
  return result;
}

async function rememberRecent(word) {
  const { recent = [] } = await chrome.storage.local.get("recent");
  const next = [word].concat(recent.filter(w => w !== word)).slice(0, RECENT_MAX);
  await chrome.storage.local.set({ recent: next });
}

async function injectBubble(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: BUBBLE_FILES });
}

async function syncDoubleClick() {
  const { dblclick = false } = await chrome.storage.local.get("dblclick");
  const granted = await chrome.permissions.contains(ALL_SITES);
  const registered = await chrome.scripting.getRegisteredContentScripts({ ids: [DBLCLICK_SCRIPT_ID] });
  if (dblclick && granted && registered.length === 0) {
    await chrome.scripting.registerContentScripts([{
      id: DBLCLICK_SCRIPT_ID,
      matches: ["http://*/*", "https://*/*"],
      js: ["src/dblclick-on.js"].concat(BUBBLE_FILES),
      runAt: "document_idle",
      allFrames: false
    }]);
  } else if ((!dblclick || !granted) && registered.length) {
    await chrome.scripting.unregisterContentScripts({ ids: [DBLCLICK_SCRIPT_ID] });
  }
}

function setupContextMenu() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: "lookup", title: chrome.i18n.getMessage("menuLookup"), contexts: ["selection"] });
  });
}

chrome.runtime.onInstalled.addListener(() => {
  setupContextMenu();
  syncDoubleClick();
});
chrome.runtime.onStartup.addListener(syncDoubleClick);
chrome.permissions.onAdded.addListener(syncDoubleClick);
chrome.permissions.onRemoved.addListener(async () => {
  await chrome.storage.local.set({ dblclick: false });
  syncDoubleClick();
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.dblclick) syncDoubleClick();
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "lookup" || !tab || !info.selectionText) return;
  try {
    await injectBubble(tab.id);
    await chrome.tabs.sendMessage(tab.id, { type: "anlamca:show", text: info.selectionText });
  } catch (e) {
    // Pages like the Chrome Web Store cannot be scripted; nothing to show there.
  }
});

chrome.commands.onCommand.addListener(async (command, tab) => {
  if (command !== "lookup-selection" || !tab) return;
  try {
    await injectBubble(tab.id);
    await chrome.tabs.sendMessage(tab.id, { type: "anlamca:showSelection" });
  } catch (e) {}
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "anlamca:lookup") {
    cachedLookup(msg.text).then(sendResponse, () => sendResponse({ query: msg.text, entries: [], offline: true }));
    return true;
  }
});
