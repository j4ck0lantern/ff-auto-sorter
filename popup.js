document.addEventListener('DOMContentLoaded', () => {
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

  function updateStatus(message, color = 'black') {
    statusEl.textContent = message;
    statusEl.style.color = color;
  }

  // --- Main State Handler ---

  function updateUI(state) {
    if (state.isScanning) {
      setButtonsDisabled(true);
      updateStatus("Task in progress...", "blue");
      updateProgress(state.progress.current, state.progress.total, state.progress.detail);
    } else {
      setButtonsDisabled(false);
      progressContainer.style.display = 'none';

      // If we just finished a scan (could rely on a stored flag or just let the user see 'Ready')
      // For now, if not scanning, we just show ready or the last status if persisted? 
      // Let's check if there was a recent completion message.
      if (state.lastResult) {
        if (state.lastResult.success) {
          updateStatus("Task Complete!", "green");
        } else if (state.lastResult.error) {
          updateStatus(`Error: ${state.lastResult.error}`, "red");
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
          updateStatus("Working...", "blue");
        } else {
          setButtonsDisabled(false);
          updateStatus("Done.", "green");
          setTimeout(() => updateStatus("Ready"), 3000);
        }
      }
    }
  });

  // --- Initialization ---

  async function checkStatus() {
    try {
      const response = await browser.runtime.sendMessage({ action: "get-scan-status" });
      if (response) {
        updateUI(response);
      }
    } catch (e) {
      console.error("Error checking status:", e);
    }
  }

  checkStatus();

  // --- Button Handlers ---

  async function triggerAction(actionName) {
    setButtonsDisabled(true);
    updateStatus("Starting...", "blue");
    updateProgress(0, 0, "Initializing...");

    try {
      const response = await browser.runtime.sendMessage({ action: actionName });
      if (response && response.error) {
        updateStatus(response.error, "red");
        setButtonsDisabled(false);
      }
      // If success, the background script will emit status updates which our listener handles
    } catch (e) {
      console.error("Error triggering action:", e);
      updateStatus("Failed to start.", "red");
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
