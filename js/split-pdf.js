
window.splitPDF = async function (file, pageRanges) {
    if (!file) {
        throw new Error("Please select a PDF file.");
    }

    if (!window.PDFLib) {
        throw new Error("The PDF library has not loaded.");
    }

    const { PDFDocument } = window.PDFLib;
    const sourceBytes = await file.arrayBuffer();
    const sourcePdf = await PDFDocument.load(sourceBytes);
    const totalPages = sourcePdf.getPageCount();

    // Accept ranges such as "1-3, 5, 8-9"
    const selectedPages = new Set();

    for (const part of pageRanges.split(",")) {
        const range = part.trim();

        if (!range) continue;

        const match = range.match(/^(\d+)(?:\s*-\s*(\d+))?$/);

        if (!match) {
            throw new Error(
                'Enter pages like "1-3, 5, 8-9".'
            );
        }

        const start = Number(match[1]);
        const end = Number(match[2] || match[1]);

        if (
            start < 1 ||
            end < start ||
            end > totalPages
        ) {
            throw new Error(
                `Page numbers must be between 1 and ${totalPages}.`
            );
        }

        for (let page = start; page <= end; page++) {
            selectedPages.add(page - 1);
        }
    }

    if (selectedPages.size === 0) {
        throw new Error("Please enter the pages you want to extract.");
    }

    const outputPdf = await PDFDocument.create();

    const copiedPages = await outputPdf.copyPages(
        sourcePdf,
        [...selectedPages].sort((a, b) => a - b)
    );

    copiedPages.forEach(page => outputPdf.addPage(page));

    const outputBytes = await outputPdf.save();
    const blob = new Blob([outputBytes], {
        type: "application/pdf"
    });

    return { blob, filename: "split.pdf" };
};
