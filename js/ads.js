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

        const status = document.getElementById("freepdf-test-display-ad-status");
        const showStatus = message => {
            if (status) {
                status.textContent = message;
                status.style.display = "block";
            }
            console.info("[FreePDF ads] " + message);
        };
        const hideStatus = () => {
            if (status) status.style.display = "none";
        };

        // If GPT never runs its command queue, do not leave a permanent spinner.
        let gptInitialized = false;
        const watchdog = window.setTimeout(() => {
            if (!gptInitialized) {
                showStatus("Google's ad script did not initialize. Check the browser console/network, disable ad blockers for localhost, and reload.");
                console.warn("[FreePDF ads] GPT did not initialize within 8 seconds. The GPT script may be blocked or unreachable.");
            }
        }, 8000);

        const gptScript = document.querySelector('script[src*="securepubads.g.doubleclick.net/tag/js/gpt.js"]');
        if (gptScript) {
            gptScript.addEventListener("error", () => {
                window.clearTimeout(watchdog);
                showStatus("Google's GPT script failed to load. Check your internet connection, browser ad blocker, DNS, or network filtering.");
                console.error("[FreePDF ads] Failed to load GPT script.");
            }, { once: true });
        }

        // Initialize the command queue before the async GPT script finishes loading.
        window.googletag = window.googletag || { cmd: [] };
        window.googletag.cmd = window.googletag.cmd || [];
        window.googletag.cmd.push(() => {
            gptInitialized = true;
            window.clearTimeout(watchdog);

            if (container.dataset.gptInitialized === "true") return;
            container.dataset.gptInitialized = "true";

            // Register the slot with PubAds before enabling services. Without
            // addService(pubads), GPT has no registered slot to request/render.
            const pubads = window.googletag.pubads();
            const slot = window.googletag.defineSlot(
                "/6355419/Travel/Europe/France/Paris",
                [300, 600],
                "freepdf-test-display-ad"
            );

            if (!slot) {
                showStatus("GPT loaded, but the test ad slot could not be created. Check the browser console.");
                console.error("[FreePDF ads] googletag.defineSlot returned null.");
                return;
            }

            slot.addService(pubads);
            let renderResponseReceived = false;
            let renderWatchdog = null;

            pubads.addEventListener("slotRenderEnded", event => {
                if (event.slot !== slot) return;
                renderResponseReceived = true;
                if (renderWatchdog !== null) window.clearTimeout(renderWatchdog);

                if (event.isEmpty) {
                    showStatus("Google GPT responded, but this test request returned no ad. Check the Network tab for gampad/ads requests.");
                    console.warn("[FreePDF ads] GPT slot rendered empty.", event);
                } else {
                    hideStatus();
                    console.info("[FreePDF ads] GPT test ad rendered successfully.");
                }
            });

            pubads.addEventListener("slotOnload", event => {
                if (event.slot === slot) {
                    hideStatus();
                    console.info("[FreePDF ads] GPT ad iframe loaded.");
                }
            });

            pubads.collapseEmptyDivs();
            window.googletag.enableServices();

            // Also detect a request that never produces a render event. The earlier
            // watchdog only covers GPT initialization, not the ad response itself.
            renderWatchdog = window.setTimeout(() => {
                if (!renderResponseReceived) {
                    showStatus("GPT initialized, but no ad render response arrived within 12 seconds. Check Network for gampad/ads requests and blocked requests.");
                    console.warn("[FreePDF ads] No slotRenderEnded event received within 12 seconds.");
                }
            }, 12000);

            window.googletag.display("freepdf-test-display-ad");
            console.info("[FreePDF ads] GPT initialized; requesting the documented sample test slot.");
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
