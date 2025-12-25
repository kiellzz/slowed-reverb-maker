document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("file-input");
  const fileName = document.getElementById("file-name");
  const downloadBtn = document.getElementById("download-btn");
  const loading = document.getElementById("loading");

  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;

    // RESETA O ESTADO PARA NOVO UPLOAD
    fileName.textContent = "";
    downloadBtn.classList.add("hidden");
    loading.classList.remove("hidden");

    fileName.textContent = "Processing audio...";

    const formData = new FormData();
    formData.append("audio", file);

    try {
      const response = await fetch("/convert", {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        throw new Error("Server error");
      }

      const data = await response.json();

      if (!data.downloadUrl) {
        throw new Error("No download URL");
      }

      // CONFIGURA BOTÃO DE DOWNLOAD
      downloadBtn.href = data.downloadUrl;
      downloadBtn.download =
        file.name.replace(/\.[^/.]+$/, "") + "_slowed.mp3";

      downloadBtn.classList.remove("hidden");
      fileName.textContent = "Audio ready!";

    } catch (err) {
      console.error(err);
      fileName.textContent = "Error processing audio.";
    } finally {
      loading.classList.add("hidden");
    }
  });
});
