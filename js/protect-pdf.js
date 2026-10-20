
(function () {
    "use strict";

    function askForPassword() {
        const password = window.prompt(
            "Create a password for your PDF (at least 8 characters):"
        );

        if (password === null) return null;

        if (password.length < 8) {
            throw new Error(
                "Please use a password with at least 8 characters."
            );
        }

        const confirmation = window.prompt(
            "Enter the password again to confirm:"
        );

        if (confirmation === null) return null;

        if (password !== confirmation) {
            throw new Error("The passwords do not match.");
        }

        return password;
    }

    function downloadPdf(bytes, filename) {
        const blob = new Blob([bytes], {
            type: "application/pdf"
        });

        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");

        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(function () {
            URL.revokeObjectURL(url);
        }, 1000);
    }

    window.protectPDF = async function (file) {
        if (!file || !file.name.toLowerCase().endsWith(".pdf")) {
            throw new Error("Please select a valid PDF file.");
        }

        const PDFLib = window.PDFLib;

        if (!PDFLib || !PDFLib.PDFDocument) {
            throw new Error(
                "PDF library did not load. Check index.html."
            );
        }

        if (
            !window.crypto ||
            !window.crypto.getRandomValues ||
            !window.crypto.subtle
        ) {
            throw new Error(
                "Secure encryption requires HTTPS or localhost."
            );
        }

        const password = askForPassword();
        if (password === null) return;

        let pdf;

        try {
            pdf = await PDFLib.PDFDocument.load(
                await file.arrayBuffer()
            );
        } catch (error) {
            throw new Error(
                "Could not open this PDF. It may be damaged, " +
                "encrypted already, or unsupported."
            );
        }

        if (typeof pdf.encrypt !== "function") {
            throw new Error(
                "The loaded PDF library does not expose an encryption method. " +
                "The current library cannot protect this PDF with this code."
            );
        }

        const randomBytes = new Uint8Array(32);
        window.crypto.getRandomValues(randomBytes);

        const ownerPassword = Array.from(randomBytes)
            .map(byte => byte.toString(16).padStart(2, "0"))
            .join("");

        pdf.encrypt({
            userPassword: password,
            ownerPassword: ownerPassword
        });

        const outputBytes = await pdf.save();

        return {
            blob: new Blob([outputBytes], { type: "application/pdf" }),
            filename: file.name.replace(/\.pdf$/i, "") + "-protected.pdf"
        };
    };
})();
