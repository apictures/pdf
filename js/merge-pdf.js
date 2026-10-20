
async function mergePDFs(files) {
    if (!files || files.length < 2) {
        throw new Error("Please select at least two PDF files.");
    }

    if (!window.PDFLib) {
        throw new Error("PDF library failed to load. Please refresh the page.");
    }

    const { PDFDocument } = window.PDFLib;
    const mergedPdf = await PDFDocument.create();

    for (const file of files) {
        const fileBytes = await file.arrayBuffer();
        const pdf = await PDFDocument.load(fileBytes);

        const pages = await mergedPdf.copyPages(
            pdf,
            pdf.getPageIndices()
        );

        pages.forEach(page => mergedPdf.addPage(page));
    }

    const mergedBytes = await mergedPdf.save();
    const blob = new Blob([mergedBytes], {
        type: "application/pdf"
    });

    return { blob, filename: "merged.pdf" };
}
