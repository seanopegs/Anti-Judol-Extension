function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      resolve(response || { ok: false, error: "Empty response" });
    });
  });
}

const textInputEl = document.getElementById("textInput");
const checkButtonEl = document.getElementById("checkButton");
const clearButtonEl = document.getElementById("clearButton");
const resultEl = document.getElementById("result");
const thresholdEl = document.getElementById("threshold");
const thresholdLabelEl = document.getElementById("thresholdLabel");
const modelInfoEl = document.getElementById("modelInfo");
const statusTextEl = document.getElementById("statusText");

function setResult(kind, title, detail) {
  resultEl.className = `result ${kind}`;
  resultEl.innerHTML = `<strong></strong><span></span>`;
  resultEl.querySelector("strong").textContent = title;
  resultEl.querySelector("span").textContent = detail;
}

function renderThreshold(value) {
  thresholdLabelEl.textContent = Number(value).toFixed(2);
}

async function loadState() {
  const [configResponse, modelResponse] = await Promise.all([
    sendMessage({ type: "aj_get_config" }),
    sendMessage({ type: "aj_get_model_info" })
  ]);

  if (configResponse.ok && configResponse.config) {
    thresholdEl.value = Number(configResponse.config.threshold || 0.60).toFixed(2);
    renderThreshold(thresholdEl.value);
  }

  const model = modelResponse.ok ? modelResponse.model : null;
  if (model && model.loaded) {
    const parts = [
      `Model lokal: ${model.experiment_label}`,
      model.experiment_key ? `ID: ${model.experiment_key}` : null,
      Number.isFinite(Number(model.test_f1)) ? `Test F1: ${Number(model.test_f1).toFixed(4)}` : null
    ].filter(Boolean);
    modelInfoEl.title = parts.join("\n");
  } else {
    modelInfoEl.title = "Mode fallback lokal aktif";
  }
}

async function saveThreshold() {
  const threshold = Number(thresholdEl.value);
  renderThreshold(threshold);
  await sendMessage({ type: "aj_set_config", patch: { threshold } });
}

async function checkText() {
  const text = textInputEl.value.trim();
  if (!text) {
    setResult("error", "Teks kosong", "Paste teks yang mau dicek dulu.");
    statusTextEl.textContent = "Belum ada teks untuk dicek.";
    return;
  }

  checkButtonEl.disabled = true;
  statusTextEl.textContent = "Memeriksa teks...";
  setResult("idle", "Memeriksa...", "Tunggu sebentar.");

  const response = await sendMessage({ type: "aj_classify_batch", texts: [text] });
  checkButtonEl.disabled = false;

  if (!response.ok || !Array.isArray(response.details) || response.details.length === 0) {
    setResult("error", "Gagal cek", response.error || "Background extension tidak merespons.");
    statusTextEl.textContent = "Pemeriksaan gagal.";
    return;
  }

  const detail = response.details[0];
  const score = Number(detail.score);
  const percentText = Number.isFinite(score) ? `${Math.round(score * 100)}%` : "tidak tersedia";

  if (detail.label === 1 || response.labels[0] === true) {
    setResult("danger", "Terdeteksi judol", `Tingkat keyakinan: ${percentText}.`);
    statusTextEl.textContent = "Hasil siap.";
  } else {
    setResult("safe", "Tidak terdeteksi judol", `Tingkat keyakinan risiko: ${percentText}.`);
    statusTextEl.textContent = "Hasil siap.";
  }
}

thresholdEl.addEventListener("input", () => renderThreshold(thresholdEl.value));
thresholdEl.addEventListener("change", saveThreshold);
checkButtonEl.addEventListener("click", checkText);
clearButtonEl.addEventListener("click", () => {
  textInputEl.value = "";
  statusTextEl.textContent = "Tempel teks yang ingin dicek.";
  setResult("idle", "Belum dicek", "Hasil akan muncul di sini.");
  textInputEl.focus();
});
textInputEl.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    checkText();
  }
});

loadState();
