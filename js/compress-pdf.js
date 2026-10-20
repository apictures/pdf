/* FreePDF Compress PDF — browser-side raster compression. */
(function () {
    "use strict";
    const app = window.PDFConverter;
    if (!app) { console.error("PDF Converter registry is not loaded."); return; }
    const presets = {
        balanced: { scale: 1.15, quality: 0.68 },
        smaller: { scale: 0.85, quality: 0.50 },
        quality: { scale: 1.50, quality: 0.84 }
    };
    function formatBytes(bytes) {
        if (bytes < 1024) return bytes + " B";
        if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
        return (bytes / 1048576).toFixed(2) + " MB";
    }
    app.registerTool({
        name: "Compress PDF",
        accept: ".pdf,application/pdf",
        multiple: false,
        description: "Reduce PDF file size in your browser with adjustable image quality.",
        action: "Compress PDF",
        async process(files, context = {}) {
            const file = files && files[0];
            if (!file) throw new Error("Please select a PDF file.");
            if (!window.pdfjsLib) throw new Error("PDF.js did not load. Refresh the page and try again.");
            if (!window.jspdf || typeof window.jspdf.jsPDF !== "function") throw new Error("The PDF output library did not load. Refresh the page and try again.");
            window.pdfjsLib.GlobalWorkerOptions.workerSrc =
                "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
            const preset = presets[context.compressionPreset] || presets.balanced;
            let pdf;
            try {
                pdf = await window.pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
            } catch (error) {
                if (/password/i.test(String(error && error.message))) throw new Error("This PDF may be password-protected. Unlock it before compressing.");
                throw new Error("Could not open this PDF. Check that it is valid and readable.");
            }
            if (!pdf.numPages) throw new Error("This PDF does not contain any pages.");
            const firstPage = await pdf.getPage(1);
            const firstSize = firstPage.getViewport({ scale: 1 });
            const doc = new window.jspdf.jsPDF({
                orientation: firstSize.width >= firstSize.height ? "landscape" : "portrait",
                unit: "pt", format: [firstSize.width, firstSize.height], compress: true
            });
            for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
                const page = pageNumber === 1 ? firstPage : await pdf.getPage(pageNumber);
                const size = page.getViewport({ scale: 1 });
                const viewport = page.getViewport({ scale: preset.scale });
                const canvas = document.createElement("canvas");
                canvas.width = Math.max(1, Math.ceil(viewport.width));
                canvas.height = Math.max(1, Math.ceil(viewport.height));
                const ctx = canvas.getContext("2d", { alpha: false });
                if (!ctx) throw new Error("Your browser could not prepare a page for compression.");
                ctx.fillStyle = "#ffffff";
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                await page.render({ canvasContext: ctx, viewport, background: "rgb(255,255,255)" }).promise;
                const data = canvas.toDataURL("image/jpeg", preset.quality);
                if (pageNumber > 1) doc.addPage([size.width, size.height], size.width >= size.height ? "landscape" : "portrait");
                doc.addImage(data, "JPEG", 0, 0, size.width, size.height, undefined, "FAST");
                canvas.width = 1; canvas.height = 1;
                page.cleanup();
                if (context.onProgress) context.onProgress(pageNumber, pdf.numPages);
            }
            const blob = doc.output("blob");
            if (!blob || !blob.size) throw new Error("Compression did not produce a valid PDF.");
            let verification;
            try {
                verification = await window.pdfjsLib.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
                if (verification.numPages !== pdf.numPages) {
                    throw new Error("The output page count does not match the original.");
                }
                await verification.destroy();
            } catch (error) {
                throw new Error("The generated PDF failed validation. Please try a different compression setting.");
            }
            await pdf.destroy();
            const difference = file.size ? Math.round((1 - blob.size / file.size) * 100) : 0;
            let message = "Created " + formatBytes(blob.size) + " from " + formatBytes(file.size) + ". ";
            message += difference > 0 ? "File size reduced by about " + difference + "%." : "This file did not get smaller; try Smallest file.";
            message += " Pages are images, so selectable/searchable text, links, forms, and signatures may not be preserved.";
            return { blob, filename: (file.name.replace(/\.pdf$/i, "") || "document") + "-compressed.pdf", message };
        }
    });
})();