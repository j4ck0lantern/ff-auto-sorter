document.addEventListener('DOMContentLoaded', () => {
  const scanButton = document.getElementById('scanButton');
  const statusEl = document.getElementById('status');
  // --- NEW: Get progress bar elements ---
  const progressContainer = document.getElementById('progress-container');
  const progressBar = document.getElementById('progress-bar');
  const progressText = document.getElementById('progress-text');
  const progressDetail = document.getElementById('progress-detail');

  // --- NEW: Function to update the progress bar UI ---
  function updateProgress(current, total, detail = "") {
    if (total > 0) {
      const percentage = Math.round((current / total) * 100);
      progressBar.style.width = `${percentage}%`;
      progressBar.textContent = `${percentage}%`;
      progressText.textContent = `${current} / ${total} bookmarks processed`;
      progressDetail.textContent = detail ? `Scanning: ${detail}` : "";
      progressContainer.style.display = 'block';
    } else {
      progressContainer.style.display = 'none';
      progressDetail.textContent = "";
    }
  }

  function updateUI(isScanning, progress = { current: 0, total: 0, detail: "" }) {
    if (isScanning) {
      scanButton.disabled = true;
      scanButton.textContent = "Scanning...";
      statusEl.textContent = "Scan is running in the background.";
      updateProgress(progress.current, progress.total, progress.detail);
    } else {
      scanButton.disabled = false;
      scanButton.textContent = "Organize Existing Bookmarks";
      progressContainer.style.display = 'none'; // Hide progress when not scanning
      progressDetail.textContent = ""; // Clear detail when not scanning
    }
  }

  async function checkScanStatus() {
    try {
      const response = await browser.runtime.sendMessage({ action: "get-scan-status" });
      updateUI(response && response.isScanning, response.progress);
    } catch (e) {
      console.error("Error checking scan status:", e);
      statusEl.textContent = "Error updating status.";
      statusEl.style.color = 'red';
    }
  }

  scanButton.addEventListener('click', async () => {
    scanButton.disabled = true;
    scanButton.textContent = "Scanning...";
    statusEl.textContent = "";
    updateProgress(0, 0); // Reset and show progress bar immediately

    try {
      const response = await browser.runtime.sendMessage({ action: "scan-existing" });
      if (response && response.success) {
        statusEl.textContent = "Scan complete!";
        statusEl.style.color = 'green';
      } else {
        if (response.error === "Scan already in progress") {
           statusEl.textContent = "A scan is already running.";
           statusEl.style.color = 'orange';
        } else {
          throw new Error(response.error || "Unknown error occurred.");
        }
      }
    } catch (e) {
      console.error("Error sending scan message:", e);
      statusEl.textContent = "Scan failed. Check console.";
      statusEl.style.color = 'red';
    } finally {
      setTimeout(() => {
        statusEl.textContent = "";
        checkScanStatus();
      }, 3000);
    }
  });

  browser.runtime.onMessage.addListener((message) => {
    if (message.action === "scan-status-update") {
      updateUI(message.isScanning, message.progress);
    }
    // --- NEW: Listen for progress-specific updates ---
    if (message.action === "scan-progress-update") {
      updateProgress(message.progress.current, message.progress.total, message.progress.detail);
    }
  });

  checkScanStatus();
});
