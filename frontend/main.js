document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById("file-input");
  const fileName = document.getElementById("file-name");
  const fileSize = document.getElementById("file-size");
  const processCard = document.getElementById("process-card");
  const removeFileBtn = document.getElementById("remove-file-btn");
  const playBtn = document.getElementById("play-btn");
  const dropZone = document.getElementById("drop-zone");
  const downloadBtn = document.getElementById("download-btn");
  const confirmBtn = document.getElementById("confirm-btn");
  const statusText = document.getElementById("status-text");
  const statusPercent = document.getElementById("status-percent");
  const statusDetail = document.getElementById("status-detail");
  const progressFill = document.getElementById("progress-fill");
  const speedRange = document.getElementById("speedRange");
  const speedInput = document.getElementById("speedInput");
  const presetButtons = document.querySelectorAll(".preset-btn");
  const historyList = document.getElementById("history-list");
  const historySection = document.getElementById("history-section");

  const UPLOAD_PROGRESS_SHARE = 55;
  const PROCESSING_START = 58;
  const PROCESSING_MAX = 96;

  let selectedFile = null;
  let previewAudio = null;
  let previewUrl = "";
  let progressInterval = null;
  let processedFileName = "";
  let dragDepth = 0;

  function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function clearProgressInterval() {
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
  }

  function stopPreviewAudio() {
    if (!previewAudio) return;
    previewAudio.pause();
    previewAudio.currentTime = 0;
    previewAudio = null;
  }

  function resetPlayButton() {
    if (!playBtn) return;
    playBtn.classList.add("hidden");
    playBtn.textContent = "\u25B6";
    playBtn.setAttribute("aria-label", "Play preview");
  }

  function updateProgress(percent, text, detail) {
    const safePercent = Math.max(0, Math.min(100, Math.round(percent)));

    if (statusText && text) statusText.textContent = text;
    if (statusDetail && detail) statusDetail.textContent = detail;
    if (statusPercent) statusPercent.textContent = `${safePercent}%`;
    if (progressFill) progressFill.style.width = `${safePercent}%`;
  }

  function resetProgressUI() {
    updateProgress(0, "Ready to process", "Upload starts when you click process.");
  }

  function resetDownloadData() {
    previewUrl = "";
    processedFileName = "";

    if (downloadBtn) {
      downloadBtn.removeAttribute("href");
      downloadBtn.removeAttribute("download");
      downloadBtn.classList.add("hidden");
    }
  }

  function updatePresetActiveState(currentSpeed) {
    presetButtons.forEach((button) => {
      const buttonSpeed = Number(button.dataset.speed);
      const isActive = Math.abs(buttonSpeed - currentSpeed) < 0.001;
      button.classList.toggle("active", isActive);
    });
  }

  function formatSpeedValue(value) {
    return Number(value).toFixed(2).replace(/\.?0+$/, "");
  }

  function setSpeedValue(value) {
    const safeValue = Math.max(0.5, Math.min(2.0, Number(value)));

    if (speedInput) speedInput.value = formatSpeedValue(safeValue);
    if (speedRange) speedRange.value = String(safeValue);

    updatePresetActiveState(safeValue);
  }

  function resetFileUI() {
    clearProgressInterval();
    stopPreviewAudio();

    selectedFile = null;
    previewUrl = "";
    processedFileName = "";

    if (input) input.value = "";

    if (fileName) {
      fileName.textContent = "No file selected";
      fileName.classList.remove("error");
    }

    if (fileSize) fileSize.textContent = "-- MB";
    if (processCard) {
      processCard.classList.add("hidden");
      processCard.classList.remove("error");
    }

    if (confirmBtn) {
      confirmBtn.classList.add("hidden");
      confirmBtn.disabled = false;
    }

    if (removeFileBtn) removeFileBtn.disabled = false;

    resetDownloadData();
    resetPlayButton();
    resetProgressUI();
  }

  function setWindowDragState(isActive) {
    document.body.classList.toggle("window-drag-over", isActive);

    if (dropZone) {
      dropZone.classList.toggle("drag-over", isActive);
    }
  }

  function showSelectedFile(file) {
    clearProgressInterval();
    stopPreviewAudio();

    selectedFile = file;
    previewUrl = "";
    processedFileName = "";

    if (fileName) {
      fileName.textContent = file.name;
      fileName.classList.remove("error");
    }

    if (fileSize) fileSize.textContent = formatFileSize(file.size);

    if (processCard) {
      processCard.classList.remove("hidden");
      processCard.classList.remove("error");
    }

    if (confirmBtn) {
      confirmBtn.classList.remove("hidden");
      confirmBtn.disabled = false;
    }

    if (removeFileBtn) removeFileBtn.disabled = false;

    resetDownloadData();
    resetPlayButton();
    resetProgressUI();
  }

  function setProcessingUI() {
    clearProgressInterval();
    stopPreviewAudio();

    if (confirmBtn) {
      confirmBtn.classList.add("hidden");
      confirmBtn.disabled = true;
    }

    if (removeFileBtn) removeFileBtn.disabled = true;
    if (processCard) processCard.classList.remove("error");

    resetDownloadData();
    resetPlayButton();
    updateProgress(0, "Uploading audio...", "Sending your file to the server.");
  }

  function setSuccessUI() {
    if (downloadBtn) downloadBtn.classList.remove("hidden");
    if (removeFileBtn) removeFileBtn.disabled = false;
    if (confirmBtn) confirmBtn.disabled = false;
    if (processCard) processCard.classList.remove("error");

    if (playBtn && previewUrl) {
      playBtn.classList.remove("hidden");
      playBtn.textContent = "\u25B6";
      playBtn.setAttribute("aria-label", "Play preview");
    }

    updateProgress(100, "Audio ready", "Upload complete. Your processed file is ready.");
  }

  function setErrorUI(message) {
    clearProgressInterval();
    stopPreviewAudio();

    if (confirmBtn) {
      confirmBtn.classList.remove("hidden");
      confirmBtn.disabled = false;
    }

    if (removeFileBtn) removeFileBtn.disabled = false;
    if (processCard) processCard.classList.add("error");

    if (fileName) {
      fileName.textContent = message;
      fileName.classList.add("error");
    }

    resetPlayButton();
    updateProgress(0, "Processing failed", "Try again with another file or speed value.");
  }

  function startProcessingSimulation(startPercent = PROCESSING_START) {
    let currentPercent = startPercent;

    clearProgressInterval();
    updateProgress(currentPercent, "Processing audio...", "Finalizing your track.");

    progressInterval = setInterval(() => {
      if (currentPercent >= PROCESSING_MAX) return;

      const remaining = PROCESSING_MAX - currentPercent;
      const step = Math.max(1, remaining * (0.12 + Math.random() * 0.08));
      currentPercent = Math.min(PROCESSING_MAX, currentPercent + step);

      updateProgress(currentPercent, "Processing audio...", "Finalizing your track.");
    }, 280);
  }

  function uploadAndConvertAudio(formData) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      let processingStarted = false;

      xhr.open("POST", "/convert");
      xhr.responseType = "json";

      xhr.upload.addEventListener("loadstart", () => {
        updateProgress(2, "Uploading audio...", "Sending your file to the server.");
      });

      xhr.upload.addEventListener("progress", (event) => {
        if (!event.lengthComputable) return;

        const uploadPercent = Math.max(
          3,
          Math.min(
            UPLOAD_PROGRESS_SHARE,
            Math.round((event.loaded / event.total) * UPLOAD_PROGRESS_SHARE)
          )
        );

        const uploadedMb = (event.loaded / (1024 * 1024)).toFixed(2);
        const totalMb = (event.total / (1024 * 1024)).toFixed(2);

        updateProgress(
          uploadPercent,
          "Uploading audio...",
          `${uploadedMb} MB of ${totalMb} MB sent`
        );
      });

      xhr.upload.addEventListener("load", () => {
        processingStarted = true;
        startProcessingSimulation(PROCESSING_START);
      });

      xhr.addEventListener("load", () => {
        clearProgressInterval();

        const responseData = xhr.response || tryParseJson(xhr.responseText);

        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(responseData || {});
          return;
        }

        const errorMessage =
          (responseData && responseData.error) || "Server error";

        reject(new Error(errorMessage));
      });

      xhr.addEventListener("error", () => {
        clearProgressInterval();
        reject(new Error("Network error"));
      });

      xhr.addEventListener("timeout", () => {
        clearProgressInterval();
        reject(new Error("Request timed out"));
      });

      xhr.addEventListener("abort", () => {
        clearProgressInterval();
        reject(new Error("Request aborted"));
      });

      xhr.addEventListener("readystatechange", () => {
        if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED && !processingStarted) {
          processingStarted = true;
          startProcessingSimulation(PROCESSING_START);
        }
      });

      xhr.send(formData);
    });
  }

  function tryParseJson(value) {
    if (!value || typeof value !== "string") return null;

    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  function getHistory() {
    try {
      return JSON.parse(localStorage.getItem("audio_history")) || [];
    } catch {
      return [];
    }
  }

  function saveHistory(history) {
    localStorage.setItem("audio_history", JSON.stringify(history));
  }

  function addToHistory(item) {
    const history = getHistory();
    history.unshift(item);

    const trimmed = history.slice(0, 5);

    saveHistory(trimmed);
    renderHistory();
  }

  function renderHistory() {
    if (!historyList || !historySection) return;

    const history = getHistory();

    if (history.length === 0) {
      historySection.classList.add("hidden");
      historyList.innerHTML = "";
      return;
    }

    historySection.classList.remove("hidden");
    historyList.innerHTML = "";

    history.forEach((item) => {
      const el = document.createElement("div");
      el.className = "history-item";

      el.innerHTML = `
        <div class="history-info">
          <span class="history-name">${item.name}</span>
          <span class="history-meta">${item.speed}x</span>
        </div>

        <div class="history-actions">
          <button class="history-download">Download</button>
          <button class="history-delete">&times;</button>
        </div>
      `;

      const btn = el.querySelector(".history-download");
      const deleteBtn = el.querySelector(".history-delete");

      btn.addEventListener("click", async () => {
        try {
          const response = await fetch(item.url);

          if (!response.ok) {
            throw new Error("File not found");
          }

          const blob = await response.blob();
          const blobUrl = window.URL.createObjectURL(blob);

          const a = document.createElement("a");
          a.href = blobUrl;
          a.download = item.name.replace(/\.[^/.]+$/, "") + "_slowed.mp3";
          document.body.appendChild(a);
          a.click();
          a.remove();

          window.URL.revokeObjectURL(blobUrl);
        } catch (error) {
          console.error("History download error:", error);
          alert("This file is no longer available.");

          const currentHistory = getHistory();
          const updated = currentHistory.filter((h) => h.url !== item.url);
          saveHistory(updated);
          renderHistory();
        }
      });

      deleteBtn.addEventListener("click", () => {
        el.classList.add("removing");

        setTimeout(() => {
          const currentHistory = getHistory();
          const updated = currentHistory.filter((h) => h.url !== item.url);

          saveHistory(updated);
          renderHistory();
        }, 200);
      });

      historyList.appendChild(el);
    });
  }

  function handleSelectedFile(file) {
    if (!file) {
      resetFileUI();
      return;
    }

    if (!file.type || !file.type.startsWith("audio/")) {
      setErrorUI("Please drop a valid audio file.");
      return;
    }

    showSelectedFile(file);
  }

  if (speedRange && speedInput) {
    speedRange.addEventListener("input", () => {
      const value = parseFloat(speedRange.value);
      speedInput.value = formatSpeedValue(value);
      updatePresetActiveState(value);
    });

    speedInput.addEventListener("input", () => {
      const normalizedValue = speedInput.value
        .replace(",", ".")
        .replace(/[^0-9.]/g, "")
        .replace(/(\..*)\./g, "$1");

      if (normalizedValue !== speedInput.value) {
        speedInput.value = normalizedValue;
      }

      let rawValue = normalizedValue;
      let value = parseFloat(rawValue);

      if (isNaN(value)) return;

      if (value < 0.5) value = 0.5;
      if (value > 2.0) value = 2.0;

      speedInput.value = formatSpeedValue(value);
      speedRange.value = String(value);

      updatePresetActiveState(value);
    });

    speedInput.addEventListener("blur", () => {
      const value = parseFloat(speedInput.value.replace(",", "."));

      if (isNaN(value)) {
        setSpeedValue(speedRange.value);
        return;
      }

      setSpeedValue(value);
    });

    setSpeedValue(parseFloat(speedInput.value));
  }

  if (presetButtons.length) {
    presetButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const presetSpeed = parseFloat(button.dataset.speed);
        setSpeedValue(presetSpeed);
      });
    });
  }

  if (input) {
    input.addEventListener("click", () => {
      input.value = "";
    });

    input.addEventListener("change", () => {
      const file = input.files && input.files[0] ? input.files[0] : null;
      handleSelectedFile(file);
    });
  }

  if (dropZone && input) {
    ["dragenter", "dragover"].forEach((eventName) => {
      dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
        setWindowDragState(true);
      });
    });

    ["dragleave", "dragend"].forEach((eventName) => {
      dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.target === dropZone) {
          setWindowDragState(false);
        }
      });
    });

    dropZone.addEventListener("drop", (event) => {
      event.preventDefault();
      event.stopPropagation();
      dragDepth = 0;
      setWindowDragState(false);

      const files = event.dataTransfer?.files;
      const file = files && files.length ? files[0] : null;

      if (!file) return;

      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      input.files = dataTransfer.files;

      handleSelectedFile(file);
    });
  }

  if (input) {
    window.addEventListener("dragenter", (event) => {
      event.preventDefault();
      dragDepth += 1;
      setWindowDragState(true);
    });

    window.addEventListener("dragover", (event) => {
      event.preventDefault();
      setWindowDragState(true);
    });

    window.addEventListener("dragleave", (event) => {
      event.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);

      if (dragDepth === 0 || event.clientX === 0 || event.clientY === 0) {
        setWindowDragState(false);
      }
    });

    window.addEventListener("drop", (event) => {
      event.preventDefault();
      dragDepth = 0;
      setWindowDragState(false);

      const files = event.dataTransfer?.files;
      const file = files && files.length ? files[0] : null;

      if (!file) return;

      const dataTransfer = new DataTransfer();
      dataTransfer.items.add(file);
      input.files = dataTransfer.files;

      handleSelectedFile(file);
    });
  }

  if (removeFileBtn) {
    removeFileBtn.addEventListener("click", async () => {
      try {
        if (processedFileName) {
          await fetch(`/delete/${encodeURIComponent(processedFileName)}`, {
            method: "DELETE"
          });
        }
      } catch (error) {
        console.error("Error deleting processed file:", error);
      } finally {
        resetFileUI();
      }
    });
  }

  if (playBtn) {
    playBtn.addEventListener("click", async () => {
      if (!previewUrl) return;

      try {
        if (!previewAudio) {
          previewAudio = new Audio(previewUrl);

          previewAudio.addEventListener("ended", () => {
            if (playBtn) {
              playBtn.textContent = "\u25B6";
              playBtn.setAttribute("aria-label", "Play preview");
            }
          });
        }

        if (previewAudio.paused) {
          await previewAudio.play();
          playBtn.textContent = "\u23F8";
          playBtn.setAttribute("aria-label", "Pause preview");
        } else {
          previewAudio.pause();
          playBtn.textContent = "\u25B6";
          playBtn.setAttribute("aria-label", "Play preview");
        }
      } catch (error) {
        console.error("Preview playback error:", error);
      }
    });
  }

  if (confirmBtn) {
    confirmBtn.addEventListener("click", async () => {
      if (!selectedFile) return;

      setProcessingUI();

      const formData = new FormData();
      const normalizedSpeed = speedInput.value.replace(",", ".");

      formData.append("audio", selectedFile);
      formData.append("speed", normalizedSpeed);

      try {
        const data = await uploadAndConvertAudio(formData);

        if (!data.downloadUrl) {
          throw new Error("No download URL");
        }

        previewUrl = data.previewUrl || "";
        processedFileName =
          data.fileName || data.downloadUrl.split("/").pop() || "";

        if (downloadBtn) {
          downloadBtn.href = data.downloadUrl;
          downloadBtn.download =
            selectedFile.name.replace(/\.[^/.]+$/, "") + "_slowed.mp3";
        }

        setSuccessUI();

        addToHistory({
          name: selectedFile.name,
          speed: speedInput.value,
          url: data.downloadUrl
        });
      } catch (err) {
        console.error("Processing error:", err);
        setErrorUI("Error processing audio.");
      }
    });
  }

  renderHistory();
});
