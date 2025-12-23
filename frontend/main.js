document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById('file-input');
  const fileName = document.getElementById('file-name');
  const downloadBtn = document.getElementById('download-btn');

  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;

    // Feedback inicial
    fileName.textContent = "Processing audio...";
    downloadBtn.style.display = "none"; // esconde enquanto processa

    const formData = new FormData();
    formData.append("audio", file);

    try {
      const response = await fetch("http://localhost:3000/convert", {
        method: "POST",
        body: formData
      });

      if (!response.ok) throw new Error("Server error");

      const data = await response.json();

      // DEBUG: verifica se a URL está chegando
      console.log("Download URL:", data.downloadUrl);

      if (!data.downloadUrl) {
        throw new Error("Download URL missing");
      }

      // Atualiza botão de download
      downloadBtn.href = data.downloadUrl;
      downloadBtn.download = file.name.replace(/\.[^/.]+$/, "") + "_slowed.mp3";
      downloadBtn.style.display = "inline-block"; // mostra o botão
      downloadBtn.textContent = "Download Processed Audio";

      fileName.textContent = file.name + " ready!";

    } catch (err) {
      console.error(err);
      fileName.textContent = "Error processing audio.";
      downloadBtn.style.display = "none"; // garante que o botão fique escondido
    }
  });
});
