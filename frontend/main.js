document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("file-input");
  const fileName = document.getElementById("file-name");
  const downloadBtn = document.getElementById("download-btn");

  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;

    fileName.textContent = "Processing audio...";
    downloadBtn.style.display = "none";

    const formData = new FormData();
    formData.append("audio", file);

    try {
      const response = await fetch("/convert", {
        method: "POST",
        body: formData
      });

      if (!response.ok) throw new Error("Server error");

      const data = await response.json();

      if (!data.downloadUrl) {
        throw new Error("No download URL");
      }

      // mostrar botão
      downloadBtn.href = data.downloadUrl;
      downloadBtn.download =
        file.name.replace(/\.[^/.]+$/, "") + "_slowed.mp3";

      downloadBtn.style.display = "inline-block";
      fileName.textContent = "Audio ready!";

    } catch (err) {
      console.error(err);
      fileName.textContent = "Error processing audio.";
    }
  });
});
