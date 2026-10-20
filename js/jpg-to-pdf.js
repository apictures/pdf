
/* =========================================================
   PDF Converter — JPG / PNG to PDF
   Runs entirely in the browser.
   ========================================================= */

(function () {
    "use strict";

    window.PDFConverter = window.PDFConverter || {};

    window.PDFConverter.registerTool({
        name: "JPG to PDF",
        accept: ".jpg,.jpeg,.png",
        multiple: true,
        description: "Select images to combine into a PDF.",
        action: "Convert to PDF",

        async process(files) {
            if (!files || files.length === 0) {
                throw new Error("Please select at least one image.");
            }

            if (!window.PDFLib) {
                throw new Error(
                    "PDF library failed to load. Please refresh the page."
                );
            }

            const { PDFDocument } = window.PDFLib;
            const pdf = await PDFDocument.create();

            for (const file of files) {
                const extension = file.name
                    .split(".")
                    .pop()
                    .toLowerCase();

                const bytes = await file.arrayBuffer();
                let image;

                if (extension === "jpg" || extension === "jpeg") {
                    image = await pdf.embedJpg(bytes);
                } else if (extension === "png") {
                    image = await pdf.embedPng(bytes);
                } else {
                    throw new Error(
                        `Unsupported image format: ${file.name}`
                    );
                }

                const page = pdf.addPage([
                    image.width,
                    image.height
                ]);

                page.drawImage(image, {
                    x: 0,
                    y: 0,
                    width: image.width,
                    height: image.height
                });
            }

            const pdfBytes = await pdf.save();
            const blob = new Blob([pdfBytes], {
                type: "application/pdf"
            });

            return { blob, filename: "images.pdf" };
        }
    });
})();
