document.addEventListener('DOMContentLoaded', () => {
  const configText = document.getElementById('config');
  const saveButton = document.getElementById('saveButton');
  const statusEl = document.getElementById('status');

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
  loadConfig();
});