(function () {
    "use strict";

    const app = window.PDFConverter;

    if (!app) {
        console.error("PDF Converter registry is not loaded.");
        return;
    }

    function getCellText(cell) {
        const value = cell.value;

        if (value === null || value === undefined) {
            return "";
        }

        if (value instanceof Date) {
            return value.toLocaleDateString();
        }

        if (typeof value === "object") {
            if (value.richText) {
                return value.richText.map(part => part.text || "").join("");
            }

            if (value.text !== undefined) {
                return String(value.text);
            }

            if (value.result !== undefined) {
                return String(value.result);
            }

            if (value.hyperlink) {
                return value.text || value.hyperlink;
            }

            return "";
        }

        return String(value);
    }

    function getColor(color, fallback) {
        if (!color) return fallback;

        let hex = color.argb || color.rgb;

        // Theme and indexed colors need a theme palette to resolve
        // exactly. Use a safe fallback for those color types.
        if (!hex || typeof hex !== "string") {
            return fallback;
        }

        hex = hex.replace(/^#/, "");

        if (hex.length === 8) {
            hex = hex.slice(2);
        }

        if (!/^[0-9a-f]{6}$/i.test(hex)) {
            return fallback;
        }

        return [
            parseInt(hex.slice(0, 2), 16),
            parseInt(hex.slice(2, 4), 16),
            parseInt(hex.slice(4, 6), 16)
        ];
    }

    function excelColumnNumber(letters) {
        let result = 0;

        for (const letter of letters.toUpperCase()) {
            result = result * 26 + letter.charCodeAt(0) - 64;
        }

        return result;
    }

    function parseRange(range) {
        const parts = range.split(":");

        function parseAddress(address) {
            const match = address.match(/^([A-Z]+)(\d+)$/i);

            if (!match) return null;

            return {
                col: excelColumnNumber(match[1]),
                row: Number(match[2])
            };
        }

        const start = parseAddress(parts[0]);
        const end = parseAddress(parts[1] || parts[0]);

        if (!start || !end) return null;

        return {
            startRow: Math.min(start.row, end.row),
            endRow: Math.max(start.row, end.row),
            startCol: Math.min(start.col, end.col),
            endCol: Math.max(start.col, end.col)
        };
    }

    function borderStyle(border) {
        if (!border || !border.style) {
            return null;
        }

        const widths = {
            hair: 0.15,
            thin: 0.2,
            dotted: 0.25,
            dashed: 0.25,
            dashDot: 0.25,
            dashDotDot: 0.25,
            medium: 0.45,
            mediumDashed: 0.45,
            mediumDashDot: 0.45,
            mediumDashDotDot: 0.45,
            thick: 0.7,
            double: 0.6,
            slantDashDot: 0.35
        };

        return {
            width: widths[border.style] || 0.2,
            color: getColor(border.color, [130, 130, 130]),
            style: border.style
        };
    }

    function drawBorder(pdf, x1, y1, x2, y2, border) {
        const line = borderStyle(border);

        if (!line) return;

        pdf.setDrawColor(...line.color);
        pdf.setLineWidth(line.width);

        if (
            line.style === "dotted" ||
            line.style === "dashDot" ||
            line.style === "dashDotDot"
        ) {
            pdf.setLineDashPattern([0.5, 0.8], 0);
        } else if (
            line.style.toLowerCase().includes("dashed") ||
            line.style === "dashed"
        ) {
            pdf.setLineDashPattern([1.5, 1], 0);
        } else {
            pdf.setLineDashPattern([], 0);
        }

        pdf.line(x1, y1, x2, y2);

        if (line.style === "double") {
            const offset = 0.65;

            if (x1 === x2) {
                pdf.line(x1 + offset, y1, x2 + offset, y2);
            } else {
                pdf.line(x1, y1 + offset, x2, y2 + offset);
            }
        }

        pdf.setLineDashPattern([], 0);
    }

    function getFillColor(cell) {
        const fill = cell.fill;

        if (!fill || fill.type !== "pattern") {
            return null;
        }

        if (fill.pattern !== "solid") {
            return null;
        }

        return getColor(
            fill.fgColor,
            getColor(fill.bgColor, null)
        );
    }

    function drawCellText(pdf, cell, text, x, y, width, height) {
        if (!text) return;

        const font = cell.font || {};
        const alignment = cell.alignment || {};

        const fontSize = Math.max(
            5,
            Math.min(Number(font.size) || 10, 24)
        );

        let fontStyle = "normal";

        if (font.bold && font.italic) {
            fontStyle = "bolditalic";
        } else if (font.bold) {
            fontStyle = "bold";
        } else if (font.italic) {
            fontStyle = "italic";
        }

        pdf.setFont("helvetica", fontStyle);
        pdf.setFontSize(fontSize);

        const fontColor = getColor(font.color, [35, 35, 35]);
        pdf.setTextColor(...fontColor);

        const padding = 1.4;
        const availableWidth = Math.max(1, width - padding * 2);

        let lines = pdf.splitTextToSize(
            text,
            availableWidth
        );

        if (!Array.isArray(lines)) {
            lines = [String(lines)];
        }

        // Prevent a single cell from overflowing its row.
        const lineHeight = fontSize * 0.3528 * 1.2;
        const maxLines = Math.max(
            1,
            Math.floor((height - padding * 2) / lineHeight)
        );

        if (lines.length > maxLines) {
            lines = lines.slice(0, maxLines);

            const last = lines.length - 1;

            while (
                lines[last].length > 1 &&
                pdf.getTextWidth(lines[last] + "...") > availableWidth
            ) {
                lines[last] = lines[last].slice(0, -1);
            }

            lines[last] += "...";
        }

        let textX = x + padding;

        if (alignment.horizontal === "center") {
            textX = x + width / 2;
        } else if (
            alignment.horizontal === "right" ||
            alignment.horizontal === "end"
        ) {
            textX = x + width - padding;
        }

        const textWidth = Math.max(1, ...lines.map(line =>
            pdf.getTextWidth(line)
        ));

        if (alignment.horizontal === "center") {
            textX = x + width / 2;
        } else if (
            alignment.horizontal === "right" ||
            alignment.horizontal === "end"
        ) {
            textX = x + width - padding;
        }

        let textY = y + padding + fontSize * 0.3528;

        if (alignment.vertical === "middle") {
            const totalTextHeight = lines.length * lineHeight;
            textY = y + (height - totalTextHeight) / 2 + lineHeight * 0.8;
        } else if (alignment.vertical === "bottom") {
            textY = y + height - padding - (lines.length - 1) * lineHeight;
        }

        pdf.text(lines, textX, textY, {
            align:
                alignment.horizontal === "center"
                    ? "center"
                    : (
                        alignment.horizontal === "right" ||
                        alignment.horizontal === "end"
                    )
                        ? "right"
                        : "left",
            baseline: "alphabetic"
        });

        if (font.underline) {
            const underlineY = textY + 0.7;
            pdf.setDrawColor(...fontColor);
            pdf.setLineWidth(0.15);
            pdf.line(
                textX,
                underlineY,
                textX + Math.min(textWidth, availableWidth),
                underlineY
            );
        }
    }

    function renderWorksheet(pdf, worksheet, sheetName, isFirstSheet) {
        const pageWidth = pdf.internal.pageSize.getWidth();
        const pageHeight = pdf.internal.pageSize.getHeight();

        const margin = 8;
        const topMargin = 14;
        const availableWidth = pageWidth - margin * 2;
        const availableHeight = pageHeight - topMargin - margin;

        const lastRow = Math.max(worksheet.rowCount || 0, 1);
        const lastCol = Math.max(worksheet.columnCount || 0, 1);

        // Excel column widths are approximately character units.
        const columnWidths = [];

        for (let col = 1; col <= lastCol; col++) {
            const column = worksheet.getColumn(col);
            const chars = Number(column.width) || 10;

            columnWidths.push(
                Math.max(8, Math.min(chars * 1.85 + 2, 65))
            );
        }

        // Fit all columns to the page width when necessary.
        const totalWidth = columnWidths.reduce(
            (sum, width) => sum + width,
            0
        );

        const scale = totalWidth > availableWidth
            ? availableWidth / totalWidth
            : 1;

        const widths = columnWidths.map(width => width * scale);

        const rowHeights = [];

        for (let row = 1; row <= lastRow; row++) {
            const excelRow = worksheet.getRow(row);
            const points = Number(excelRow.height);

            // Convert Excel row height in points to PDF millimetres.
            rowHeights.push(
                Math.max(
                    5,
                    Math.min(
                        points > 0 ? points * 0.3528 : 7,
                        25
                    )
                )
            );
        }

        // Map merged cells so covered cells are not drawn separately.
        const merges = [];

        for (const range of worksheet.model.merges || []) {
            const parsed = parseRange(range);

            if (parsed) {
                merges.push(parsed);
            }
        }

        function mergeAt(row, col) {
            return merges.find(merge =>
                row >= merge.startRow &&
                row <= merge.endRow &&
                col >= merge.startCol &&
                col <= merge.endCol
            );
        }

        function isMergeChild(row, col, merge) {
            return merge &&
                (row !== merge.startRow || col !== merge.startCol);
        }

        let y = topMargin;

        pdf.setFont("helvetica", "bold");
        pdf.setFontSize(13);
        pdf.setTextColor(35, 40, 55);
        pdf.text(String(sheetName).slice(0, 100), margin, 9);

        for (let rowNumber = 1; rowNumber <= lastRow; rowNumber++) {
            const row = worksheet.getRow(rowNumber);
            const rowHeight = rowHeights[rowNumber - 1] || 7;

            if (y + rowHeight > pageHeight - margin) {
                pdf.addPage();
                y = topMargin;

                pdf.setFont("helvetica", "bold");
                pdf.setFontSize(11);
                pdf.setTextColor(35, 40, 55);
                pdf.text(
                    String(sheetName).slice(0, 100) + " (continued)",
                    margin,
                    9
                );
            }

            let x = margin;

            for (let colNumber = 1; colNumber <= lastCol; colNumber++) {
                const cell = row.getCell(colNumber);
                const merge = mergeAt(rowNumber, colNumber);
                const child = isMergeChild(
                    rowNumber,
                    colNumber,
                    merge
                );

                const cellWidth = widths[colNumber - 1] || 15;

                if (!child) {
                    let mergedWidth = cellWidth;
                    let mergedHeight = rowHeight;

                    if (merge) {
                        for (
                            let col = merge.startCol + 1;
                            col <= merge.endCol;
                            col++
                        ) {
                            mergedWidth += widths[col - 1] || 0;
                        }

                        for (
                            let r = merge.startRow + 1;
                            r <= merge.endRow;
                            r++
                        ) {
                            mergedHeight += rowHeights[r - 1] || 0;
                        }
                    }

                    const fill = getFillColor(cell);

                    if (fill) {
                        pdf.setFillColor(...fill);
                        pdf.rect(
                            x,
                            y,
                            mergedWidth,
                            mergedHeight,
                            "F"
                        );
                    }

                    drawCellText(
                        pdf,
                        cell,
                        getCellText(cell),
                        x,
                        y,
                        mergedWidth,
                        mergedHeight
                    );

                    const borders = cell.border || {};

                    drawBorder(
                        pdf,
                        x,
                        y,
                        x + mergedWidth,
                        y,
                        borders.top
                    );

                    drawBorder(
                        pdf,
                        x,
                        y + mergedHeight,
                        x + mergedWidth,
                        y + mergedHeight,
                        borders.bottom
                    );

                    drawBorder(
                        pdf,
                        x,
                        y,
                        x,
                        y + mergedHeight,
                        borders.left
                    );

                    drawBorder(
                        pdf,
                        x + mergedWidth,
                        y,
                        x + mergedWidth,
                        y + mergedHeight,
                        borders.right
                    );
                }

                x += cellWidth;
            }

            y += rowHeight;
        }
    }

    app.registerTool({
        name: "Excel to PDF",
        accept: ".xlsx,.xls",
        multiple: false,
        description: "Convert Excel spreadsheets into PDF documents.",
        action: "Convert to PDF",

        async process(files) {
            if (!files || !files.length) {
                throw new Error("Please select an Excel file.");
            }

            if (!window.jspdf || !window.jspdf.jsPDF) {
                throw new Error("The PDF generation library failed to load.");
            }

            const file = files[0];

            if (!/\.(xlsx|xls)$/i.test(file.name)) {
                throw new Error("Please select an .xlsx or .xls file.");
            }

            const buffer = await file.arrayBuffer();
            const { jsPDF } = window.jspdf;

            const isXlsx = /\.xlsx$/i.test(file.name);

            let sheets = [];

            if (isXlsx && window.ExcelJS) {
                const workbook = new window.ExcelJS.Workbook();

                await workbook.xlsx.load(buffer);

                sheets = workbook.worksheets.map(worksheet => ({
                    name: worksheet.name,
                    worksheet
                }));
            } else {
                // Legacy .xls fallback: SheetJS can read the cell values,
                // but its standard browser build may not expose original
                // Excel cell formatting.
                if (!window.XLSX) {
                    throw new Error("The Excel library failed to load.");
                }

                const workbook = window.XLSX.read(buffer, {
                    type: "array",
                    cellDates: true
                });

                sheets = workbook.SheetNames.map(sheetName => {
                    const source = workbook.Sheets[sheetName];
                    const rows = window.XLSX.utils.sheet_to_json(source, {
                        header: 1,
                        defval: "",
                        raw: false
                    });

                    const fallback = {
                        name: sheetName,
                        rowCount: rows.length,
                        columnCount: Math.max(
                            1,
                            ...rows.map(row => row.length)
                        ),
                        model: { merges: [] },
                        getColumn(col) {
                            return {
                                width: source["!cols"]?.[col - 1]?.wch || 12
                            };
                        },
                        getRow(rowNumber) {
                            const values = rows[rowNumber - 1] || [];

                            return {
                                height: source["!rows"]?.[rowNumber - 1]?.hpt,
                                getCell(colNumber) {
                                    const address = window.XLSX.utils.encode_cell({
                                        r: rowNumber - 1,
                                        c: colNumber - 1
                                    });

                                    const sourceCell = source[address];

                                    return {
                                        value: values[colNumber - 1] ?? "",
                                        font: {},
                                        fill: {},
                                        border: {},
                                        alignment: {},
                                        sourceCell
                                    };
                                }
                            };
                        }
                    };

                    return {
                        name: sheetName,
                        worksheet: fallback
                    };
                });
            }

            if (!sheets.length) {
                throw new Error("No spreadsheet data was found.");
            }

            const pdf = new jsPDF({
                orientation: "landscape",
                unit: "mm",
                format: "a4",
                compress: true
            });

            let rendered = false;

            for (const sheet of sheets) {
                if (rendered) {
                    pdf.addPage("a4", "landscape");
                }

                renderWorksheet(
                    pdf,
                    sheet.worksheet,
                    sheet.name,
                    !rendered
                );

                rendered = true;
            }

            if (!rendered) {
                throw new Error("No spreadsheet data was found.");
            }

            const safeName = file.name.replace(/\.(xlsx|xls|csv)$/i, "");
            return { blob: pdf.output("blob"), filename: `${safeName}.pdf` };
        }
    });
})();