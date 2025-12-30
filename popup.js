document.addEventListener('DOMContentLoaded', () => {
  // Theme Logic (Non-blocking)
  (async () => {
    try {
      const { themePreference } = await browser.storage.local.get("themePreference");
      if (themePreference) {
        document.documentElement.setAttribute('data-theme', themePreference);
      }
    } catch (e) {
      console.error("Theme load error", e);
    }
  })();

  const toggleBtn = document.getElementById('themeToggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', async () => {
      const current = document.documentElement.getAttribute('data-theme');
      const isSystemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      let newTheme = 'dark';

      if (current === 'dark') newTheme = 'light';
      else if (current === 'light') newTheme = 'dark';
      else {
        newTheme = isSystemDark ? 'light' : 'dark';
      }

      document.documentElement.setAttribute('data-theme', newTheme);
      await browser.storage.local.set({ themePreference: newTheme });
    });
  }

  const organizeAllBtn = document.getElementById('organizeAll');
  const classifyAllBtn = document.getElementById('classifyAll');
  const clearTagsBtn = document.getElementById('clearTags');
  const openSettingsBtn = document.getElementById('openSettings');

  const statusEl = document.getElementById('status');
  const progressContainer = document.getElementById('progress-container');
  const progressBar = document.getElementById('progress-bar');
  const progressText = document.getElementById('progress-text');
  const progressDetail = document.getElementById('progress-detail');

  // --- UI Helper Functions ---

  function updateProgress(current, total, detail = "") {
    if (total >= 0) { // Allow 0/0 to show "Starting..."
      progressContainer.style.display = 'block';

      const percentage = total > 0 ? Math.round((current / total) * 100) : 0;
      progressBar.style.width = `${percentage}%`;
      progressText.textContent = `${current} / ${total} processed (${percentage}%)`;
      progressDetail.textContent = detail ? `${detail}` : "Processing...";
    } else {
      progressContainer.style.display = 'none';
    }
  }

  function setButtonsDisabled(disabled) {
    organizeAllBtn.disabled = disabled;
    classifyAllBtn.disabled = disabled;
    clearTagsBtn.disabled = disabled;
    // Settings can remain enabled usually, but sticking to consistency
  }

  function updateStatus(message, type = 'default') {
    statusEl.textContent = message;
    statusEl.className = ''; // reset
    if (type === 'working') statusEl.classList.add('status-working');
    else if (type === 'success') statusEl.classList.add('status-success');
    else if (type === 'error') statusEl.classList.add('status-error');
    // default uses inherited color var(--status)
  }

  // --- Main State Handler ---

  function updateUI(state) {
    if (state.isScanning) {
      setButtonsDisabled(true);
      updateStatus("Task in progress...", "working");
      updateProgress(state.progress.current, state.progress.total, state.progress.detail);
    } else {
      setButtonsDisabled(false);
      progressContainer.style.display = 'none';

      if (state.lastResult) {
        if (state.lastResult.success) {
          updateStatus("Task Complete!", "success");
        } else if (state.lastResult.error) {
          updateStatus(`Error: ${state.lastResult.error}`, "error");
        }
      } else {
        updateStatus("Ready");
      }
    }
  }

  // --- Message Listeners ---

  browser.runtime.onMessage.addListener((message) => {
    if (message.action === "scan-status-update" || message.action === "scan-progress-update") {
      // If it's a progress update, specifically update the bar
      if (message.progress) {
        updateProgress(message.progress.current, message.progress.total, message.progress.detail);
      }

      // Use the isScanning flag to toggle buttons
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

  // --- Initialization ---

  // Initialization: Check status with retry to handle background script wake-up
  async function checkStatus(retries = 3, delayMs = 200) {
    for (let i = 0; i < retries; i++) {
      try {
        const response = await browser.runtime.sendMessage({ action: "get-scan-status" });
        if (response) {
          updateUI(response);
          return;
        }
      } catch (e) {
        console.warn(`Status check attempt ${i + 1} failed:`, e);
        if (i < retries - 1) {
          await new Promise(r => setTimeout(r, delayMs));
        }
      }
    }
    // If all retries failed
    console.error("Failed to get status from background.");
    // Force UI to ready state so user can at least try to interact
    updateStatus("Ready (Connection Retry Failed)", "error");
    setButtonsDisabled(false);
  }

  // Start status check immediately
  checkStatus();

  // --- Button Handlers ---

  async function triggerAction(actionName) {
    setButtonsDisabled(true);
    updateStatus("Starting...", "working");
    updateProgress(0, 0, "Initializing...");

    try {
      const response = await browser.runtime.sendMessage({ action: actionName });
      if (response && response.error) {
        updateStatus(response.error, "error");
        setButtonsDisabled(false);
      }
      // If success, the background script will emit status updates which our listener handles
    } catch (e) {
      console.error("Error triggering action:", e);
      updateStatus("Failed to start.", "error");
      setButtonsDisabled(false);
    }
  }

  organizeAllBtn.addEventListener('click', () => triggerAction('organize-all'));
  classifyAllBtn.addEventListener('click', () => triggerAction('classify-all'));
  clearTagsBtn.addEventListener('click', () => {
    if (confirm("Are you sure you want to remove ALL auto-sorter tags? This cannot be undone.")) {
      triggerAction('clear-tags');
    }
  });

  openSettingsBtn.addEventListener('click', () => {
    browser.runtime.openOptionsPage();
  });

});
