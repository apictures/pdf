/* =========================================================
   FreePDF — Shared download + ad test harness
   TEST MODE: display ads use Google's GPT sample test inventory.
   Rewarded ads are simulated locally until a Google Ad Manager
   rewarded inventory/ad unit is configured. Downloads never block.
   ========================================================= */
(function () {
    "use strict";

    const FALLBACK_MS = 10000;
    const TEST_MODE = true;
    let rewardedAdProvider = null;
    let testModal = null;
    let testResolve = null;

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

    function closeTestModal(result) {
        if (testModal) {
            testModal.remove();
            testModal = null;
        }
        const resolve = testResolve;
        testResolve = null;
        if (resolve) resolve(result);
    }

    function showTestRewardedAd() {
        if (testModal) closeTestModal("closed");
        return new Promise(resolve => {
            testResolve = resolve;

            const overlay = document.createElement("div");
            overlay.id = "freepdf-test-ad-overlay";
            overlay.setAttribute("role", "dialog");
            overlay.setAttribute("aria-modal", "true");
            overlay.setAttribute("aria-labelledby", "freepdf-test-ad-title");
            overlay.style.cssText = [
                "position:fixed", "inset:0", "z-index:2147483647",
                "display:flex", "align-items:center", "justify-content:center",
                "padding:20px", "background:rgba(5,8,20,.82)",
                "font-family:system-ui,-apple-system,Segoe UI,sans-serif"
            ].join(";");

            const panel = document.createElement("div");
            panel.style.cssText = [
                "width:min(100%,420px)", "padding:26px", "border-radius:18px",
                "background:#fff", "color:#171923", "box-shadow:0 20px 70px rgba(0,0,0,.35)"
            ].join(";");

            const badge = document.createElement("div");
            badge.textContent = "TEST MODE · NOT A REAL AD";
            badge.style.cssText = "display:inline-block;padding:6px 9px;border-radius:6px;background:#fff0c2;color:#704b00;font-size:11px;font-weight:800;letter-spacing:.04em";

            const title = document.createElement("h2");
            title.id = "freepdf-test-ad-title";
            title.textContent = "Rewarded ad test";
            title.style.cssText = "margin:16px 0 8px;font-size:23px";

            const copy = document.createElement("p");
            copy.textContent = "Use these controls to test the download flow. This is a local simulation, not a Google-served advertisement.";
            copy.style.cssText = "line-height:1.5;color:#555d6d;margin:0 0 20px";

            const button = (label, background, color, result) => {
                const el = document.createElement("button");
                el.type = "button";
                el.textContent = label;
                el.style.cssText = `display:block;width:100%;padding:12px 14px;margin-top:10px;border:0;border-radius:9px;background:${background};color:${color};font-weight:700;font-size:14px;cursor:pointer`;
                el.addEventListener("click", () => closeTestModal(result));
                return el;
            };

            panel.append(badge, title, copy);
            panel.append(
                button("✓ Simulate ad completed", "#4f46e5", "#fff", "completed"),
                button("Close ad (test fallback)", "#eef0f5", "#202334", "closed"),
                button("Simulate ad unavailable", "#eef0f5", "#202334", "unavailable")
            );
            overlay.appendChild(panel);
            overlay.addEventListener("click", event => {
                if (event.target === overlay) closeTestModal("closed");
            });
            document.body.appendChild(overlay);
            testModal = overlay;
            panel.querySelector("button")?.focus();
        });
    }

    function initializeTestDisplayAd() {
        const container = document.getElementById("freepdf-test-display-ad");
        if (!container) return;

        // Create GPT's command queue before its async script finishes loading.
        window.googletag = window.googletag || { cmd: [] };
        window.googletag.cmd = window.googletag.cmd || [];
        window.googletag.cmd.push(() => {
            if (container.dataset.gptInitialized === "true") return;
            container.dataset.gptInitialized = "true";

            // Google's documented GPT sample inventory for testing.
            const slot = window.googletag
                .defineSlot("/6355419/Travel/Europe/France/Paris", [300, 250], "freepdf-test-display-ad");

            if (!slot) {
                container.textContent = "Test ad slot could not be created.";
                return;
            }

            slot.addService(window.googletag.pubads());
            window.googletag.pubads().addEventListener("slotRenderEnded", event => {
                if (event.slot !== slot) return;
                if (event.isEmpty) {
                    container.textContent = "Google test ad did not fill. The rest of FreePDF should still work.";
                    container.style.cssText = "width:100%;min-height:250px;display:flex;align-items:center;justify-content:center;text-align:center;padding:12px;box-sizing:border-box;color:#697386;font-size:12px;";
                }
            });
            window.googletag.pubads().collapseEmptyDivs();
            window.googletag.enableServices();
            window.googletag.display("freepdf-test-display-ad");
        });
    }

    async function downloadFile(blob, filename, options = {}) {
        const provider = rewardedAdProvider;
        if (!provider || options.skipRewardedAd === true) {
            triggerDownload(blob, filename);
            return { downloaded: true, adAttempted: false };
        }

        let timeoutId;
        let outcome = "unavailable";
        try {
            const timeout = new Promise(resolve => {
                timeoutId = window.setTimeout(() => resolve("timeout"), FALLBACK_MS);
            });
            outcome = await Promise.race([
                Promise.resolve().then(() => provider.attemptRewardedAd()),
                timeout
            ]);
        } catch (error) {
            console.warn("Rewarded ad unavailable; continuing with download.", error);
        } finally {
            if (timeoutId) window.clearTimeout(timeoutId);
        }

        if (outcome === "timeout" && typeof provider.cancelRewardedAd === "function") {
            provider.cancelRewardedAd();
        }

        // Deliberately download on completion, close, failure, or timeout while testing.
        triggerDownload(blob, filename);
        return { downloaded: true, adAttempted: true, adOutcome: outcome };
    }

    function setRewardedAdProvider(provider) {
        if (provider !== null &&
            (!provider || typeof provider.attemptRewardedAd !== "function")) {
            throw new TypeError("Provider must implement attemptRewardedAd(), or be null.");
        }
        rewardedAdProvider = provider;
    }

    window.PDFConverterAds = Object.freeze({
        downloadFile,
        setRewardedAdProvider,
        testMode: TEST_MODE
    });

    if (TEST_MODE) {
        setRewardedAdProvider({
            attemptRewardedAd: showTestRewardedAd,
            cancelRewardedAd: () => closeTestModal("timeout")
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initializeTestDisplayAd, { once: true });
    } else {
        initializeTestDisplayAd();
    }
})();
