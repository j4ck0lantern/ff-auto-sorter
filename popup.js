document.addEventListener('DOMContentLoaded', () => {
  const scanButton = document.getElementById('scanButton');
  const statusEl = document.getElementById('status');

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
        throw new Error(response.error || "Unknown error occurred.");
      }
    } catch (e) {
      console.error("Error sending scan message:", e);
      statusEl.textContent = "Scan failed. Check console.";
      statusEl.style.color = 'red';
    } finally {
      setTimeout(() => {
        scanButton.disabled = false;
        scanButton.textContent = "Organize Existing Bookmarks";
        statusEl.textContent = "";
      }, 3000);
    }
  });
});