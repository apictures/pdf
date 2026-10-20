
/* =========================================================
   PDF Converter — Word to PDF
   Browser-side DOCX rendering and PDF creation.
   Supports .docx files in this first version.
   ========================================================= */

(function () {
    "use strict";

    window.PDFConverter = window.PDFConverter || {};

    window.PDFConverter.registerTool({
        name: "Word to PDF",
        accept: ".docx",
        multiple: false,
        description: "Choose a DOCX document to convert into PDF.",
        action: "Convert to PDF",

        async process(files) {
            if (!files || !files.length) {
                throw new Error("Please select a DOCX document.");
            }

            if (!window.docx || !window.docx.renderAsync) {
                throw new Error(
                    "The Word document library failed to load."
                );
            }

            if (!window.html2canvas) {
                throw new Error(
                    "The page capture library failed to load."
                );
            }

            if (!window.PDFLib) {
                throw new Error(
                    "The PDF library failed to load."
                );
            }

            const file = files[0];

            if (!file.name.toLowerCase().endsWith(".docx")) {
                throw new Error(
                    "Please select a .docx file. Legacy .doc files are not supported."
                );
            }

            const host = document.createElement("div");

            host.style.cssText = [
                "position:fixed",
                "left:-12000px",
                "top:0",
                "width:1100px",
                "background:#ffffff",
                "color:#000000",
                "z-index:-1"
            ].join(";");

            document.body.appendChild(host);

            try {
                const bytes = await file.arrayBuffer();

                // Render the Word document into browser HTML pages.
                const styleContainer = document.createElement("div");
                

                await window.docx.renderAsync(
                    bytes,
                    host,
                    styleContainer,
                    {
                        inWrapper: true,
                        breakPages: true,
                        ignoreWidth: false,
                        ignoreHeight: false,
                        ignoreFonts: false,
                        renderHeaders: true,
                        renderFooters: true,
                        renderFootnotes: true
                    }
                );

                // docx-preview creates one .docx element per page.
                const pages = Array.from(
                    host.querySelectorAll(".docx")
                );

                if (!pages.length) {
                    throw new Error(
                        "No document pages were rendered. Check whether this DOCX file is valid."
                    );
                }

                const { PDFDocument } = window.PDFLib;
                const outputPdf = await PDFDocument.create();

                for (let i = 0; i < pages.length; i++) {
                    const element = pages[i];

                    // Ensure fonts and images have had time to load.
                    if (document.fonts && document.fonts.ready) {
                        await document.fonts.ready;
                    }

                    const canvas = await window.html2canvas(element, {
                        backgroundColor: "#ffffff",
                        scale: 1.5,
                        useCORS: true,
                        logging: false
                    });

                    const imageBytes = await new Promise(
                        (resolve, reject) => {
                            canvas.toBlob(blob => {
                                if (!blob) {
                                    reject(
                                        new Error("Could not capture a document page.")
                                    );
                                    return;
                                }

                                blob.arrayBuffer()
                                    .then(resolve)
                                    .catch(reject);
                            }, "image/png");
                        }
                    );

                    const image = await outputPdf.embedPng(imageBytes);

                    // Convert CSS pixels approximately to PDF points.
                    const pageWidth = canvas.width * 72 / (96 * 1.5);
                    const pageHeight = canvas.height * 72 / (96 * 1.5);

                    const page = outputPdf.addPage([
                        pageWidth,
                        pageHeight
                    ]);

                    page.drawImage(image, {
                        x: 0,
                        y: 0,
                        width: pageWidth,
                        height: pageHeight
                    });

                    canvas.width = 1;
                    canvas.height = 1;
                }

                const pdfBytes = await outputPdf.save();

                const blob = new Blob([pdfBytes], {
                    type: "application/pdf"
                });

                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");

                link.href = url;
                link.download =
                    file.name.replace(/\.docx$/i, "") + ".pdf";

                document.body.appendChild(link);
                link.click();
                link.remove();

                setTimeout(() => URL.revokeObjectURL(url), 1000);
            } finally {
                host.remove();
            }
        }
    });
})();
