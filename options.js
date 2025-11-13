document.addEventListener('DOMContentLoaded', () => {
  const configText = document.getElementById('config');
  const saveButton = document.getElementById('saveButton');
  const statusEl = document.getElementById('status');
  const apiKeyInput = document.getElementById('apiKey');
  const saveApiKeyButton = document.getElementById('saveApiKey');
  const apiKeyStatusEl = document.getElementById('apiKeyStatus');

  // Load the current API key from storage
  async function loadApiKey() {
    try {
      const { geminiApiKey } = await browser.storage.local.get('geminiApiKey');
      if (geminiApiKey) {
        apiKeyInput.value = geminiApiKey;
      }
    } catch (e) {
      console.error("Error loading API key:", e);
      apiKeyStatusEl.textContent = `Error loading API key: ${e.message}`;
      apiKeyStatusEl.style.color = 'red';
    }
  }

  // Save the new API key to storage
  async function saveApiKey() {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
      apiKeyStatusEl.textContent = "API key cannot be empty.";
      apiKeyStatusEl.style.color = 'red';
      return;
    }

    try {
      await browser.storage.local.set({ geminiApiKey: apiKey });
      apiKeyStatusEl.textContent = "API key saved!";
      apiKeyStatusEl.style.color = 'green';
      setTimeout(() => apiKeyStatusEl.textContent = "", 3000);
    } catch (e) {
      console.error("Error saving API key:", e);
      apiKeyStatusEl.textContent = `Error saving API key: ${e.message}`;
      apiKeyStatusEl.style.color = 'red';
    }
  }

  // Load the current config from storage
  async function loadConfig() {
    try {
      const { sorterConfig } = await browser.storage.local.get('sorterConfig');
      if (sorterConfig) {
        configText.value = JSON.stringify(sorterConfig, null, 2); // Pretty-print
      } else {
        statusEl.textContent = "No config found. Using defaults.";
      }
    } catch (e) {
      console.error("Error loading config:", e);
      statusEl.textContent = `Error loading config: ${e.message}`;
      statusEl.style.color = 'red';
    }
  }

  // Save the new config to storage
  async function saveConfig() {
    let config;
    try {
      config = JSON.parse(configText.value);
    } catch (e) {
      statusEl.textContent = `Error: Invalid JSON. ${e.message}`;
      statusEl.style.color = 'red';
      return;
    }

    try {
      await browser.storage.local.set({ sorterConfig: config });
      statusEl.textContent = "Configuration saved!";
      statusEl.style.color = 'green';
      setTimeout(() => statusEl.textContent = "", 3000);
    } catch (e) {
      console.error("Error saving config:", e);
      statusEl.textContent = `Error saving config: ${e.message}`;
      statusEl.style.color = 'red';
    }
  }

  saveButton.addEventListener('click', saveConfig);
  saveApiKeyButton.addEventListener('click', saveApiKey);
  loadConfig();
  loadApiKey();
});
