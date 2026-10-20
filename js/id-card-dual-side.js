(function () {
    "use strict";

    const app = window.PDFConverter;

    if (!app) {
        console.error("PDF Converter registry is not loaded.");
        return;
    }

    const CONFIG = {
        pageWidth: 297,
        pageHeight: 210,

        margin: 8,
        gap: 6,

        cardWidth: 100,
        cardHeight: 63,

        maxImageDimension: 2400,
        imageQuality: 0.95
    };

    function getJsPDF() {
        if (window.jspdf && window.jspdf.jsPDF) {
            return window.jspdf.jsPDF;
        }

        if (window.jsPDF) {
            return window.jsPDF;
        }

        throw new Error("jsPDF library is not loaded.");
    }

    function loadImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = function () {
                const image = new Image();

                image.onload = function () {
                    resolve(image);
                };

                image.onerror = function () {
                    reject(new Error(
                        "Could not open image: " + file.name
                    ));
                };

                image.src = reader.result;
            };

            reader.onerror = function () {
                reject(new Error(
                    "Could not read image: " + file.name
                ));
            };

            reader.readAsDataURL(file);
        });
    }

    function resizeImage(image) {
        const canvas = document.createElement("canvas");

        let width = image.naturalWidth || image.width;
        let height = image.naturalHeight || image.height;

        const longestSide = Math.max(width, height);

        if (longestSide > CONFIG.maxImageDimension) {
            const scale = CONFIG.maxImageDimension / longestSide;

            width = Math.round(width * scale);
            height = Math.round(height * scale);
        }

        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext("2d");

        if (!context) {
            throw new Error("Could not process the selected image.");
        }

        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);

        return canvas.toDataURL(
            "image/jpeg",
            CONFIG.imageQuality
        );
    }

    function drawCard(pdf, imageData, x, y, boxWidth, boxHeight) {
        const imageProperties = pdf.getImageProperties(imageData);

        const imageWidth = imageProperties.width;
        const imageHeight = imageProperties.height;

        // Fit the complete image inside the box without cropping.
        const scale = Math.min(
            boxWidth / imageWidth,
            boxHeight / imageHeight
        );

        const width = imageWidth * scale;
        const height = imageHeight * scale;

        // Center the image within its equal-sized card area.
        const imageX = x + (boxWidth - width) / 2;
        const imageY = y + (boxHeight - height) / 2;

        pdf.addImage(
            imageData,
            "JPEG",
            imageX,
            imageY,
            width,
            height,
            undefined,
            "FAST"
        );
    }

    async function process(files) {
        if (!files || files.length !== 2) {
            throw new Error(
                "Please select exactly 2 images: the front first and the back second."
            );
        }

        const allowedTypes = [
            "image/jpeg",
            "image/png",
            "image/webp",
            "image/bmp"
        ];

        for (const file of files) {
            if (!allowedTypes.includes(file.type)) {
                throw new Error(
                    "Unsupported image format: " + file.name +
                    ". Please use JPG, PNG, WEBP, or BMP images."
                );
            }
        }

        const jsPDF = getJsPDF();

        // Explicitly create a FULL A4 landscape page.
        const pdf = new jsPDF({
            orientation: "landscape",
            unit: "mm",
            format: [297, 210],
            compress: true
        });

        // Keep the page dimensions fixed at A4 landscape.
        const pageWidth = 297;
        const pageHeight = 210;

        const margin = CONFIG.margin;
        const gap = CONFIG.gap;

        const availableWidth = pageWidth - margin * 2 - gap;
        const availableHeight = pageHeight - margin * 2;

        // Preserve the card aspect ratio and keep both cards
        // the same size while fitting them on the A4 page.
        const cardWidth = Math.min(
            CONFIG.cardWidth,
            availableWidth / 2
        );

        const cardHeight = Math.min(
            CONFIG.cardHeight,
            availableHeight,
            cardWidth * (CONFIG.cardHeight / CONFIG.cardWidth)
        );

        const totalWidth = cardWidth * 2 + gap;

        const startX = (pageWidth - totalWidth) / 2;
        const startY = margin;

        // Load images in the selected order:
        // first image = front, second image = back.
        const frontImage = await loadImage(files[0]);
        const backImage = await loadImage(files[1]);

        const frontData = resizeImage(frontImage);
        const backData = resizeImage(backImage);

        // Front on the left, back on the right.
        // Both images use the same card dimensions.
        drawCard(
            pdf,
            frontData,
            startX,
            startY,
            cardWidth,
            cardHeight
        );

        drawCard(
            pdf,
            backData,
            startX + cardWidth + gap,
            startY,
            cardWidth,
            cardHeight
        );

        pdf.save("id-card-dual-side.pdf");
    }

    app.registerTool({
        id: "id-card-dual-side",
        name: "ID Card Dual Side",
        description: "Place the front and back of an ID card side by side on a full A4 landscape PDF.",
        accept: ".jpg,.jpeg,.png,.webp,.bmp",
        multiple: true,
        process: process
    });

})();