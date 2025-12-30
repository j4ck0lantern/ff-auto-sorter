// Top-level error trap
window.addEventListener('error', (event) => {
  const statusEl = document.getElementById('status');
  if (statusEl) {
    statusEl.textContent = "Error: " + event.message;
    statusEl.className = 'status-error';
  }
});

document.addEventListener('DOMContentLoaded', () => {
  console.log("Popup DOMContentLoaded");

  // 1. Grab Elements Immediately
  const toggleBtn = document.getElementById('themeToggle');
  const organizeAllBtn = document.getElementById('organizeAll');
  const classifyAllBtn = document.getElementById('classifyAll');
  const clearTagsBtn = document.getElementById('clearTags');
  const openSettingsBtn = document.getElementById('openSettings');

  const statusEl = document.getElementById('status');
  if (!statusEl) return; // Should not happen

  const progressContainer = document.getElementById('progress-container');
  const progressBar = document.getElementById('progress-bar');
  const progressText = document.getElementById('progress-text');
  const progressDetail = document.getElementById('progress-detail');

  // 2. Setup UI Helpers
  function updateProgress(current, total, detail = "") {
    if (total >= 0) {
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
    if (organizeAllBtn) organizeAllBtn.disabled = disabled;
    if (classifyAllBtn) classifyAllBtn.disabled = disabled;
    if (clearTagsBtn) clearTagsBtn.disabled = disabled;
  }

  function updateStatus(message, type = 'default') {
    statusEl.textContent = message;
    statusEl.className = '';
    if (type === 'working') statusEl.classList.add('status-working');
    else if (type === 'success') statusEl.classList.add('status-success');
    else if (type === 'error') statusEl.classList.add('status-error');
  }

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

  // 3. Setup Listeners
  if (toggleBtn) {
    toggleBtn.addEventListener('click', async () => {
      try {
        const current = document.documentElement.getAttribute('data-theme');
        const isSystemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
        let newTheme = 'dark';
        if (current === 'dark') newTheme = 'light';
        else if (current === 'light') newTheme = 'dark';
        else newTheme = isSystemDark ? 'light' : 'dark';

        document.documentElement.setAttribute('data-theme', newTheme);
        await browser.storage.local.set({ themePreference: newTheme });
      } catch (e) { console.error("Theme toggle error", e); }
    });
  }

  if (organizeAllBtn) organizeAllBtn.addEventListener('click', () => triggerAction('organize-all'));
  if (classifyAllBtn) classifyAllBtn.addEventListener('click', () => triggerAction('classify-all'));
  if (clearTagsBtn) clearTagsBtn.addEventListener('click', () => {
    if (confirm("Are you sure you want to remove ALL auto-sorter tags? This cannot be undone.")) {
      triggerAction('clear-tags');
    }
  });
  if (openSettingsBtn) openSettingsBtn.addEventListener('click', () => {
    browser.runtime.openOptionsPage();
  });

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

  // 4. Async Initialization (Non-blocking)
  (async () => {
    try {
      // Load Theme
      const { themePreference } = await browser.storage.local.get("themePreference");
      if (themePreference) {
        document.documentElement.setAttribute('data-theme', themePreference);
      }

      // Check Status
      const response = await browser.runtime.sendMessage({ action: "get-scan-status" });
      if (response) updateUI(response);

    } catch (e) {
      console.error("Popup Async Init Error:", e);
      // Don't show error to user immediately if it's just a background wakeup issue,
      // but if the status check fails, UI stays 'Ready' which is fine.
    }
  })();

  // 5. Action Trigger Logic
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
    } catch (e) {
      console.error("Error triggering action:", e);
      updateStatus("Failed to start (Check Console)", "error");
      setButtonsDisabled(false);
    }
  }

});
