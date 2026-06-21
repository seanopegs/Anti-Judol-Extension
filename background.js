const DEFAULT_CONFIG = {
  enabled: true,
  threshold: 0.60
};

try {
  importScripts("anti_judol_model.js");
} catch (error) {
  console.warn("[Anti Judol] Model gagal dimuat. Menggunakan aturan lokal.", error);
}

const AJ_MODEL = self.ANTI_JUDOL_MODEL || null;

const KEYWORD_WEIGHTS = [
  { re: /judi\s*online|judol|jud[i1]\s*[o0]nl[i1]ne/i, w: 0.8 },
  { re: /\bmaxwin\b|\bmax\s*win\b/i, w: 0.65 },
  { re: /slot\s*online|situs\s*slot|s[l1][o0]t\s*gac[o0]r/i, w: 0.55 },
  { re: /\bslot\b|\bsl[o0]t\b/i, w: 0.45 },
  { re: /gacor|\brtp\b|maxwin|scatter|jackpot|jp\s*besar/i, w: 0.45 },
  { re: /\bcasino\b|\btogel\b|\bpoker\b|\broulette\b|\bblackjack\b|\bbaccarat\b|\bbandar\b/i, w: 0.4 },
  { re: /turnamen\s*(poker|slot|casino|judi|togel)/i, w: 0.6 },
  { re: /deposit|\bdepo\b|withdraw|\bwd\b|\btarik\s*dana\b/i, w: 0.3 },
  { re: /bonus\s*(new\s*member|100|200|150|member\s*baru)|free\s*spin/i, w: 0.35 },
  { re: /daftar\s*(sekarang|disini|di\s*sini|gratis)|link\s*(daftar|alternatif|resmi)/i, w: 0.3 },
  { re: /gabung\s*(sekarang|di\s*sini|disini)|join\s*(now|sekarang)/i, w: 0.25 },
  { re: /\b(rp|\$|usd|idr)\s*[\d.,]+\s*(ribu|juta|rb|jt|k\b|m\b)?/i, w: 0.15 },
  { re: /kemenangan|menang\s*besar|cuan|profit|hadiah\s*(utama|besar)/i, w: 0.25 },
  { re: /\bsitus\s*(resmi|terpercaya|terbaik)\b/i, w: 0.3 },
  { re: /\bagen\s*(resmi|terpercaya|slot|judi|poker|togel)\b/i, w: 0.35 },
  { re: /\b(pragmatic|pg\s*soft|habanero|microgaming|spadegaming)\b/i, w: 0.35 },
  { re: /\b(live\s*casino|live\s*draw|result\s*togel)\b/i, w: 0.4 },
  { re: /\b(bandar\s*togel|bandar\s*bola|taruhan|betting)\b/i, w: 0.45 }
];

const GAMBLING_TOPIC_PATTERNS = [
  /\bjudol\b|\bjudi\s*online\b|\bjudi\b/i,
  /\bslot\b|\bcasino\b|\btogel\b|\bpoker\b|\broulette\b|\bblackjack\b|\bbaccarat\b/i,
  /\btaruhan\b|\bbetting\b|\bbandar\b/i
];

const PROMO_CONTEXT_PATTERNS = [
  /\bdaftar\b|\bgabung\b|\bjoin\b|\bregister\b/i,
  /\bdeposit\b|\bdepo\b|\bwithdraw\b|\bwd\b/i,
  /\bbonus\b|\bpromo\b|\bfree\s*spin\b|\bjackpot\b|\bmaxwin\b/i,
  /\bmenang\s*besar\b|\bkemenangan\b|\bcuan\b|\bprofit\b|\bhadiah\s*(utama|besar)?\b/i,
  /\bgacor\b|\brtp\b|\bscatter\b/i,
  /\blink\s*(daftar|alternatif|resmi)\b/i,
  /\bsitus\s*(slot|judi|casino|togel|poker|resmi|terpercaya|terbaik)\b/i,
  /\bagen\s*(slot|judi|casino|togel|poker|resmi|terpercaya)\b/i,
  /\bmain\s*(sekarang|slot|casino|togel|poker)\b/i,
  /\bturnamen\s*(poker|slot|casino|judi|togel)\b/i,
  /\bpragmatic\b|\bpg\s*soft\b|\bhabanero\b|\bmicrogaming\b|\bspadegaming\b/i
];

const SAFE_CONTEXT_PATTERNS = [
  /\bancaman\b|\bbahaya\b|\bberbahaya\b|\bmerugikan\b/i,
  /\bilegal\b|\bdilarang\b|\blarangan\b|\bpidana\b|\bhukuman\b/i,
  /\bpenipuan\b|\btertipu\b|\btipu\b|\bkorban\b|\bterjerat\b|\bpinjol\b/i,
  /\bkecanduan\b|\bkebangkrutan\b|\bbangkrut\b/i,
  /\bstop\b|\bberhenti\b|\bwaspada\b|\bhati\s*hati\b|\bhindari\b|\bjangan\b/i,
  /\bkomitmen\b|\bsobat\b|\bpolri\b|\bpolda\b|\bpolsek\b/i,
  /\bmemberantas\b|\bberantas\b|\bpencegahan\b|\bmencegah\b|\bmemerangi\b/i,
  /\bdigerebek\b|\bpenggerebekan\b|\bditangkap\b|\bpenangkapan\b|\brazia\b|\bblokir\b|\bdiblokir\b/i,
  /\btersangka\b|\bpelaku\b|\bsindikat\b|\baparat\b|\bbareskrim\b|\bpolda\b/i,
  /\bedukasi\b|\bsosialisasi\b|\bpenjelasan\b|\bartikel\b|\bberita\b|\bringkasan\b/i,
  /\bperputaran\s*uang\b|\btransaksi\b|\bcapai\b|\bmencapai\b|\bterlibat\b|\bkantong\s*jebol\b/i,
  /\bpenelitian\b|\briset\b|\bstudi\b|\blaporan\b/i,
  /\bkementerian\b|\bkominfo\b|\bpolisi\b|\bpemerintah\b|\bojk\b/i
];

const GAMBLING_TOPIC_SOURCE = "judol|judi|judi online|slot|casino|togel|poker|taruhan|betting";
const SAFE_WARNING_SOURCE = [
  "ancaman", "bahaya", "berbahaya", "merugikan", "ilegal", "dilarang",
  "larangan", "pidana", "hukuman", "penipuan", "tertipu", "tipu",
  "kecanduan", "bangkrut", "kebangkrutan", "pinjol", "waspada",
  "hati\\s*hati", "hindari", "jangan", "stop", "berhenti",
  "komitmen", "pencegahan", "mencegah", "polri", "polda", "polsek"
].join("|");
const SAFE_NEWS_SOURCE = [
  "berita", "artikel", "laporan", "liputan", "headline", "ringkasan",
  "digerebek", "penggerebekan", "ditangkap", "penangkapan", "razia",
  "blokir", "diblokir", "berantas", "memberantas", "kasus", "tersangka",
  "pelaku", "sindikat", "aparat", "polisi", "kominfo", "kementerian",
  "pemerintah", "ojk", "perputaran\\s*uang", "transaksi", "capai",
  "mencapai", "terlibat", "kantong\\s*jebol"
].join("|");
const SAFE_WARNING_BRIDGE_RE = new RegExp(
  `\\b(${GAMBLING_TOPIC_SOURCE})\\b.{0,80}\\b(${SAFE_WARNING_SOURCE})\\b|\\b(${SAFE_WARNING_SOURCE})\\b.{0,80}\\b(${GAMBLING_TOPIC_SOURCE})\\b`,
  "i"
);
const SAFE_NEWS_BRIDGE_RE = new RegExp(
  `\\b(${GAMBLING_TOPIC_SOURCE})\\b.{0,60}\\b(${SAFE_NEWS_SOURCE})\\b|\\b(${SAFE_NEWS_SOURCE})\\b.{0,60}\\b(${GAMBLING_TOPIC_SOURCE})\\b`,
  "i"
);
const SEARCH_BREADCRUMB_RE = /\bhttps?:\/\/\S+(\s+[>/?]\s+).*\b(article|artikel|berita|detail|news|edukasi|stop|cara)\b/i;

const cache = new Map();
const MAX_CACHE_SIZE = 8000;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function countMatches(text, patterns) {
  let hits = 0;
  for (const pattern of patterns) {
    if (pattern.test(text)) {
      hits += 1;
    }
  }
  return hits;
}

function deobfuscateLeetspeak(text) {
  const charMap = {
    "0": "o",
    "1": "i",
    "3": "e",
    "4": "a",
    "5": "s",
    "7": "t",
    "8": "b"
  };

  return String(text || "").replace(/[a-z0-9]+/g, (token) => {
    if (!/[a-z]/.test(token) || !/\d/.test(token)) {
      return token;
    }

    return token.replace(/[0134578]/g, (char) => charMap[char] || char);
  });
}

function normalize(text) {
  const cleaned = String(text || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/https?:\/\/\S+|www\.\S+/g, " ")
    .replace(/[^a-z0-9\s$.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return deobfuscateLeetspeak(cleaned);
}

function isSafeContext(rawText) {
  if (SEARCH_BREADCRUMB_RE.test(String(rawText || ""))) {
    return true;
  }

  const text = normalize(rawText);
  if (!text) {
    return false;
  }

  const topicHits = countMatches(text, GAMBLING_TOPIC_PATTERNS);
  if (topicHits === 0) {
    return false;
  }

  const safeHits = countMatches(text, SAFE_CONTEXT_PATTERNS);
  const hasDirectWarningBridge =
    SAFE_WARNING_BRIDGE_RE.test(text)
    || /(judol|judi|judi online|slot|casino|togel|poker|taruhan).{0,40}(ancaman|bahaya|ilegal|dilarang|penipuan|tertipu|kecanduan|kebangkrutan|pinjol|merugikan)/i.test(text)
    || /(ancaman|bahaya|ilegal|dilarang|penipuan|tertipu|kecanduan|kebangkrutan|pinjol|merugikan).{0,40}(judol|judi|judi online|slot|casino|togel|poker|taruhan)/i.test(text);
  const hasNewsBridge = SAFE_NEWS_BRIDGE_RE.test(text);

  const promoHits = countMatches(text, PROMO_CONTEXT_PATTERNS);
  if (promoHits > 0 && !hasDirectWarningBridge && !hasNewsBridge) {
    return false;
  }

  return hasDirectWarningBridge || hasNewsBridge || safeHits >= 2;
}

function localScore(rawText) {
  const text = normalize(rawText);
  if (!text) {
    return 0;
  }

  let score = 0;
  for (const rule of KEYWORD_WEIGHTS) {
    if (rule.re.test(text)) {
      score += rule.w;
    }
  }

  if (/\b(slot|gacor|rtp)\b/.test(text) && /\b(deposit|wd|withdraw|daftar)\b/.test(text)) {
    score += 0.2;
  }
  if (/\b(poker|casino|togel|slot)\b/.test(text) && /\b(daftar|gabung|join|register)\b/.test(text)) {
    score += 0.2;
  }
  if (/\b(poker|casino|togel|slot|judi)\b/.test(text) && /\b(turnamen|tournament)\b/.test(text)) {
    score += 0.15;
  }
  if (/\b(bonus|promo|hadiah)\b/.test(text) && /\b(daftar|gabung|deposit)\b/.test(text)) {
    score += 0.15;
  }
  if (/\d{2,}/.test(text) && /\b(poker|casino|slot|togel|judi|turnamen|taruhan)\b/.test(text)) {
    score += 0.1;
  }

  return clamp(score, 0, 0.999);
}

function tokenizeForModel(rawText) {
  const text = String(rawText || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/https?:\/\/\S+|www\.\S+/g, " ")
    .replace(/@[a-z0-9_]+/g, " ")
    .replace(/#/g, " ")
    .replace(/[^0-9a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return (deobfuscateLeetspeak(text).match(/[a-z0-9]+/g) || []);
}

function isTopicOnlyMention(rawText) {
  const text = normalize(rawText);
  if (!text) {
    return false;
  }

  const topicHits = countMatches(text, GAMBLING_TOPIC_PATTERNS);
  if (topicHits === 0) {
    return false;
  }

  if (countMatches(text, PROMO_CONTEXT_PATTERNS) > 0) {
    return false;
  }

  const hasCommercialSignal =
    /https?:\/\/|www\.|\.com\b|\.net\b|\.id\b/i.test(String(rawText || ""))
    || /\b(rp|idr|usd|\$)\s*[\d.,]+|\b\d+\s*(rb|ribu|jt|juta|k)\b/i.test(text)
    || /\b(terpercaya|resmi|terbaik|mudah\s*menang|anti\s*rungkad|pola\s*menang)\b/i.test(text);

  if (hasCommercialSignal) {
    return false;
  }

  const tokens = tokenizeForModel(rawText);
  const neutralWords = new Set([
    "apa", "itu", "arti", "artinya", "maksud", "tentang", "bahas", "bahasan",
    "kata", "istilah", "contoh", "isu", "kasus", "berita", "edukasi", "dampak",
    "efek", "bahaya", "larangan", "hukum", "kenapa", "mengapa"
  ]);
  const hasNeutralWord = tokens.some((token) => neutralWords.has(token));

  return tokens.length <= 4 || (tokens.length <= 9 && hasNeutralWord);
}

function vectorizeForModel(rawText) {
  if (!AJ_MODEL || !AJ_MODEL.vocab || !AJ_MODEL.metadata) {
    return null;
  }

  const vectorSize = Number(AJ_MODEL.metadata.vector_size) || 100;
  const scale = Number(AJ_MODEL.metadata.embedding_scale) || 10000;
  const vector = new Float32Array(vectorSize);
  const tokens = tokenizeForModel(rawText);
  let tokenHits = 0;

  for (const token of tokens) {
    const embedding = AJ_MODEL.vocab[token];
    if (!embedding) {
      continue;
    }

    tokenHits += 1;
    for (let i = 0; i < vectorSize; i += 1) {
      vector[i] += embedding[i] / scale;
    }
  }

  if (tokenHits > 0) {
    for (let i = 0; i < vectorSize; i += 1) {
      vector[i] /= tokenHits;
    }
  }

  return { vector, tokenHits, tokenCount: tokens.length };
}

function predictRandomForestScore(rawText) {
  if (!AJ_MODEL || !Array.isArray(AJ_MODEL.trees) || AJ_MODEL.trees.length === 0) {
    return null;
  }

  const transformed = vectorizeForModel(rawText);
  if (!transformed || transformed.tokenHits === 0) {
    return null;
  }

  let scoreSum = 0;
  for (const tree of AJ_MODEL.trees) {
    let node = 0;

    while (tree.feature[node] >= 0) {
      const featureIndex = tree.feature[node];
      node = transformed.vector[featureIndex] <= tree.threshold[node]
        ? tree.left[node]
        : tree.right[node];
    }

    scoreSum += tree.proba[node] || 0;
  }

  return {
    score: clamp(scoreSum / AJ_MODEL.trees.length, 0, 1),
    tokenHits: transformed.tokenHits,
    tokenCount: transformed.tokenCount
  };
}



async function classifySingleText(text, config) {
  const safeContext = isSafeContext(text);
  const topicOnlyMention = isTopicOnlyMention(text);
  const heuristicScore = localScore(text);
  
  let source = "rules";
  let modelScore = null;

  const modelResult = predictRandomForestScore(text);
  if (modelResult) {
    modelScore = modelResult.score;
    source = "model";
  }

  let score = modelScore !== null ? Math.max(modelScore, heuristicScore) : heuristicScore;

  if (safeContext) {
    return {
      label: 0,
      score: Math.min(score, 0.2),
      modelScore,
      heuristicScore,
      source: "safe_context"
    };
  }

  if (topicOnlyMention && (modelScore === null || modelScore < config.threshold)) {
    return {
      label: 0,
      score: Math.min(score, 0.25),
      modelScore,
      heuristicScore,
      source: "topic_only"
    };
  }

  return {
    label: score >= config.threshold ? 1 : 0,
    score,
    modelScore,
    heuristicScore,
    source
  };
}

function cacheSet(key, value) {
  cache.set(key, value);
  if (cache.size > MAX_CACHE_SIZE) {
    const firstKey = cache.keys().next().value;
    cache.delete(firstKey);
  }
}

async function getConfig() {
  const stored = await chrome.storage.sync.get(DEFAULT_CONFIG);
  return {
    enabled: typeof stored.enabled === "boolean" ? stored.enabled : DEFAULT_CONFIG.enabled,
    threshold: clamp(Number.isFinite(Number(stored.threshold)) ? Number(stored.threshold) : DEFAULT_CONFIG.threshold, 0.05, 0.95)
  };
}

async function setConfig(patch = {}) {
  const current = await getConfig();
  const merged = {
    enabled: typeof patch.enabled === "boolean" ? patch.enabled : current.enabled,
    threshold: clamp(Number.isFinite(Number(patch.threshold)) ? Number(patch.threshold) : current.threshold, 0.05, 0.95)
  };
  await chrome.storage.sync.set(merged);
  if (
    (typeof patch.enabled === "boolean" && patch.enabled !== current.enabled)
    || (Number.isFinite(Number(patch.threshold)) && merged.threshold !== current.threshold)
  ) {
    cache.clear();
  }
  return merged;
}

async function classifyTexts(texts) {
  const config = await getConfig();
  const normalizedTexts = texts.map((t) => String(t || ""));

  if (!config.enabled) {
    return {
      labels: normalizedTexts.map(() => false),
      details: normalizedTexts.map(() => ({ label: 0, score: 0, source: "disabled" }))
    };
  }

  const uniqueToPredict = [];
  const seen = new Set();

  for (const text of normalizedTexts) {
    if (!seen.has(text)) {
      seen.add(text);
      if (!cache.has(text)) {
        uniqueToPredict.push(text);
      }
    }
  }

  if (uniqueToPredict.length > 0) {
    const promises = uniqueToPredict.map(async (text) => {
      const result = await classifySingleText(text, config);
      cacheSet(text, result);
    });
    await Promise.all(promises);
  }

  const details = normalizedTexts.map((text) => cache.get(text) || { label: 0, score: 0, source: "unknown" });
  const labels = details.map((d) => d.label === 1);

  return { labels, details };
}

function getModelInfo() {
  if (!AJ_MODEL || !AJ_MODEL.metadata) {
    return {
      loaded: false,
      name: "Aturan lokal"
    };
  }

  return {
    loaded: true,
    ...AJ_MODEL.metadata
  };
}

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === "install" || details.reason === "update") {
    await setConfig({ threshold: DEFAULT_CONFIG.threshold });
  } else {
    await setConfig({});
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const type = message && message.type;

  if (type === "aj_get_config") {
    getConfig()
      .then((config) => sendResponse({ ok: true, config }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (type === "aj_set_config") {
    setConfig(message.patch || {})
      .then((config) => sendResponse({ ok: true, config }))
      .catch((error) => sendResponse({ ok: false, error: String(error) }));
    return true;
  }

  if (type === "aj_classify_batch") {
    classifyTexts(Array.isArray(message.texts) ? message.texts : [])
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: String(error), labels: [], details: [] }));
    return true;
  }

  if (type === "aj_get_model_info") {
    sendResponse({ ok: true, model: getModelInfo() });
    return false;
  }

  sendResponse({ ok: false, error: "Unknown message type" });
  return false;
});
