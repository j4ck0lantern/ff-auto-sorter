document.addEventListener('DOMContentLoaded', () => {
  const scanButton = document.getElementById('scanButton');
  const statusEl = document.getElementById('status');

  async function checkScanStatus() {
    try {
      const response = await browser.runtime.sendMessage({ action: "get-scan-status" });
      if (response && response.isScanning) {
        scanButton.disabled = true;
        scanButton.textContent = "Scanning...";
        statusEl.textContent = "Scan is running in the background.";
      } else {
        scanButton.disabled = false;
        scanButton.textContent = "Organize Existing Bookmarks";
      }
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

  checkScanStatus();
});
