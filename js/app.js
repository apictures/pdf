
/* =========================================================
   PDF Converter — Main Controller
   Handles the interface and connects registered tools.
   Individual tool files handle document processing.
   ========================================================= */

"use strict";

const toolSettings = {
    "PDF to Word": {
        accept: ".pdf",
        multiple: false,
        action: "Convert to Word"
    },
    "Word to PDF": {
        accept: ".doc,.docx",
        multiple: false,
        action: "Convert to PDF"
    },
    "JPG to PDF": {
        accept: ".jpg,.jpeg,.png",
        multiple: true,
        action: "Convert to PDF"
    },
    "Merge PDF": {
        accept: ".pdf",
        multiple: true,
        action: "Merge PDFs"
    },
    "Split PDF": {
        accept: ".pdf",
        multiple: false,
        action: "Extract Selected Pages"
    },
    "Excel to PDF": {
        accept: ".xls,.xlsx,.csv",
        multiple: false,
        action: "Convert to PDF"
    },
    "PowerPoint to PDF": {
        accept: ".ppt,.pptx",
        multiple: false,
        action: "Convert to PDF"
    },
    "PDF to Excel": {
        accept: ".pdf",
        multiple: false,
        action: "Convert to Excel"
    },
    "PDF to Text": {
        accept: ".pdf",
        multiple: false,
        action: "Extract Text"
    },
    "Protect/Lock PDF": {
        accept: ".pdf",
        multiple: false,
        action: "Protect PDF"
    },
    "Image OCR": {
        accept: ".jpg,.jpeg,.png,.pdf",
        multiple: false,
        action: "Recognize Text"
    },
    "Doc Scanner": {
        accept: "image/*",
        multiple: true,
        action: "Scan Document"
    },
    "ID Card Dual Side": {
        accept: "image/*",
        multiple: true,
        action: "Create ID Card PDF"
    }
};

let currentTool = null;
let currentSettings = null;
let selectedSplitPages = new Set();
let currentSplitPageCount = 0;

const app = window.PDFConverter;

if (!app || typeof app.registerTool !== "function") {
    console.error(
        "Tool registry is missing. Load js/tool-registry.js before js/app.js."
    );
}

/* ---------------------------------------------------------
   Register compatibility adapters for existing tools.
   New tool files can register their own implementations.
   --------------------------------------------------------- */


function registerExistingTools() {
    if (!app) return;

    for (const [name, settings] of Object.entries(toolSettings)) {
        if (app.getTool(name)) continue;

        app.registerTool({
            name,
            accept: settings.accept,
            multiple: settings.multiple,
            action: settings.action,

            async process(files, context = {}) {
                if (name === "Merge PDF") {
                    if (typeof window.mergePDFs !== "function") {
                        throw new Error(
                            "Merge PDF module has not loaded."
                        );
                    }

                    return window.mergePDFs(files);
                }

                if (name === "Split PDF") {
                    if (typeof window.splitPDF !== "function") {
                        throw new Error(
                            "Split PDF module has not loaded."
                        );
                    }

                    const ranges = context.pageRanges || "";

                    if (!ranges) {
                        throw new Error(
                            "Please select the pages to extract."
                        );
                    }

                    return window.splitPDF(files[0], ranges);
                }

                if (name === "Protect/Lock PDF") {
                    if (typeof window.protectPDF !== "function") {
                        throw new Error(
                            "Protect PDF module has not loaded. Check protect-pdf.js."
                        );
                    }

                    return window.protectPDF(files[0], context);
                }

                throw new Error(
                    `${name} is not implemented yet. We will add it in its own JavaScript file.`
                );
            }
        });
    }
}


/* ---------------------------------------------------------
   Search tools
   --------------------------------------------------------- */

function searchTool() {
    const input = document.getElementById("searchInput");
    if (!input) return;

    const query = input.value.trim().toLowerCase();
    const cards = document.querySelectorAll(".tool-card");
    let visibleCount = 0;

    cards.forEach(card => {
        const matches = card.textContent.toLowerCase().includes(query);

        card.style.display = matches ? "" : "none";

        if (matches) visibleCount++;
    });

    let message = document.getElementById("noSearchResults");

    if (!message) {
        message = document.createElement("p");
        message.id = "noSearchResults";
        message.textContent = "No tools found. Try another search.";
        message.style.margin = "20px 0";
        message.style.textAlign = "center";

        const main = document.querySelector("main");
        if (main) main.appendChild(message);
    }

    message.style.display =
        query && visibleCount === 0 ? "block" : "none";
}

/* ---------------------------------------------------------
   Convert selected page numbers into ranges.
   Example: [1, 2, 3, 5, 8, 9] => "1-3, 5, 8-9"
   --------------------------------------------------------- */

function selectedPagesToRanges(numbers) {
    if (!numbers.length) return "";

    const sorted = [...new Set(numbers)].sort((a, b) => a - b);
    const ranges = [];

    let start = sorted[0];
    let end = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
        const page = sorted[i];

        if (page === end + 1) {
            end = page;
        } else {
            ranges.push(
                start === end ? String(start) : `${start}-${end}`
            );

            start = page;
            end = page;
        }
    }

    ranges.push(
        start === end ? String(start) : `${start}-${end}`
    );

    return ranges.join(", ");
}

/* ---------------------------------------------------------
   Render actual PDF page previews using PDF.js.
   --------------------------------------------------------- */

async function renderSplitPageSelector(file, workspace, status) {
    const controls = workspace.querySelector("#splitControls");
    const grid = workspace.querySelector("#splitPageGrid");
    const countLabel = workspace.querySelector("#splitSelectionCount");
    const processButton = workspace.querySelector("#processToolButton");

    if (!window.pdfjsLib) {
        throw new Error(
            "PDF.js has not loaded. Check the PDF.js script in index.html."
        );
    }

    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
        "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

    status.textContent = "Loading PDF pages...";
    controls.style.display = "block";
    grid.replaceChildren();

    selectedSplitPages = new Set();
    currentSplitPageCount = 0;
    processButton.disabled = true;

    const bytes = await file.arrayBuffer();
    const pdf = await window.pdfjsLib.getDocument({
        data: new Uint8Array(bytes)
    }).promise;

    currentSplitPageCount = pdf.numPages;

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1 });
        const scale = Math.min(150 / viewport.width, 0.35);
        const previewViewport = page.getViewport({ scale });

        const card = document.createElement("label");
        card.style.cssText =
            "display:flex;flex-direction:column;align-items:center;" +
            "gap:8px;padding:10px;border:1px solid #ddd;" +
            "border-radius:8px;cursor:pointer;min-width:0;";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = true;
        checkbox.dataset.page = String(pageNumber);
        checkbox.style.alignSelf = "flex-start";

        selectedSplitPages.add(pageNumber);

        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(previewViewport.width);
        canvas.height = Math.ceil(previewViewport.height);
        canvas.style.cssText =
            "display:block;max-width:100%;height:auto;" +
            "border:1px solid #eee;background:white;";

        const pageLabel = document.createElement("span");
        pageLabel.textContent = `Page ${pageNumber}`;

        card.append(checkbox, canvas, pageLabel);
        grid.appendChild(card);

        await page.render({
            canvasContext: canvas.getContext("2d"),
            viewport: previewViewport
        }).promise;

        checkbox.addEventListener("change", () => {
            if (checkbox.checked) {
                selectedSplitPages.add(pageNumber);
            } else {
                selectedSplitPages.delete(pageNumber);
            }

            updateSplitSelection(workspace);
        });
    }

    updateSplitSelection(workspace);
    status.textContent = "Select the pages you want to extract.";
}

/* ---------------------------------------------------------
   Update the page-selection controls.
   --------------------------------------------------------- */

function updateSplitSelection(workspace) {
    const countLabel =
        workspace.querySelector("#splitSelectionCount");

    const processButton =
        workspace.querySelector("#processToolButton");

    countLabel.textContent =
        `${selectedSplitPages.size} of ${currentSplitPageCount} pages selected`;

    processButton.disabled = selectedSplitPages.size === 0;
    processButton.style.opacity =
        processButton.disabled ? "0.6" : "1";
}

/* ---------------------------------------------------------
   Open a tool workspace.
   --------------------------------------------------------- */

function selectTool(toolName) {
    const tool = app && app.getTool(toolName);
    const settings = toolSettings[toolName];

    if (!settings || !tool) {
        console.error("Tool is not registered:", toolName);
        return;
    }

    currentTool = toolName;
    currentSettings = settings;
    selectedSplitPages = new Set();
    currentSplitPageCount = 0;

    const main = document.querySelector("main");

    if (!main) {
        console.error("Could not find the main page container.");
        return;
    }

    let workspace = document.getElementById("toolWorkspace");

    if (!workspace) {
        workspace = document.createElement("section");
        workspace.id = "toolWorkspace";
        workspace.style.cssText =
            "margin:24px 0;padding:22px;border-radius:12px;" +
            "background:var(--workspace-background, #fff);";
        main.appendChild(workspace);
    }

    const isSplit = toolName === "Split PDF";
    const description = isSplit
        ? "Choose a PDF, then select the pages you want to extract."
        : settings.multiple
            ? "Choose the files to process."
            : "Choose the file to process.";

    workspace.innerHTML = `
        <h2></h2>
        <p id="toolDescription" style="margin:12px 0 18px;color:#666"></p>

        <input id="toolFilePicker" type="file">

        <p id="workspaceFiles"
           style="margin:12px 0;overflow-wrap:anywhere"></p>

        <div id="splitControls" style="display:none;margin:20px 0">
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:15px">
                <button id="selectAllPages" type="button">Select all</button>
                <button id="clearSelectedPages" type="button">Clear selection</button>
            </div>

            <p id="splitSelectionCount" style="margin-bottom:15px"></p>

            <div id="splitPageGrid" style="
                display:grid;
                grid-template-columns:repeat(auto-fill,minmax(125px,1fr));
                gap:14px;
            "></div>
        </div>

        <button id="processToolButton" type="button" disabled style="
            margin-top:18px;
            padding:12px 22px;
            background:#ff4b4b;
            color:white;
            border:0;
            border-radius:7px;
            cursor:pointer;
            opacity:.6;
        "></button>

        <p id="workspaceStatus" role="status" style="margin-top:15px"></p>
    `;

    workspace.querySelector("h2").textContent = toolName;
    workspace.querySelector("#toolDescription").textContent = description;

    const picker = workspace.querySelector("#toolFilePicker");
    picker.accept = settings.accept;
    picker.multiple = settings.multiple;

    const processButton =
        workspace.querySelector("#processToolButton");

    processButton.textContent = settings.action;

    const status = workspace.querySelector("#workspaceStatus");
    const fileInfo = workspace.querySelector("#workspaceFiles");

    picker.addEventListener("change", async () => {
        const files = Array.from(picker.files);

        fileInfo.textContent = files.length
            ? files.map(file => file.name).join(", ")
            : "";

        processButton.disabled = files.length === 0;
        processButton.style.opacity =
            processButton.disabled ? "0.6" : "1";

        if (isSplit && files.length) {
            try {
                await renderSplitPageSelector(
                    files[0],
                    workspace,
                    status
                );
            } catch (error) {
                status.textContent = error.message;
                processButton.disabled = true;
            }
        } else {
            workspace.querySelector("#splitControls").style.display =
                "none";

            status.textContent = "";
        }
    });

    workspace.querySelector("#selectAllPages")
        .addEventListener("click", () => {
            workspace.querySelectorAll(
                '#splitPageGrid input[type="checkbox"]'
            ).forEach(checkbox => {
                checkbox.checked = true;
                selectedSplitPages.add(Number(checkbox.dataset.page));
            });

            updateSplitSelection(workspace);
        });

    workspace.querySelector("#clearSelectedPages")
        .addEventListener("click", () => {
            workspace.querySelectorAll(
                '#splitPageGrid input[type="checkbox"]'
            ).forEach(checkbox => {
                checkbox.checked = false;
            });

            selectedSplitPages.clear();
            updateSplitSelection(workspace);
        });

    processButton.addEventListener("click", async () => {
        const files = Array.from(picker.files);

        if (!files.length) {
            status.textContent = "Please select a file first.";
            return;
        }

        if (isSplit && selectedSplitPages.size === 0) {
            status.textContent = "Please select at least one page.";
            return;
        }

        processButton.disabled = true;
        status.textContent = "Processing your file...";

        try {
            const pageRanges = isSplit
                ? selectedPagesToRanges([...selectedSplitPages])
                : "";

            const result = await tool.process(files, { pageRanges });

            if (result && result.blob instanceof Blob && result.filename) {
                if (!window.PDFConverterAds || typeof window.PDFConverterAds.downloadFile !== "function") {
                    throw new Error("The shared download handler did not load. Please refresh the page.");
                }
                await window.PDFConverterAds.downloadFile(result.blob, result.filename);
                status.textContent = `Processing finished. Downloading ${result.filename}...`;
            } else {
                // Tools such as OCR display their result in the workspace instead of returning a file.
                status.textContent = "Processing finished.";
            }
        } catch (error) {
            console.error(`${toolName} failed:`, error);
            status.textContent =
                error.message || "Something went wrong.";
        } finally {
            processButton.disabled =
                isSplit
                    ? selectedSplitPages.size === 0
                    : false;

            processButton.style.opacity =
                processButton.disabled ? "0.6" : "1";
        }
    });

    workspace.scrollIntoView({
        behavior: "smooth",
        block: "start"
    });
}

/* ---------------------------------------------------------
   Start the application.
   --------------------------------------------------------- */

document.addEventListener("DOMContentLoaded", () => {
    registerExistingTools();

    const searchInput = document.getElementById("searchInput");

    if (searchInput) {
        searchInput.addEventListener("input", searchTool);
    }

    console.info(
        "PDF Converter ready. Registered tools:",
        app ? app.getToolNames() : []
    );
});

/* Required by the inline onclick handlers in index.html. */
window.selectTool = selectTool;
window.searchTool = searchTool;
