/* =========================================================
   FreePDF — Shared download handler
   Ads are disabled until a real, approved provider is configured.
   File downloads must not depend on ads being available.
   ========================================================= */
(function () {
    "use strict";

    function triggerDownload(blob, filename) {
        if (!(blob instanceof Blob)) {
            throw new TypeError("A valid output Blob is required.");
        }
        if (!filename || typeof filename !== "string") {
            throw new TypeError("A filename is required.");
        }

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        link.remove();

        // Give the browser time to start the download before releasing the URL.
        window.setTimeout(() => URL.revokeObjectURL(url), 1500);
    }

    async function downloadFile(blob, filename) {
        triggerDownload(blob, filename);
        return { downloaded: true, adAttempted: false };
    }

    window.PDFConverterAds = Object.freeze({
        downloadFile,
        testMode: false
    });
})();
