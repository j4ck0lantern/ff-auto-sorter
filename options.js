document.addEventListener('DOMContentLoaded', () => {
  const configText = document.getElementById('config');
  const saveButton = document.getElementById('saveButton');
  const statusEl = document.getElementById('status');

  // AI Config Elements
  const aiProviderSelect = document.getElementById('aiProvider');
  const geminiConfigDiv = document.getElementById('geminiConfig');
  const openaiConfigDiv = document.getElementById('openaiConfig');
  const geminiApiKeyInput = document.getElementById('geminiApiKey');
  const openaiBaseUrlInput = document.getElementById('openaiBaseUrl');
  const openaiApiKeyInput = document.getElementById('openaiApiKey');
  const openaiModelInput = document.getElementById('openaiModel');
  const saveAiConfigButton = document.getElementById('saveAiConfig');
  const aiConfigStatusEl = document.getElementById('aiConfigStatus');

  // Toggle config sections based on provider selection
  aiProviderSelect.addEventListener('change', () => {
    if (aiProviderSelect.value === 'gemini') {
      geminiConfigDiv.style.display = 'block';
      openaiConfigDiv.style.display = 'none';
    } else {
      geminiConfigDiv.style.display = 'none';
      openaiConfigDiv.style.display = 'block';
    }
  });

  // Load the current AI config from storage
  async function loadAIConfig() {
    try {
      const { aiConfig, geminiApiKey } = await browser.storage.local.get(['aiConfig', 'geminiApiKey']);

      if (aiConfig) {
        // Load existing AI config
        aiProviderSelect.value = aiConfig.provider || 'gemini';

        if (aiConfig.provider === 'openai') {
          openaiBaseUrlInput.value = aiConfig.baseUrl || '';
          openaiApiKeyInput.value = aiConfig.apiKey || '';
          openaiModelInput.value = aiConfig.model || '';
        } else {
          // Default to Gemini
          geminiApiKeyInput.value = aiConfig.apiKey || '';
        }
      } else if (geminiApiKey) {
        // Migration: Old user with only geminiApiKey
        console.log("Migrating legacy Gemini API key...");
        aiProviderSelect.value = 'gemini';
        geminiApiKeyInput.value = geminiApiKey;
      } else {
        // No config found, defaults
        aiProviderSelect.value = 'gemini';
      }

      // Trigger change event to set correct visibility
      aiProviderSelect.dispatchEvent(new Event('change'));

    } catch (e) {
      console.error("Error loading AI config:", e);
      aiConfigStatusEl.textContent = `Error loading AI config: ${e.message}`;
      aiConfigStatusEl.style.color = 'red';
    }
  }

  // Save the AI config to storage
  async function saveAIConfig() {
    const provider = aiProviderSelect.value;
    const newConfig = { provider };

    if (provider === 'gemini') {
      const key = geminiApiKeyInput.value.trim();
      if (!key) {
        showStatus(aiConfigStatusEl, "Gemini API key cannot be empty.", 'red');
        return;
      }
      newConfig.apiKey = key;

      // Also save to legacy key for safety/compatibility if needed,
      // but ideally we switch to using aiConfig everywhere.
      // For now, let's keep geminiApiKey in sync if provider is gemini.
      await browser.storage.local.set({ geminiApiKey: key });

    } else if (provider === 'openai') {
      const baseUrl = openaiBaseUrlInput.value.trim();
      const key = openaiApiKeyInput.value.trim();
      const model = openaiModelInput.value.trim();

      if (!baseUrl || !model) { // Key might be optional for some local setups
        showStatus(aiConfigStatusEl, "Base URL and Model are required.", 'red');
        return;
      }
      newConfig.baseUrl = baseUrl;
      newConfig.apiKey = key;
      newConfig.model = model;
    }

    try {
      await browser.storage.local.set({ aiConfig: newConfig });
      showStatus(aiConfigStatusEl, "AI Settings saved!", 'green');
    } catch (e) {
      console.error("Error saving AI config:", e);
      showStatus(aiConfigStatusEl, `Error saving AI config: ${e.message}`, 'red');
    }
  }

  function showStatus(element, message, color) {
    element.textContent = message;
    element.style.color = color;
    setTimeout(() => element.textContent = "", 3000);
  }

  // Load the current folder sorter config from storage
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

  // Save the new folder sorter config to storage
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
      showStatus(statusEl, "Configuration saved!", 'green');
    } catch (e) {
      console.error("Error saving config:", e);
      showStatus(statusEl, `Error saving config: ${e.message}`, 'red');
    }
  }

  saveButton.addEventListener('click', saveConfig);
  saveAiConfigButton.addEventListener('click', saveAIConfig);

  loadConfig();
  loadAIConfig();
});
