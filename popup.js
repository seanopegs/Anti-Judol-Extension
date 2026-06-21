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

const enabledEl = document.getElementById("enabled");
const thresholdEl = document.getElementById("threshold");
const thresholdLabelEl = document.getElementById("thresholdLabel");
const statusEl = document.getElementById("status");
const websiteButtonEl = document.getElementById("websiteButton");
const modelInfoEl = document.getElementById("modelInfo");

function setStatus(message, isError = false) {
  statusEl.textContent = message;
  statusEl.style.color = isError ? "#b42318" : "#536173";
}

function renderThreshold(value) {
  thresholdLabelEl.textContent = Number(value).toFixed(2);
}

async function loadConfig() {
  const [response, modelResponse] = await Promise.all([
    sendMessage({ type: "aj_get_config" }),
    sendMessage({ type: "aj_get_model_info" })
  ]);

  if (!response.ok) {
    setStatus(`Gagal load config: ${response.error || "unknown"}`, true);
    return;
  }

  const cfg = response.config || {};
  enabledEl.checked = Boolean(cfg.enabled);
  thresholdEl.value = Number.isFinite(Number(cfg.threshold)) ? Number(cfg.threshold).toFixed(2) : "0.60";

  renderThreshold(thresholdEl.value);
  renderModelInfo(modelResponse);
  setStatus(Boolean(cfg.enabled) ? "Sensor aktif" : "Sensor nonaktif");
}

function renderModelInfo(response) {
  if (!modelInfoEl) {
    return;
  }

  const model = response && response.ok ? response.model : null;
  if (!model || !model.loaded) {
    modelInfoEl.title = "Mode fallback lokal aktif";
    return;
  }

  const parts = [
    `Model lokal: ${model.experiment_label}`,
    model.experiment_key ? `ID: ${model.experiment_key}` : null,
    Number.isFinite(Number(model.test_f1)) ? `Test F1: ${Number(model.test_f1).toFixed(4)}` : null
  ].filter(Boolean);
  modelInfoEl.title = parts.join("\n");
}

async function saveConfig() {
  const threshold = Number(thresholdEl.value);
  const patch = {
    enabled: enabledEl.checked,
    threshold
  };

  const response = await sendMessage({ type: "aj_set_config", patch });
  if (!response.ok) {
    setStatus(`Gagal simpan: ${response.error || "unknown"}`, true);
    return;
  }

  renderThreshold(response.config.threshold);
  setStatus(response.config.enabled ? "Sensor aktif" : "Sensor nonaktif");

  const modelResponse = await sendMessage({ type: "aj_get_model_info" });
  renderModelInfo(modelResponse);
}

enabledEl.addEventListener("change", saveConfig);
thresholdEl.addEventListener("input", () => renderThreshold(thresholdEl.value));
thresholdEl.addEventListener("change", saveConfig);

websiteButtonEl.addEventListener("click", () => {
  window.open(chrome.runtime.getURL("website.html"), "_blank");
});

loadConfig();
