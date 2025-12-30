console.log("Popup Script LOADED");

const initPopup = () => {
  const statusEl = document.getElementById('status');
  if (statusEl) statusEl.textContent = "JS Init...";

  try {
    // 1. Grab Elements
    const toggleBtn = document.getElementById('themeToggle');
    const organizeAllBtn = document.getElementById('organizeAll');
    const classifyAllBtn = document.getElementById('classifyAll');
    const clearTagsBtn = document.getElementById('clearTags');
    const openSettingsBtn = document.getElementById('openSettings');

    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');
    const progressDetail = document.getElementById('progress-detail');

    // 2. Definitions
    const updateProgress = (current, total, detail = "") => {
      if (!progressContainer) return;
      if (total >= 0) {
        progressContainer.style.display = 'block';
        const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
        progressBar.style.width = `${percentage}%`;
        progressText.textContent = `${current} / ${total}`;
        progressDetail.textContent = detail ? `${detail}` : "Processing...";
      } else {
        progressContainer.style.display = 'none';
      }
    };

    const setButtonsDisabled = (disabled) => {
      if (organizeAllBtn) organizeAllBtn.disabled = disabled;
      if (classifyAllBtn) classifyAllBtn.disabled = disabled;
      if (clearTagsBtn) clearTagsBtn.disabled = disabled;
    };

    const updateStatus = (message, type = 'default') => {
      if (!statusEl) return;

      statusEl.textContent = message;
      statusEl.className = '';
      if (type === 'working') statusEl.classList.add('status-working');
      else if (type === 'success') statusEl.classList.add('status-success');
      else if (type === 'error') statusEl.classList.add('status-error');
    };

    const updateUI = (state) => {
      if (state.isScanning) {
        setButtonsDisabled(true);
        updateStatus("Working...", "working");
        updateProgress(state.progress.current, state.progress.total, state.progress.detail);
      } else {
        setButtonsDisabled(false);
        if (progressContainer) progressContainer.style.display = 'none';
        if (state.lastResult) {
          if (state.lastResult.success) updateStatus("Task Complete!", "success");
          else if (state.lastResult.error) updateStatus(`Error: ${state.lastResult.error}`, "error");
        } else {
          updateStatus("Ready");
        }
      }
    };

    const triggerAction = async (actionName) => {
      setButtonsDisabled(true);
      updateStatus("Starting...", "working");
      try {
        const response = await browser.runtime.sendMessage({ action: actionName });
        if (response && response.error) {
          updateStatus(response.error, "error");
          setButtonsDisabled(false);
        }
      } catch (err) {
        console.error("Action Error:", err);
        updateStatus("Failed: " + err.message, "error");
        setButtonsDisabled(false);
      }
    };

    // 3. Listeners
    if (toggleBtn) toggleBtn.addEventListener('click', async () => {
      const { themePreference } = await browser.storage.local.get("themePreference");
      const newTheme = (themePreference === 'dark') ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', newTheme);
      await browser.storage.local.set({ themePreference: newTheme });
    });

    if (organizeAllBtn) organizeAllBtn.addEventListener('click', () => triggerAction('organize-all'));
    if (classifyAllBtn) classifyAllBtn.addEventListener('click', () => triggerAction('classify-all'));
    if (clearTagsBtn) clearTagsBtn.addEventListener('click', () => {
      if (confirm("Clear all tags?")) triggerAction('clear-tags');
    });
    if (openSettingsBtn) openSettingsBtn.addEventListener('click', () => browser.runtime.openOptionsPage());

    browser.runtime.onMessage.addListener((message) => {
      if (message.action === "scan-status-update" || message.action === "scan-progress-update") {
        if (message.progress) updateProgress(message.progress.current, message.progress.total, message.progress.detail);
        if (message.isScanning !== undefined) {
          if (message.isScanning) {
            setButtonsDisabled(true);
            updateStatus("Working...", "working");
          } else {
            setButtonsDisabled(false);
            updateStatus("Done.", "success");
            setTimeout(() => updateStatus("Ready"), 3000);
          }
        }
      }
    });

    // 4. Init with Timeout
    const init = async () => {
      try {
        // Theme
        const { themePreference } = await browser.storage.local.get("themePreference");
        if (themePreference) document.documentElement.setAttribute('data-theme', themePreference);

        // Status Check
        if (statusEl) statusEl.textContent = "Connecting...";

        const response = await Promise.race([
          browser.runtime.sendMessage({ action: "get-scan-status" }),
          new Promise(r => setTimeout(() => r({ timeout: true }), 1500))
        ]);

        if (response && response.timeout) {
          updateUI({ isScanning: false });
        } else if (response) {
          updateUI(response);
        } else {
          updateUI({ isScanning: false });
        }
      } catch (e) {
        console.error("Popup Init Error", e);
        updateStatus("Error: " + e.message, "error");
      }
    };

    init();

  } catch (e) {
    if (statusEl) statusEl.textContent = "Fatal: " + e.message;
  }
};

// Run immediately (Script is at bottom of body)
initPopup();
