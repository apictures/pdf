
(function () {
    "use strict";

    const app = window.PDFConverter;

    if (!app) {
        console.error("PDF Converter registry is not loaded.");
        return;
    }

    app.registerTool({
        name: "PowerPoint to PDF",
        accept: ".pptx",
        multiple: false,
        description: "Convert PowerPoint presentations into PDF files.",
        action: "Convert to PDF",

        async process(files) {
            if (!files || !files.length) {
                throw new Error("Please select a PowerPoint file.");
            }

            const file = files[0];

            if (!file.name.toLowerCase().endsWith(".pptx")) {
                throw new Error(
                    "Please select a .pptx file. Legacy .ppt files are not supported."
                );
            }

            if (!window.jspdf || !window.jspdf.jsPDF) {
                throw new Error("The PDF generation library failed to load.");
            }

            let renderer;

            try {
                const module = await import(
                    "https://esm.sh/pptx-browser"
                );

                const PptxRenderer = module.PptxRenderer;

                if (!PptxRenderer) {
                    throw new Error(
                        "The PowerPoint rendering library is unavailable."
                    );
                }

                renderer = new PptxRenderer();

                const buffer = await file.arrayBuffer();

                await renderer.load(buffer);

                if (!renderer.slideCount) {
                    throw new Error(
                        "No slides were found in this presentation."
                    );
                }

                const { jsPDF } = window.jspdf;
                let pdf = null;

                for (let i = 0; i < renderer.slideCount; i++) {
                    const canvas = document.createElement("canvas");

                    await renderer.renderSlide(i, canvas, 1600);

                    if (!canvas.width || !canvas.height) {
                        throw new Error(
                            `Could not render slide ${i + 1}.`
                        );
                    }

                    const widthPt = canvas.width * 0.75;
                    const heightPt = canvas.height * 0.75;

                    if (!pdf) {
                        pdf = new jsPDF({
                            orientation:
                                widthPt >= heightPt
                                    ? "landscape"
                                    : "portrait",
                            unit: "pt",
                            format: [widthPt, heightPt],
                            compress: true
                        });
                    } else {
                        pdf.addPage(
                            [widthPt, heightPt],
                            widthPt >= heightPt
                                ? "landscape"
                                : "portrait"
                        );
                    }

                    const image = canvas.toDataURL(
                        "image/jpeg",
                        0.92
                    );

                    pdf.addImage(
                        image,
                        "JPEG",
                        0,
                        0,
                        widthPt,
                        heightPt,
                        undefined,
                        "FAST"
                    );

                    canvas.width = 1;
                    canvas.height = 1;
                }

                if (!pdf) {
                    throw new Error("The PDF could not be created.");
                }

                const outputName = file.name.replace(
                    /\.pptx$/i,
                    ".pdf"
                );

                return { blob: pdf.output("blob"), filename: outputName };

            } catch (error) {
                console.error("PowerPoint to PDF error:", error);

                throw new Error(
                    "Conversion failed. Check your internet connection " +
                    "and try a simpler .pptx presentation. " +
                    (error.message || "")
                );

            } finally {
                if (renderer) {
                    renderer.destroy();
                }
            }
        }
    });
})();
