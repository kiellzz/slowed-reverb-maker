document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("file-input");
  const fileName = document.getElementById("file-name");
  const downloadBtn = document.getElementById("download-btn");
  const confirmBtn = document.getElementById("confirm-btn");
  const loading = document.getElementById("loading");

  const speedRange = document.getElementById("speedRange");
  const speedInput = document.getElementById("speedInput");

  // --- Sincroniza slider → input number ---
  speedRange.addEventListener("input", () => {
    speedInput.value = speedRange.value;
  });

  // --- Sincroniza input number → slider ---
  speedInput.addEventListener("input", () => {
    let value = parseFloat(speedInput.value);

    if (isNaN(value)) return;

    if (value < 0.5) value = 0.5;
    if (value > 2.0) value = 2.0;

    speedInput.value = value;
    speedRange.value = value;
  });

  let selectedFile = null;

  input.addEventListener("change", () => {
    const file = input.files[0];
    selectedFile = file || null;
    downloadBtn.classList.add("hidden");
    loading.classList.add("hidden");

    if (selectedFile) {
      fileName.textContent = selectedFile.name;
      fileName.classList.remove("error");
      confirmBtn.classList.remove("hidden");
    } else {
      fileName.textContent = "";
      confirmBtn.classList.add("hidden");
    }
  });

  confirmBtn.addEventListener("click", async () => {
    if (!selectedFile) return;

    // Reset UI
    fileName.textContent = "";
    downloadBtn.classList.add("hidden");
    loading.classList.remove("hidden");
    confirmBtn.classList.add("hidden");

    const formData = new FormData();
    formData.append("audio", selectedFile);
    formData.append("speed", speedInput.value);

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

      downloadBtn.href = data.downloadUrl;
      downloadBtn.download =
        selectedFile.name.replace(/\.[^/.]+$/, "") + "_slowed.mp3";

      downloadBtn.classList.remove("hidden");
      fileName.textContent = "Audio ready!";

    } catch (err) {
      console.error(err);
      fileName.textContent = "Error processing audio.";
      fileName.classList.add("error");
    } finally {
      loading.classList.add("hidden");
    }
  });
});