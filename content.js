const MIN_TEXT_LEN = 8;
const MAX_TEXT_LEN = 600;
const MAX_CANDIDATES = 500;
const PROCESS_DELAY_MS = 100;
const PERIODIC_SCAN_MS = 1500;
const GOOGLE_DOCS_SCAN_MS = 1200;

const IS_GOOGLE_DOCS = /(^|\.)docs\.google\.com$/i.test(location.hostname)
  && /^\/document\//i.test(location.pathname);

const SKIP_TAGS = new Set([
  "SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA", "INPUT", "OPTION",
  "SELECT", "CODE", "PRE", "SVG", "CANVAS", "IFRAME", "VIDEO", "AUDIO", "IMG"
]);

const NON_TEXT_REDACTION_DESCENDANTS = [
  "img", "picture", "svg", "canvas", "iframe", "video", "audio",
  "input", "textarea", "select", "button", "form",
  "[role='button']", "[role='search']", "[role='textbox']",
  "[contenteditable='true']", "[contenteditable='plaintext-only']"
].join(",");

const processedElements = new WeakMap();
const pendingRoots = new Set();

let running = false;
let scheduled = false;
let docsFingerprint = "";

function normalizeText(t) {
  return String(t || "").replace(/\s+/g, " ").trim();
}

function sendMessageToBackground(msg) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(msg, (response) => {
        if (chrome.runtime.lastError) {
          resolve({ ok: false, error: chrome.runtime.lastError.message });
        } else {
          resolve(response || { ok: false, error: "empty" });
        }
      });
    } catch (e) {
      resolve({ ok: false, error: String(e) });
    }
  });
}

function getNodeText(el) {
  if (!el) {
    return "";
  }

  const direct = normalizeText(el.innerText || el.textContent);
  if (direct) {
    return direct;
  }

  const aria = normalizeText(el.getAttribute && el.getAttribute("aria-label"));
  if (aria) {
    return aria;
  }

  const title = normalizeText(el.getAttribute && el.getAttribute("title"));
  return title;
}

function isSkip(el) {
  if (!el) {
    return true;
  }
  if (SKIP_TAGS.has(el.tagName)) {
    return true;
  }
  if (
    el.closest(".aj-redacted")
    || el.classList.contains("aj-redacted-el")
    || el.closest(".aj-redacted-el")
  ) {
    return true;
  }
  return false;
}

function shouldAvoidWholeElementRedaction(el) {
  if (!el) {
    return true;
  }

  if (SKIP_TAGS.has(el.tagName) || el.tagName === "FORM" || el.tagName === "BUTTON") {
    return true;
  }

  try {
    return Boolean(el.querySelector && el.querySelector(NON_TEXT_REDACTION_DESCENDANTS));
  } catch {
    return false;
  }
}

function wasProcessed(el, text) {
  return processedElements.get(el) === text;
}

function markProcessed(el, text) {
  processedElements.set(el, text);
}

function countWords(text) {
  const normalized = normalizeText(text);
  if (!normalized) {
    return 0;
  }
  return normalized.split(/\s+/).filter(Boolean).length;
}

function isGranularText(text) {
  const normalized = normalizeText(text);
  return normalized.length >= 24 || countWords(normalized) >= 4;
}

function pruneAncestorCandidates(candidates) {
  return candidates.filter((candidate, index) => {
    const target = candidate.target;
    if (!target || !target.contains) {
      return true;
    }

    for (let i = 0; i < candidates.length; i += 1) {
      if (i === index) {
        continue;
      }

      const other = candidates[i];
      if (!other || other.target === target) {
        continue;
      }

      if (!target.contains(other.target)) {
        continue;
      }

      if (!isGranularText(other.text)) {
        continue;
      }

      return false;
    }

    return true;
  });
}

function clearProcessedCache() {
  if (!document.body) {
    return;
  }
  document.querySelectorAll("*").forEach((el) => processedElements.delete(el));
}

function redactElement(el, meta) {
  if (!el || el.classList.contains("aj-redacted-el")) {
    return;
  }
  if (shouldAvoidWholeElementRedaction(el)) {
    return;
  }
  el.classList.add("aj-redacted-el");
  const s = Number.isFinite(Number(meta.score)) ? Number(meta.score).toFixed(3) : "?";
  el.title = `Disensor Anti Judol (score: ${s}). Hover untuk melihat.`;
  el.setAttribute("data-aj", "1");
}

function unredactElement(el) {
  if (!el || !el.classList.contains("aj-redacted-el")) {
    return;
  }
  el.classList.remove("aj-redacted-el");
  el.removeAttribute("title");
  el.removeAttribute("data-aj");
}

function setGoogleDocsRedaction(enabled, meta = {}) {
  if (!IS_GOOGLE_DOCS || !document.body) {
    return;
  }

  if (!enabled) {
    document.body.classList.remove("aj-docs-redacted");
    document.body.removeAttribute("data-aj-docs");
    document.body.removeAttribute("data-aj-docs-score");
    return;
  }

  const score = Number.isFinite(Number(meta.score)) ? Number(meta.score).toFixed(3) : "?";
  document.body.classList.add("aj-docs-redacted");
  document.body.setAttribute("data-aj-docs", "1");
  document.body.setAttribute("data-aj-docs-score", score);
}

function collectGoogleDocsSignals() {
  if (!IS_GOOGLE_DOCS) {
    return [];
  }

  const texts = [];
  const pushText = (value) => {
    const t = normalizeText(value);
    if (!t || t.length < MIN_TEXT_LEN) {
      return;
    }
    texts.push(t.slice(0, 2500));
  };

  pushText(document.querySelector("meta[property='og:description']")?.getAttribute("content"));
  pushText(document.querySelector("meta[name='description']")?.getAttribute("content"));
  pushText(document.title);

  const titleInput = document.getElementById("docs-title-input");
  if (titleInput) {
    pushText(titleInput.value || titleInput.getAttribute("value"));
  }

  const lineEl = document.querySelector("[class*='kix-lineview']");
  if (lineEl) {
    pushText(getNodeText(lineEl));
  }

  const textbox = document.querySelector("[role='textbox'][aria-label]");
  if (textbox) {
    pushText(textbox.getAttribute("aria-label"));
  }

  return Array.from(new Set(texts));
}

async function processGoogleDocsSignals(force = false) {
  if (!IS_GOOGLE_DOCS) {
    return;
  }

  const texts = collectGoogleDocsSignals();
  const fingerprint = texts.join("\u241E");
  if (!force && fingerprint === docsFingerprint) {
    return;
  }
  docsFingerprint = fingerprint;

  if (texts.length === 0) {
    setGoogleDocsRedaction(false);
    return;
  }

  let response;
  try {
    response = await sendMessageToBackground({ type: "aj_classify_batch", texts });
  } catch {
    return;
  }

  if (!response || !response.ok || !Array.isArray(response.labels)) {
    return;
  }

  const labels = response.labels;
  const details = Array.isArray(response.details) ? response.details : [];
  const hitIndex = labels.findIndex((v) => v === true);

  if (hitIndex >= 0) {
    setGoogleDocsRedaction(true, details[hitIndex] || { score: null });
  } else {
    setGoogleDocsRedaction(false);
  }
}

function collectCandidates(root) {
  const base = root && root.nodeType === 1 ? root : document.body;
  if (!base) {
    return [];
  }

  const candidates = [];
  const seen = new WeakSet();

  const BLOCK_SEL = [
    "p", "li", "td", "th", "h1", "h2", "h3", "h4", "h5", "h6",
    "blockquote", "figcaption", "dt", "dd", "caption", "summary", "article",
    "yt-formatted-string",
    "[role='listitem']", "[role='paragraph']", "[role='heading']",
    "[role='comment']", "[role='article']",
    "[data-content-text]", ".comment-text", ".reply-text"
  ].join(",");

  const GDOCS_SEL = [
    "[class*='kix-lineview']",
    "[class*='kix-lineview-content']",
    "[class*='kix-paragraphrenderer']",
    "[class*='kix-wordhtmlgenerator-word-node']",
    ".docs-text-layer span",
    ".docs-contenteditable-disabled span",
    "[role='textbox'][aria-label]"
  ].join(",");

  const selectors = [BLOCK_SEL, GDOCS_SEL];

  for (const sel of selectors) {
    if (candidates.length >= MAX_CANDIDATES) {
      break;
    }

    let els;
    try {
      els = base.querySelectorAll(sel);
    } catch {
      continue;
    }

    for (const el of els) {
      if (candidates.length >= MAX_CANDIDATES) {
        break;
      }
      if (seen.has(el) || isSkip(el)) {
        continue;
      }

      const t = getNodeText(el);
      if (t.length < MIN_TEXT_LEN || t.length > MAX_TEXT_LEN) {
        continue;
      }
      if (wasProcessed(el, t)) {
        continue;
      }

      seen.add(el);
      candidates.push({ target: el, text: t });
    }
  }

  const walker = document.createTreeWalker(base, NodeFilter.SHOW_TEXT);
  const blockParentMap = new Map();

  while (walker.nextNode()) {
    if (candidates.length + blockParentMap.size >= MAX_CANDIDATES) {
      break;
    }

    const tn = walker.currentNode;
    if (!tn.parentElement || SKIP_TAGS.has(tn.parentElement.tagName)) {
      continue;
    }

    const raw = normalizeText(tn.nodeValue);
    if (!raw || raw.length < 3) {
      continue;
    }

    let blk = tn.parentElement;
    while (blk && blk !== document.body) {
      const d = getComputedStyle(blk).display;
      if (d === "block" || d === "list-item" || d === "flex" || d === "grid" || d === "table-cell") {
        break;
      }
      if (
        typeof blk.className === "string"
        && (blk.className.includes("kix-lineview") || blk.className.includes("kix-paragraphrenderer"))
      ) {
        break;
      }
      blk = blk.parentElement;
    }

    if (!blk || blk === document.body) {
      blk = tn.parentElement;
    }

    if (seen.has(blk) || isSkip(blk)) {
      continue;
    }
    if (blockParentMap.has(blk)) {
      continue;
    }

    blockParentMap.set(blk, true);
  }

  for (const [blk] of blockParentMap) {
    if (candidates.length >= MAX_CANDIDATES) {
      break;
    }
    if (seen.has(blk)) {
      continue;
    }

    const t = getNodeText(blk);
    if (t.length < MIN_TEXT_LEN || t.length > MAX_TEXT_LEN) {
      continue;
    }
    if (wasProcessed(blk, t)) {
      continue;
    }

    seen.add(blk);
    candidates.push({ target: blk, text: t });
  }

  try {
    const spans = base.querySelectorAll("span, a, strong, em, b, i, mark, label");
    for (const sp of spans) {
      if (candidates.length >= MAX_CANDIDATES) {
        break;
      }
      if (seen.has(sp) || isSkip(sp)) {
        continue;
      }

      const t = getNodeText(sp);
      if (t.length < MIN_TEXT_LEN || t.length > MAX_TEXT_LEN) {
        continue;
      }
      if (wasProcessed(sp, t)) {
        continue;
      }

      let dup = false;
      let p = sp.parentElement;
      for (let depth = 0; p && depth < 8; depth += 1, p = p.parentElement) {
        if (seen.has(p)) {
          dup = true;
          break;
        }
      }
      if (dup) {
        continue;
      }

      seen.add(sp);
      candidates.push({ target: sp, text: t });
    }
  } catch {}

  try {
    const editables = base.querySelectorAll("[contenteditable='true'], [contenteditable='plaintext-only']");
    for (const ed of editables) {
      if (candidates.length >= MAX_CANDIDATES) {
        break;
      }
      if (seen.has(ed) || isSkip(ed)) {
        continue;
      }

      const children = ed.querySelectorAll("div, p, span, [aria-label]");
      for (const ch of children) {
        if (candidates.length >= MAX_CANDIDATES) {
          break;
        }
        if (seen.has(ch) || isSkip(ch)) {
          continue;
        }

        const t = getNodeText(ch);
        if (t.length < MIN_TEXT_LEN || t.length > MAX_TEXT_LEN) {
          continue;
        }
        if (wasProcessed(ch, t)) {
          continue;
        }

        seen.add(ch);
        candidates.push({ target: ch, text: t });
      }
    }
  } catch {}

  return pruneAncestorCandidates(candidates);
}

async function processRoot(root) {
  const candidates = collectCandidates(root);
  if (candidates.length === 0) {
    return;
  }

  const texts = candidates.map((c) => c.text);

  let response;
  try {
    response = await sendMessageToBackground({ type: "aj_classify_batch", texts });
  } catch {
    return;
  }

  const labels = response && response.ok && Array.isArray(response.labels) ? response.labels : [];
  const details = response && Array.isArray(response.details) ? response.details : [];

  for (let i = 0; i < candidates.length; i += 1) {
    const c = candidates[i];
    markProcessed(c.target, c.text);

    if (labels[i] === true) {
      const meta = details[i] || { score: null };
      redactElement(c.target, meta);
    } else {
      unredactElement(c.target);
    }
  }
}

chrome.storage.onChanged.addListener((changes) => {
  if (changes.enabled && changes.enabled.newValue === false) {
    document.querySelectorAll(".aj-redacted-el").forEach((el) => unredactElement(el));
    setGoogleDocsRedaction(false);
    clearProcessedCache();
  } else if (changes.enabled && changes.enabled.newValue === true) {
    clearProcessedCache();
    docsFingerprint = "";
    enqueue(document.body);
    processGoogleDocsSignals(true).catch(() => {});
  }
});

async function flushQueue() {
  if (running) {
    return;
  }

  running = true;
  try {
    while (pendingRoots.size > 0) {
      const root = pendingRoots.values().next().value;
      pendingRoots.delete(root);
      await processRoot(root);
    }

    if (IS_GOOGLE_DOCS) {
      await processGoogleDocsSignals(false);
    }
  } finally {
    running = false;
  }
}

function scheduleProcess() {
  if (scheduled) {
    return;
  }

  scheduled = true;
  setTimeout(() => {
    scheduled = false;
    flushQueue();
  }, PROCESS_DELAY_MS);
}

function enqueue(root) {
  if (!root || !root.nodeType) {
    return;
  }

  pendingRoots.add(root);
  scheduleProcess();
}

const observer = new MutationObserver((mutations) => {
  for (const m of mutations) {
    if (m.type === "characterData") {
      const p = m.target && m.target.parentNode;

      let el = m.target.parentElement;
      for (let d = 0; el && d < 6; d += 1, el = el.parentElement) {
        processedElements.delete(el);
        if (el.classList) {
          el.classList.remove("aj-redacted-el");
        }
        if (el.hasAttribute && el.hasAttribute("data-aj")) {
          el.removeAttribute("data-aj");
        }
      }

      enqueue(p || document.body);
      continue;
    }

    for (const n of m.addedNodes) {
      if (n.nodeType === 1) {
        processedElements.delete(n);
      }
      enqueue(n);
    }
  }
});

function start() {
  if (!document.body) {
    return;
  }

  observer.observe(document.body, { childList: true, characterData: true, subtree: true });
  enqueue(document.body);

  setInterval(() => {
    enqueue(document.body);
  }, PERIODIC_SCAN_MS);

  if (IS_GOOGLE_DOCS) {
    setInterval(() => {
      processGoogleDocsSignals(true).catch(() => {});
    }, GOOGLE_DOCS_SCAN_MS);
  }
}

if (document.body) {
  start();
} else {
  document.addEventListener("DOMContentLoaded", start, { once: true });
}
