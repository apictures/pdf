
/* =========================================================
   PDF Converter — Tool Registry
   Shared registration system for every PDF tool.
   ========================================================= */

(function () {
    "use strict";

    // Create the shared application namespace.
    window.PDFConverter = window.PDFConverter || {};

    const app = window.PDFConverter;

    // Store all registered tools here.
    app.tools = app.tools || {};

    /**
     * Register a tool.
     *
     * Every tool should provide:
     * - name: Display name
     * - accept: Accepted file types
     * - multiple: Whether multiple files are allowed
     * - description: Instructions shown to the user
     * - action: Process button label
     * - process: Function that performs the actual work
     *
     * Optional:
     * - setup: Function to configure tool-specific UI
     */
    app.registerTool = function (tool) {
        if (!tool || typeof tool.name !== "string") {
            console.error("Cannot register tool: a name is required.");
            return;
        }

        if (typeof tool.process !== "function") {
            console.error(
                `Cannot register "${tool.name}": process() is required.`
            );
            return;
        }

        app.tools[tool.name] = Object.freeze({
            accept: ".pdf",
            multiple: false,
            description: "Choose a file to process.",
            action: "Process",
            ...tool
        });

        console.info(`PDF Converter tool registered: ${tool.name}`);
    };

    /**
     * Find a registered tool by its display name.
     */
    app.getTool = function (name) {
        return app.tools[name] || null;
    };

    /**
     * Return the names of all registered tools.
     */
    app.getToolNames = function () {
        return Object.keys(app.tools);
    };

    console.info("PDF Converter tool registry ready.");
})();
