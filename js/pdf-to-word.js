
(function () {
    "use strict";

    const app = window.PDFConverter;

    if (!app) {
        console.error("PDF Converter registry is not loaded.");
        return;
    }

    app.registerTool({
        name: "PDF to Word",
        accept: ".pdf",
        multiple: false,
        description: "Convert PDF text into an editable Word document.",
        action: "Convert to Word",

        async process(files) {
            if (!files || !files.length) {
                throw new Error("Please select a PDF file.");
            }

            if (!window.pdfjsLib) {
                throw new Error("PDF.js failed to load.");
            }

            if (!window.JSZip) {
                throw new Error("JSZip failed to load.");
            }

            const file = files[0];

            if (!file.name.toLowerCase().endsWith(".pdf")) {
                throw new Error("Please select a PDF file.");
            }

            const buffer = await file.arrayBuffer();

            const pdf = await window.pdfjsLib.getDocument({
                data: new Uint8Array(buffer)
            }).promise;

            const pages = [];

            for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
                const page = await pdf.getPage(pageNumber);
                const content = await page.getTextContent();

                const items = content.items
                    .filter(item => item.str && item.str.trim())
                    .map(item => ({
                        text: item.str,
                        x: item.transform ? item.transform[4] : 0,
                        y: item.transform ? item.transform[5] : 0,
                        hasEOL: Boolean(item.hasEOL)
                    }))
                    .sort((a, b) => {
                        if (Math.abs(a.y - b.y) > 3) {
                            return b.y - a.y;
                        }
                        return a.x - b.x;
                    });

                const lines = [];

                for (const item of items) {
                    let line = lines[lines.length - 1];

                    if (!line || Math.abs(line.y - item.y) > 3) {
                        line = {
                            y: item.y,
                            items: []
                        };
                        lines.push(line);
                    }

                    line.items.push(item);
                }

                const paragraphs = lines.map(line => {
                    line.items.sort((a, b) => a.x - b.x);

                    let text = "";

                    for (const item of line.items) {
                        if (text && !text.endsWith(" ") && !item.text.startsWith(" ")) {
                            text += " ";
                        }

                        text += item.text;
                    }

                    return text.trim();
                }).filter(Boolean);

                pages.push(paragraphs);
            }

            const escapeXml = value => String(value)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&apos;");

            const documentBody = [];

            pages.forEach((paragraphs, pageIndex) => {
                if (pageIndex > 0) {
                    documentBody.push(
                        '<w:p><w:r><w:br w:type="page"/></w:r></w:p>'
                    );
                }

                for (const paragraph of paragraphs) {
                    documentBody.push(
                        `<w:p><w:r><w:t xml:space="preserve">${escapeXml(paragraph)}</w:t></w:r></w:p>`
                    );
                }
            });

            const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:body>
        ${documentBody.join("\n")}
        <w:sectPr>
            <w:pgSz w:w="12240" w:h="15840"/>
            <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/>
        </w:sectPr>
    </w:body>
</w:document>`;

            const zip = new window.JSZip();

            zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
    <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
    <Default Extension="xml" ContentType="application/xml"/>
    <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`);

            zip.folder("_rels").file(".rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
    <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`);

            zip.folder("word").file("document.xml", documentXml);

            const docxBlob = await zip.generateAsync({
                type: "blob",
                mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            });

            return { blob: docxBlob, filename: file.name.replace(/\.pdf$/i, "") + ".docx" };
        }
    });
})();
