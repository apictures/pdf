
(function () {
    "use strict";

    const app = window.PDFConverter;

    if (!app) {
        console.error("PDF Converter registry is not loaded.");
        return;
    }

    const SUPPORTED_TYPES = [
        "image/jpeg",
        "image/png",
        "image/webp",
        "image/bmp"
    ];

    const CONFIG = {
        margin: 10,
        maxImageDimension: 2400,
        quality: 0.92
    };

    function validateFiles(files) {
        if (!files || !files.length) {
            throw new Error("Please select document images to scan.");
        }

        const invalid = Array.from(files).filter(file =>
            !SUPPORTED_TYPES.includes(file.type)
        );

        if (invalid.length) {
            throw new Error(
                "Unsupported file type: " +
                invalid.map(file => file.name).join(", ") +
                ". Please use JPG, PNG, WEBP, or BMP images."
            );
        }
    }

    function loadImage(file) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const image = new Image();

            image.onload = () => {
                URL.revokeObjectURL(url);
                resolve(image);
            };

            image.onerror = () => {
                URL.revokeObjectURL(url);
                reject(
                    new Error("Could not read image: " + file.name)
                );
            };

            image.src = url;
        });
    }

    function enhanceImage(image, options = {}) {
        const maxDimension = CONFIG.maxImageDimension;

        const scale = Math.min(
            1,
            maxDimension / Math.max(image.width, image.height)
        );

        const canvas = document.createElement("canvas");

        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));

        const context = canvas.getContext("2d", {
            willReadFrequently: true
        });

        if (!context) {
            throw new Error("Could not initialize image processing.");
        }

        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, canvas.width, canvas.height);

        context.drawImage(
            image,
            0,
            0,
            canvas.width,
            canvas.height
        );

        const mode = options.mode || "color";

        if (mode === "color") {
            return {
                data: canvas.toDataURL("image/jpeg", CONFIG.quality),
                width: canvas.width,
                height: canvas.height
            };
        }

        const imageData = context.getImageData(
            0,
            0,
            canvas.width,
            canvas.height
        );

        const pixels = imageData.data;

        for (let i = 0; i < pixels.length; i += 4) {
            const r = pixels[i];
            const g = pixels[i + 1];
            const b = pixels[i + 2];

            const gray = 0.299 * r + 0.587 * g + 0.114 * b;

            if (mode === "grayscale") {
                pixels[i] = gray;
                pixels[i + 1] = gray;
                pixels[i + 2] = gray;
            } else if (mode === "document") {
                // Mild contrast enhancement while retaining
                // more detail than a harsh black-and-white filter.
                const contrast = 1.22;
                const enhanced = Math.max(
                    0,
                    Math.min(255, (gray - 128) * contrast + 128)
                );

                pixels[i] = enhanced;
                pixels[i + 1] = enhanced;
                pixels[i + 2] = enhanced;
            }

            pixels[i + 3] = 255;
        }

        context.putImageData(imageData, 0, 0);

        return {
            data: canvas.toDataURL("image/jpeg", CONFIG.quality),
            width: canvas.width,
            height: canvas.height
        };
    }

    function addImageToPDF(pdf, image, firstPage, orientation) {
        if (!firstPage) {
            pdf.addPage("a4", orientation);
        }

        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();

        const availableWidth = pageWidth - CONFIG.margin * 2;
        const availableHeight = pageHeight - CONFIG.margin * 2;

        const ratio = Math.min(
            availableWidth / image.width,
            availableHeight / image.height
        );

        const width = image.width * ratio;
        const height = image.height * ratio;

        const x = (pageWidth - width) / 2;
        const y = (pageHeight - height) / 2;

        pdf.addImage(
            image.data,
            "JPEG",
            x,
            y,
            width,
            height,
            undefined,
            "FAST"
        );
    }

    app.registerTool({
        name: "Doc Scanner",
        accept: ".jpg,.jpeg,.png,.webp,.bmp",
        multiple: true,
        description: "Scan document images, enhance readability, and combine them into a PDF.",
        action: "Scan to PDF",

        async process(files, options = {}) {
            validateFiles(files);

            if (!window.jspdf || !window.jspdf.jsPDF) {
                throw new Error("The PDF generation library failed to load.");
            }

            const { jsPDF } = window.jspdf;

            const mode = [
                "color",
                "grayscale",
                "document"
            ].includes(options.mode)
                ? options.mode
                : "color";

            const orientation = options.orientation === "portrait"
                ? "portrait"
                : "portrait";

            const pdf = new jsPDF({
                orientation,
                unit: "mm",
                format: "a4",
                compress: true
            });

            let firstPage = true;

            for (const file of Array.from(files)) {
                const image = await loadImage(file);
                const processed = enhanceImage(image, { mode });

                addImageToPDF(
                    pdf,
                    processed,
                    firstPage,
                    orientation
                );

                firstPage = false;
            }

            const outputName = options.outputName
                ? String(options.outputName)
                    .replace(/\.pdf$/i, "")
                    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "_")
                    .trim()
                : "scanned-document";

            return { blob: pdf.output("blob"), filename: `${outputName || "scanned-document"}.pdf` };
        }
    });
})();
