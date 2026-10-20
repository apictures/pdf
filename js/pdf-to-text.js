
/* =========================================================
   PDF Converter — PDF to Text
   Extracts PDF text entirely in the browser.
   ========================================================= */

(function () {
    "use strict";

    window.PDFConverter = window.PDFConverter || {};

    window.PDFConverter.registerTool({
        name: "PDF to Text",
        accept: ".pdf",
        multiple: false,
        description: "Extract text from your PDF.",
        action: "Extract Text",

        async process(files) {
            if (!files || !files.length) {
                throw new Error("Please select a PDF file.");
            }

            if (!window.pdfjsLib) {
                throw new Error(
                    "PDF.js failed to load. Please refresh the page."
                );
            }

            const file = files[0];

            const pdf = await window.pdfjsLib.getDocument({
                data: new Uint8Array(await file.arrayBuffer())
            }).promise;

            const textPages = [];

            for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
                const page = await pdf.getPage(pageNumber);
                const content = await page.getTextContent();

                const pageText = content.items
                    .filter(item => typeof item.str === "string")
                    .map(item => item.str)
                    .join(" ");

                textPages.push(
                    `--- Page ${pageNumber} ---\n\n${pageText}`
                );
            }

            const text = textPages.join("\n\n");

            if (!text.trim()) {
                throw new Error(
                    "No selectable text was found. This PDF may contain scanned images; OCR will be a separate tool."
                );
            }

            const blob = new Blob([text], {
                type: "text/plain;charset=utf-8"
            });

            return { blob, filename: file.name.replace(/\.pdf$/i, "") + ".txt" };
        }
    });
})();
