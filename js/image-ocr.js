
(function () {
    "use strict";

    async function process(files) {
        if (!files || files.length !== 1) {
            throw new Error("Please select one image or PDF file.");
        }

        const file = files[0];
        const isPDF = file.name.toLowerCase().endsWith(".pdf");
        const isImage = /^image\/(jpeg|png|webp|bmp|tiff?)$/i.test(file.type);

        if (!isPDF && !isImage) {
            throw new Error("Please select a JPG, PNG, WEBP, BMP, TIFF, or PDF file.");
        }

        if (!window.Tesseract) {
            throw new Error("OCR library did not load. Check your internet connection.");
        }

        const status = document.getElementById("workspaceStatus");
        const setStatus = message => {
            if (status) status.textContent = message;
        };

        let images = [];

        if (isPDF) {
            if (!window.pdfjsLib) {
                throw new Error("PDF.js has not loaded.");
            }

            window.pdfjsLib.GlobalWorkerOptions.workerSrc =
                "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

            setStatus("Opening PDF...");

            const pdf = await window.pdfjsLib.getDocument({
                data: new Uint8Array(await file.arrayBuffer())
            }).promise;

            for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
                setStatus(`Preparing PDF page ${pageNumber} of ${pdf.numPages}...`);

                const page = await pdf.getPage(pageNumber);
                const viewport = page.getViewport({ scale: 2 });
                const canvas = document.createElement("canvas");

                canvas.width = Math.ceil(viewport.width);
                canvas.height = Math.ceil(viewport.height);

                await page.render({
                    canvasContext: canvas.getContext("2d"),
                    viewport
                }).promise;

                images.push(canvas);
            }
        } else {
            images.push(file);
        }

        const worker = await window.Tesseract.createWorker("eng");
        let extractedText = "";

        try {
            for (let i = 0; i < images.length; i++) {
                setStatus(`Recognizing text: ${i + 1} of ${images.length}...`);

                const result = await worker.recognize(images[i]);

                extractedText +=
                    (isPDF ? `--- Page ${i + 1} ---\n` : "") +
                    result.data.text.trim() +
                    "\n\n";
            }
        } finally {
            await worker.terminate();
        }

        if (!extractedText.trim()) {
            throw new Error("No readable text was found in this file.");
        }

        showResult(extractedText, file.name);
        setStatus("OCR complete. Review your extracted text below.");
    }

    function showResult(text, originalName) {
        let panel = document.getElementById("ocrResultPanel");

        if (!panel) {
            panel = document.createElement("section");
            panel.id = "ocrResultPanel";
            panel.style.cssText =
                "margin-top:20px;padding:16px;border:1px solid #ddd;" +
                "border-radius:10px;";

            const workspace = document.getElementById("toolWorkspace");
            if (!workspace) return;

            workspace.appendChild(panel);
        }

        panel.replaceChildren();

        const heading = document.createElement("h3");
        heading.textContent = "Recognized Text";

        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.rows = 12;
        textarea.style.cssText =
            "width:100%;box-sizing:border-box;margin:12px 0;" +
            "padding:12px;border-radius:8px;";

        const copyButton = document.createElement("button");
        copyButton.type = "button";
        copyButton.textContent = "Copy Text";

        copyButton.addEventListener("click", async () => {
            try {
                await navigator.clipboard.writeText(textarea.value);
                copyButton.textContent = "Copied!";
            } catch {
                textarea.focus();
                textarea.select();
                document.execCommand("copy");
                copyButton.textContent = "Copied!";
            }
        });

        const downloadButton = document.createElement("button");
        downloadButton.type = "button";
        downloadButton.textContent = "Download TXT";
        downloadButton.style.marginLeft = "8px";

        downloadButton.addEventListener("click", async () => {
            const blob = new Blob([textarea.value], { type: "text/plain;charset=utf-8" });
            const filename = originalName.replace(/\.[^.]+$/, "") + "-ocr.txt";
            if (window.PDFConverterAds?.downloadFile) {
                await window.PDFConverterAds.downloadFile(blob, filename);
            } else {
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                link.remove();
                setTimeout(() => URL.revokeObjectURL(url), 1000);
            }
        });

        panel.append(heading, textarea, copyButton, downloadButton);
    }

    window.PDFConverter.registerTool({
        name: "Image OCR",
        accept: ".jpg,.jpeg,.png,.webp,.bmp,.tif,.tiff,.pdf",
        multiple: false,
        action: "Recognize Text",
        process
    });
})();
