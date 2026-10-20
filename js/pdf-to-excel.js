
(function () {
    "use strict";

    const app = window.PDFConverter;

    if (!app) {
        console.error("PDF Converter registry is not loaded.");
        return;
    }

    const CONFIG = {
        minLineTolerance: 2,
        maxLineTolerance: 5,
        gapMultiplier: 1.35,
        minCellGap: 10,
        columnTolerance: 9,
        minColumnSupport: 2,
        maxColumns: 60,
        maxCellTextLength: 32000
    };

    // ------------------------------------------------------------
    // Text extraction helpers
    // ------------------------------------------------------------

    function getFontSize(item) {
        const transform = item.transform || [];
        const size = Math.max(
            Math.abs(Number(transform[0]) || 0),
            Math.abs(Number(transform[3]) || 0)
        );

        return size || 10;
    }

    function normalizeText(value) {
        return String(value ?? "")
            .replace(/\u00a0/g, " ")
            .replace(/[\u200b-\u200d\ufeff]/g, "")
            .replace(/\s+/g, " ")
            .trim();
    }

    function extractItems(content) {
        return content.items
            .filter(item =>
                typeof item.str === "string" &&
                item.str.trim() &&
                Array.isArray(item.transform)
            )
            .map(item => {
                const x = Number(item.transform[4]);
                const y = Number(item.transform[5]);
                const fontSize = getFontSize(item);

                return {
                    text: normalizeText(item.str),
                    x,
                    y,
                    width: Math.max(0, Number(item.width) || 0),
                    fontSize,
                    endX: x + Math.max(
                        0,
                        Number(item.width) || 0
                    )
                };
            })
            .filter(item =>
                Number.isFinite(item.x) &&
                Number.isFinite(item.y) &&
                item.text
            );
    }

    // ------------------------------------------------------------
    // Step 1: Group text fragments into visual lines
    // ------------------------------------------------------------

    function groupIntoLines(items) {
        const sorted = [...items].sort((a, b) => {
            if (Math.abs(b.y - a.y) > 0.1) {
                return b.y - a.y;
            }

            return a.x - b.x;
        });

        const lines = [];

        for (const item of sorted) {
            let bestLine = null;
            let bestDistance = Infinity;

            for (const line of lines) {
                const tolerance = Math.min(
                    CONFIG.maxLineTolerance,
                    Math.max(
                        CONFIG.minLineTolerance,
                        Math.min(line.fontSize, item.fontSize) * 0.35
                    )
                );

                const distance = Math.abs(line.y - item.y);

                if (
                    distance <= tolerance &&
                    distance < bestDistance
                ) {
                    bestLine = line;
                    bestDistance = distance;
                }
            }

            if (!bestLine) {
                lines.push({
                    y: item.y,
                    fontSize: item.fontSize,
                    items: [item]
                });

                continue;
            }

            bestLine.items.push(item);

            // Keep a stable baseline rather than allowing
            // successively added fragments to drift too far.
            bestLine.y = bestLine.items.reduce(
                (sum, current) => sum + current.y,
                0
            ) / bestLine.items.length;

            bestLine.fontSize = bestLine.items.reduce(
                (sum, current) => sum + current.fontSize,
                0
            ) / bestLine.items.length;
        }

        for (const line of lines) {
            line.items.sort((a, b) => a.x - b.x);
        }

        return lines.sort((a, b) => b.y - a.y);
    }

    // ------------------------------------------------------------
    // Step 2: Detect likely cell boundaries using horizontal gaps
    // ------------------------------------------------------------

    function splitLineIntoCells(line) {
        const cells = [];
        let current = null;

        for (const item of line.items) {
            if (!current) {
                current = {
                    text: item.text,
                    x: item.x,
                    endX: item.endX,
                    fontSize: item.fontSize
                };

                continue;
            }

            const gap = item.x - current.endX;

            const referenceSize = Math.min(
                current.fontSize,
                item.fontSize
            );

            const threshold = Math.max(
                CONFIG.minCellGap,
                referenceSize * CONFIG.gapMultiplier
            );

            if (gap > threshold) {
                cells.push(current);

                current = {
                    text: item.text,
                    x: item.x,
                    endX: item.endX,
                    fontSize: item.fontSize
                };
            } else {
                // Adjacent PDF text fragments often belong
                // to the same cell.
                const separator = gap > 1 ? " " : "";

                current.text += separator + item.text;
                current.endX = Math.max(
                    current.endX,
                    item.endX
                );

                current.fontSize = Math.max(
                    current.fontSize,
                    item.fontSize
                );
            }
        }

        if (current) {
            cells.push(current);
        }

        return cells.map(cell => ({
            ...cell,
            text: normalizeText(cell.text)
        }));
    }

    // ------------------------------------------------------------
    // Step 3: Learn recurring column positions
    // ------------------------------------------------------------

    function clusterColumnPositions(lines) {
        const observations = [];

        for (let rowIndex = 0; rowIndex < lines.length; rowIndex++) {
            const cells = splitLineIntoCells(lines[rowIndex]);

            for (const cell of cells) {
                observations.push({
                    x: cell.x,
                    rowIndex
                });
            }
        }

        observations.sort((a, b) => a.x - b.x);

        const clusters = [];

        for (const observation of observations) {
            let best = null;
            let bestDistance = Infinity;

            for (const cluster of clusters) {
                const distance = Math.abs(
                    cluster.center - observation.x
                );

                if (
                    distance <= CONFIG.columnTolerance &&
                    distance < bestDistance
                ) {
                    best = cluster;
                    bestDistance = distance;
                }
            }

            if (!best) {
                clusters.push({
                    center: observation.x,
                    positions: [observation.x],
                    rows: new Set([observation.rowIndex])
                });

                continue;
            }

            best.positions.push(observation.x);
            best.rows.add(observation.rowIndex);

            best.center = best.positions.reduce(
                (sum, value) => sum + value,
                0
            ) / best.positions.length;
        }

        return clusters.sort((a, b) => a.center - b.center);
    }

    function detectColumns(lines) {
        const clusters = clusterColumnPositions(lines);

        if (!clusters.length) {
            return [];
        }

        const minimumSupport = Math.min(
            CONFIG.minColumnSupport,
            Math.max(1, Math.ceil(lines.length * 0.15))
        );

        let anchors = clusters
            .filter(cluster =>
                cluster.rows.size >= minimumSupport
            )
            .map(cluster => cluster.center);

        // Short tables may not repeat column positions enough
        // for a reliable frequency-based detection.
        if (!anchors.length) {
            anchors = clusters.map(cluster => cluster.center);
        }

        // Extremely irregular layouts are better handled by
        // gap-based splitting than by dozens of global anchors.
        if (anchors.length > CONFIG.maxColumns) {
            return [];
        }

        return anchors;
    }

    function nearestColumn(x, anchors) {
        let index = 0;
        let distance = Infinity;

        anchors.forEach((anchor, candidate) => {
            const difference = Math.abs(anchor - x);

            if (difference < distance) {
                distance = difference;
                index = candidate;
            }
        });

        return {
            index,
            distance
        };
    }

    // ------------------------------------------------------------
    // Step 4: Reconstruct aligned spreadsheet rows
    // ------------------------------------------------------------

    function convertLinesToRows(lines) {
        const cellsByLine = lines.map(splitLineIntoCells);
        const anchors = detectColumns(lines);

        if (!anchors.length) {
            return cellsByLine.map(cells =>
                cells.map(cell => cell.text)
            );
        }

        return cellsByLine.map(cells => {
            const row = [];

            for (const cell of cells) {
                const match = nearestColumn(cell.x, anchors);

                // If a position is far from every known anchor,
                // create a new column instead of forcing the
                // value into an unrelated existing column.
                let column = match.index;

                if (
                    match.distance >
                    CONFIG.columnTolerance * 1.5
                ) {
                    column = anchors.findIndex(
                        anchor => anchor > cell.x
                    );

                    if (column === -1) {
                        column = anchors.length;
                    }
                }

                if (row[column]) {
                    row[column] += " " + cell.text;
                } else {
                    row[column] = cell.text;
                }
            }

            return row;
        });
    }

    // ------------------------------------------------------------
    // Step 5: Clean and normalize rows
    // ------------------------------------------------------------

    function cleanRows(rows) {
        return rows
            .map(row =>
                row.map(value =>
                    normalizeText(value).slice(
                        0,
                        CONFIG.maxCellTextLength
                    )
                )
            )
            .filter(row => row.some(Boolean));
    }

    function normalizeRowWidths(rows) {
        const columnCount = Math.max(
            1,
            ...rows.map(row => row.length)
        );

        return rows.map(row =>
            Array.from(
                { length: columnCount },
                (_, index) => row[index] ?? ""
            )
        );
    }

    // ------------------------------------------------------------
    // Step 6: Create a readable Excel worksheet
    // ------------------------------------------------------------

    function buildWorksheet(rows, XLSX) {
        const normalizedRows = normalizeRowWidths(rows);
        const worksheet = XLSX.utils.aoa_to_sheet(normalizedRows);

        const columnCount = normalizedRows[0]?.length || 1;

        worksheet["!cols"] = Array.from(
            { length: columnCount },
            (_, colIndex) => {
                const lengths = normalizedRows.map(row =>
                    String(row[colIndex] ?? "").length
                );

                const longest = Math.max(8, ...lengths);

                return {
                    wch: Math.min(longest + 2, 45)
                };
            }
        );

        worksheet["!rows"] = normalizedRows.map(row => {
            const longest = Math.max(
                1,
                ...row.map(value => String(value ?? "").length)
            );

            return {
                hpt: Math.min(
                    18 + Math.floor(longest / 70) * 10,
                    55
                )
            };
        });

        return worksheet;
    }

    // ------------------------------------------------------------
    // Step 7: Process a PDF page
    // ------------------------------------------------------------

    async function extractPageRows(pdf, pageNumber) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();

        const items = extractItems(content);

        if (!items.length) {
            return [];
        }

        const lines = groupIntoLines(items);
        const rows = convertLinesToRows(lines);

        return cleanRows(rows);
    }

    // ------------------------------------------------------------
    // Register PDF to Excel tool
    // ------------------------------------------------------------

    app.registerTool({
        name: "PDF to Excel",
        accept: ".pdf",
        multiple: false,
        description: "Extract PDF text and tables into Excel spreadsheets.",
        action: "Convert to Excel",

        async process(files) {
            if (!files || !files.length) {
                throw new Error("Please select a PDF file.");
            }

            if (!window.pdfjsLib) {
                throw new Error("PDF.js failed to load.");
            }

            if (!window.XLSX) {
                throw new Error("The Excel library failed to load.");
            }

            const file = files[0];

            if (!/\.pdf$/i.test(file.name)) {
                throw new Error("Please select a PDF file.");
            }

            const buffer = await file.arrayBuffer();

            const pdf = await window.pdfjsLib.getDocument({
                data: new Uint8Array(buffer)
            }).promise;

            const XLSX = window.XLSX;
            const workbook = XLSX.utils.book_new();

            // Combine pages into one worksheet by default.
            // This works better when a table continues across pages.
            const allRows = [];

            let pagesWithText = 0;

            for (
                let pageNumber = 1;
                pageNumber <= pdf.numPages;
                pageNumber++
            ) {
                const rows = await extractPageRows(
                    pdf,
                    pageNumber
                );

                if (!rows.length) {
                    continue;
                }

                pagesWithText++;

                if (allRows.length && rows.length) {
                    // Preserve the page boundary without creating
                    // a new worksheet for every PDF page.
                    allRows.push([]);
                }

                allRows.push(...rows);
            }

            if (!pagesWithText || !allRows.some(row =>
                row.some(value => String(value).trim())
            )) {
                throw new Error(
                    "No selectable text was found in this PDF. " +
                    "Scanned PDFs require OCR before conversion."
                );
            }

            const worksheet = buildWorksheet(allRows, XLSX);

            XLSX.utils.book_append_sheet(
                workbook,
                worksheet,
                "Extracted Data"
            );

            const outputName = file.name.replace(
                /\.pdf$/i,
                ".xlsx"
            );

            XLSX.writeFile(workbook, outputName);
        }
    });
})();
