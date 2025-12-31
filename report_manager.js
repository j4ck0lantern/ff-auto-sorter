class ReportManager {
    constructor() {
        this.currentReport = null;
    }

    start(type) {
        this.currentReport = {
            id: Date.now().toString(),
            timestamp: Date.now(),
            type: type,
            moves: [],
            tags: [],
            stats: { moved: 0, tagged: 0, scanned: 0 }
        };
        console.log(`[ReportManager] Started report: ${type}`);
    }

    logScan() {
        if (this.currentReport) {
            this.currentReport.stats.scanned++;
        }
    }

    logMove(bookmark, fromFolder, toFolder, reason) {
        if (!this.currentReport) return;

        // Avoid duplicate logs if possible, but for now just push
        this.currentReport.moves.push({
            title: bookmark.title,
            url: bookmark.url,
            from: fromFolder,
            to: toFolder,
            reason: reason || "Rule/AI Match"
        });
        this.currentReport.stats.moved++;
        console.log(`[ReportManager] Logged Move: ${bookmark.title} -> ${toFolder}`);
    }

    logTag(bookmark, tags) {
        if (!this.currentReport) return;

        this.currentReport.tags.push({
            title: bookmark.title,
            url: bookmark.url,
            tags: tags
        });
        this.currentReport.stats.tagged++;
        console.log(`[ReportManager] Logged Tag: ${bookmark.title}`);
    }

    async finish() {
        if (!this.currentReport) return null;

        const report = this.currentReport;
        this.currentReport = null;

        try {
            // Load Index
            const { reportsIndex } = await browser.storage.local.get("reportsIndex");
            let index = reportsIndex || [];

            // Prune > 30 Days
            const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
            const now = Date.now();
            const validReports = [];
            const idsToDelete = [];

            for (const r of index) {
                if (now - r.timestamp < thirtyDaysMs) {
                    validReports.push(r);
                } else {
                    idsToDelete.push(r.id);
                }
            }

            // Delete old data
            for (const id of idsToDelete) {
                await browser.storage.local.remove(`report_${id}`);
            }

            // Add new
            const summary = {
                id: report.id,
                timestamp: report.timestamp,
                type: report.type,
                stats: report.stats
            };
            validReports.unshift(summary); // Prepend

            // Save
            await browser.storage.local.set({
                reportsIndex: validReports,
                [`report_${report.id}`]: report
            });

            console.log(`[ReportManager] Saved report ${report.id}`);
            return report.id;

        } catch (e) {
            console.error("[ReportManager] Failed to save report:", e);
            return null;
        }
    }
}

// Global Instance
window.reportManager = new ReportManager();
