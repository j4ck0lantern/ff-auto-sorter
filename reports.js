document.addEventListener("DOMContentLoaded", async () => {
    const listContainer = document.getElementById("report-list");
    const emptyState = document.getElementById("empty-state");
    const content = document.getElementById("report-content");
    const titleEl = document.getElementById("report-title");
    const dateEl = document.getElementById("report-date");
    const statMoved = document.getElementById("stat-moved");
    const statTagged = document.getElementById("stat-tagged");
    const statScanned = document.getElementById("stat-scanned");
    const movesTbody = document.querySelector("#moves-table tbody");
    const tagsTbody = document.querySelector("#tags-table tbody");
    const clearAllBtn = document.getElementById("clearAllBtn");
    const deleteReportBtn = document.getElementById("deleteReportBtn");

    let currentReportId = null;

    // Load List
    await refreshList();

    // Check URL Param
    const urlParams = new URLSearchParams(window.location.search);
    const initialId = urlParams.get('id');
    if (initialId) {
        loadReport(initialId);
    }

    async function refreshList() {
        const { reportsIndex } = await browser.storage.local.get("reportsIndex");
        listContainer.innerHTML = "";

        if (!reportsIndex || reportsIndex.length === 0) {
            listContainer.innerHTML = `<div style="padding:15px; color:#999; text-align:center;">No reports found</div>`;
            return;
        }

        reportsIndex.forEach(r => {
            const date = new Date(r.timestamp);
            const dateStr = date.toLocaleDateString() + " " + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

            const div = document.createElement("div");
            div.className = "report-item";
            div.dataset.id = r.id;
            div.innerHTML = `
                <div class="date">${r.type} <span style="font-weight:normal;">(${r.stats.moved} moved)</span></div>
                <div class="meta">${dateStr}</div>
            `;
            div.onclick = () => loadReport(r.id);
            listContainer.appendChild(div);
        });
    }

    async function loadReport(id) {
        currentReportId = id;

        // Highlight active
        document.querySelectorAll(".report-item").forEach(el => {
            el.classList.toggle("active", el.dataset.id === id);
        });

        const key = `report_${id}`;
        const data = await browser.storage.local.get(key);
        const report = data[key];

        if (!report) {
            alert("Report data not found.");
            return;
        }

        // Show Content
        emptyState.style.display = "none";
        content.style.display = "block";

        const date = new Date(report.timestamp);
        titleEl.textContent = `${report.type} Report`;
        dateEl.textContent = date.toLocaleString();

        statMoved.textContent = report.stats.moved || 0;
        statTagged.textContent = report.stats.tagged || 0;
        statScanned.textContent = report.stats.scanned || 0;

        // Render Moves
        movesTbody.innerHTML = "";
        if (report.moves && report.moves.length > 0) {
            document.getElementById("moves-section").style.display = "block";
            report.moves.forEach(m => {
                const tr = document.createElement("tr");
                tr.innerHTML = `
                    <td><a href="${m.url}" target="_blank">${escapeHtml(m.title)}</a></td>
                    <td style="color:var(--muted);">${escapeHtml(m.from)}</td>
                    <td style="font-weight:500;">${escapeHtml(m.to)}</td>
                    <td><small>${escapeHtml(m.reason)}</small></td>
                `;
                movesTbody.appendChild(tr);
            });
        } else {
            document.getElementById("moves-section").style.display = "none";
        }

        // Render Tags
        tagsTbody.innerHTML = "";
        if (report.tags && report.tags.length > 0) {
            document.getElementById("tags-section").style.display = "block";
            report.tags.forEach(t => {
                const tr = document.createElement("tr");
                const tagsHtml = t.tags.map(tag => `<span class="tag-pill">${escapeHtml(tag)}</span>`).join(" ");
                tr.innerHTML = `
                    <td><a href="${t.url}" target="_blank">${escapeHtml(t.title)}</a></td>
                    <td>${tagsHtml}</td>
                `;
                tagsTbody.appendChild(tr);
            });
        } else {
            document.getElementById("tags-section").style.display = "none";
        }
    }

    clearAllBtn.onclick = async () => {
        if (!confirm("Delete all reports?")) return;

        const { reportsIndex } = await browser.storage.local.get("reportsIndex");
        if (reportsIndex) {
            for (const r of reportsIndex) {
                await browser.storage.local.remove(`report_${r.id}`);
            }
        }
        await browser.storage.local.remove("reportsIndex");
        window.location.href = "reports.html"; // reload clean
    };

    deleteReportBtn.onclick = async () => {
        if (!currentReportId || !confirm("Delete this report?")) return;

        await browser.storage.local.remove(`report_${currentReportId}`);

        const { reportsIndex } = await browser.storage.local.get("reportsIndex");
        const newIndex = reportsIndex.filter(r => r.id !== currentReportId);
        await browser.storage.local.set({ reportsIndex: newIndex });

        // Refresh
        currentReportId = null;
        emptyState.style.display = "block";
        content.style.display = "none";
        await refreshList();
    };

    function escapeHtml(text) {
        if (!text) return "";
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
});
