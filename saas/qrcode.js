    const qrCode = new QRCodeStyling({
        width: 300,
        height: 300,
        data: "https://google.com",
        margin: 10,
        dotsOptions: { color: "#6366f1", type: "square" },
        cornersSquareOptions: { color: "#4f46e5", type: "square" },
        backgroundOptions: { color: "#ffffff" },
        imageOptions: { crossOrigin: "anonymous", margin: 10, imageSize: 0.4 },
        qrOptions: { errorCorrectionLevel: 'Q' }
    });

    qrCode.append(document.getElementById("canvas"));

    // Event Listeners for all controls
    const update = () => {
        qrCode.update({
            data: document.getElementById("qr-data").value,
            dotsOptions: { 
                color: document.getElementById("dots-color").value, 
                type: document.getElementById("dots-style").value 
            },
            cornersSquareOptions: { 
                color: document.getElementById("corner-color").value,
                type: document.getElementById("corner-style").value 
            },
            backgroundOptions: { color: document.getElementById("bg-color").value },
            qrOptions: { errorCorrectionLevel: document.getElementById("error-level").value }
        });
    };

    ["qr-data", "dots-style", "dots-color", "corner-style", "corner-color", "bg-color", "error-level"].forEach(id => {
        document.getElementById(id).addEventListener("input", update);
    });

    document.getElementById("logo-file").addEventListener("change", (e) => {
        const reader = new FileReader();
        reader.onload = () => qrCode.update({ image: reader.result });
        reader.readAsDataURL(e.target.files[0]);
    });

    function downloadQR() {
        const extension = document.getElementById("ext").value;
        qrCode.download({ name: "pro-designer-qr", extension: extension });
    }

    function toggleGuide() {
        const g = document.getElementById("guide");
        g.style.display = g.style.display === "none" ? "block" : "none";
    }
