/* =========================================================
   PDF Converter — Shared download and optional rewarded ads
   Downloads are never blocked by missing/failed ad inventory.
   ========================================================= */
(function () {
    "use strict";

    const FALLBACK_MS = 10000;
    let rewardedAdProvider = null;

    function triggerDownload(blob, filename) {
        if (!(blob instanceof Blob)) throw new TypeError("A valid output Blob is required.");
        if (!filename || typeof filename !== "string") throw new TypeError("A filename is required.");

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    }

    async function downloadFile(blob, filename, options = {}) {
        const provider = rewardedAdProvider;
        if (!provider || options.skipRewardedAd === true) {
            triggerDownload(blob, filename);
            return { downloaded: true, adAttempted: false };
        }

        let timeoutId;
        try {
            const timeout = new Promise(resolve => {
                timeoutId = window.setTimeout(() => resolve("timeout"), FALLBACK_MS);
            });
            await Promise.race([
                Promise.resolve().then(() => provider.attemptRewardedAd()),
                timeout
            ]);
        } catch (error) {
            console.warn("Rewarded ad unavailable; continuing with download.", error);
        } finally {
            if (timeoutId) window.clearTimeout(timeoutId);
        }

        triggerDownload(blob, filename);
        return { downloaded: true, adAttempted: true };
    }

    function setRewardedAdProvider(provider) {
        if (provider !== null &&
            (!provider || typeof provider.attemptRewardedAd !== "function")) {
            throw new TypeError("Provider must implement attemptRewardedAd(), or be null.");
        }
        rewardedAdProvider = provider;
    }

    window.PDFConverterAds = Object.freeze({ downloadFile, setRewardedAdProvider });
})();
