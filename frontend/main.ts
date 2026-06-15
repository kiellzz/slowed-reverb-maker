import { AudioPreview } from "./preview.js";

interface ConvertResponse {
  downloadUrl?: string;
  fileName?: string;
  previewUrl?: string;
  error?: string;
}

// Item salvo no historico local do navegador para re-download enquanto o arquivo existir.
interface HistoryItem {
  name: string;
  speed: string;
  url: string;
}

// Espera o HTML estar pronto para buscar elementos e registrar eventos.
document.addEventListener("DOMContentLoaded", () => {
  // Referencias aos elementos da interface usados pelos handlers abaixo.
  const input = document.getElementById("file-input") as HTMLInputElement | null;
  const fileName = document.getElementById("file-name");
  const fileSize = document.getElementById("file-size");
  const processCard = document.getElementById("process-card");
  const removeFileBtn = document.getElementById("remove-file-btn") as HTMLButtonElement | null;
  const playBtn = document.getElementById("play-btn") as HTMLButtonElement | null;
  const dropZone = document.getElementById("drop-zone");
  const downloadBtn = document.getElementById("download-btn") as HTMLAnchorElement | null;
  const confirmBtn = document.getElementById("confirm-btn") as HTMLButtonElement | null;
  const statusText = document.getElementById("status-text");
  const statusPercent = document.getElementById("status-percent");
  const statusDetail = document.getElementById("status-detail");
  const progressFill = document.getElementById("progress-fill") as HTMLElement | null;
  const speedRange = document.getElementById("speedRange") as HTMLInputElement | null;
  const speedInput = document.getElementById("speedInput") as HTMLInputElement | null;
  const presetButtons = document.querySelectorAll<HTMLButtonElement>(".preset-btn");
  const historyList = document.getElementById("history-list");
  const historySection = document.getElementById("history-section");
  const reverbRange = document.getElementById("reverbRange") as HTMLInputElement;
  const reverbInput = document.getElementById("reverbInput") as HTMLInputElement;
  const audioProgressWrap = document.getElementById("audio-progress-wrap");
  const audioProgressFill = document.getElementById("audio-progress-fill") as HTMLElement | null;
  const audioProgressTrack = document.getElementById("audio-progress-track");
  const audioCurrent = document.getElementById("audio-current");
  const audioDuration = document.getElementById("audio-duration");
  const processStatus = document.querySelector(".process-status") as HTMLElement | null;
  const progressTrack = document.querySelector(".progress-track") as HTMLElement | null;

  // Divide a barra entre progresso real de upload e simulacao do processamento.
  const UPLOAD_PROGRESS_SHARE = 55;
  const PROCESSING_START = 58;
  const PROCESSING_MAX = 96;
  const MAX_UPLOAD_SIZE_MB = 15;
  const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;

  // Estado atual da tela e da ultima conversao feita pelo usuario.
  let selectedFile: File | null = null;
  let previewUrl = "";
  let progressInterval: ReturnType<typeof setInterval> | null = null;
  let processedFileName = "";
  let dragDepth = 0;

  function formatFileSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function clearProgressInterval(): void {
    if (progressInterval) {
      clearInterval(progressInterval);
      progressInterval = null;
    }
  }

  function getPlaybackRate(): number {
    const rawValue = Number(speedRange?.value || speedInput?.value || 1);

    if (Number.isNaN(rawValue)) return 1;

    return Math.max(0.5, Math.min(2.0, rawValue));
  }

  function getReverbMix(): number {
    const rawValue = Number(reverbRange.value);

    if (Number.isNaN(rawValue)) return 0.3;

    return Math.max(0, Math.min(100, rawValue)) / 100;
  }

  const preview = new AudioPreview(
    {
      playButton: playBtn,
      progressWrap: audioProgressWrap,
      progressFill: audioProgressFill,
      progressTrack: audioProgressTrack,
      currentTime: audioCurrent,
      duration: audioDuration
    },
    {
      getPlaybackRate,
      getReverbMix,
      onReady: () => setDecodedPreviewUI(),
      onUnavailable: () => updateProgress(0, "Ready to process", "Preview is not available in this browser."),
      onError: (message) => setErrorUI(message)
    }
  );

  // Mantem slider e campo numerico de reverb sincronizados.
  reverbRange.addEventListener("input", () => {
    reverbInput.value = reverbRange.value;
    preview.handleSettingsChange();
  });

  reverbInput.addEventListener("blur", () => {
    let val = parseInt(reverbInput.value);
    if (isNaN(val)) val = 30;
    val = Math.max(0, Math.min(100, val));
    reverbInput.value = String(val);
    reverbRange.value = String(val);
    preview.handleSettingsChange();
  });

  function setProcessingStatusVisible(isVisible: boolean): void {
    [processStatus, statusText, statusPercent, statusDetail, progressTrack].forEach((element) => {
      element?.classList.toggle("hidden", !isVisible);
    });
  }

  function setIdlePreviewUI(status = "Ready to process", detail = "Upload starts when you click process."): void {
    preview.hideControls();
    setProcessingStatusVisible(true);
    updateProgress(0, status, detail);

    if (confirmBtn) {
      confirmBtn.classList.remove("hidden");
      confirmBtn.disabled = false;
    }
  }

  function setDecodedPreviewUI(): void {
    setProcessingStatusVisible(false);

    if (confirmBtn) {
      confirmBtn.classList.remove("hidden");
      confirmBtn.disabled = false;
    }
  }

  // Atualiza texto, porcentagem e largura visual da barra de progresso.
  function updateProgress(percent: number, text: string, detail: string): void {
    const safePercent = Math.max(0, Math.min(100, Math.round(percent)));

    if (statusText && text) statusText.textContent = text;
    if (statusDetail && detail) statusDetail.textContent = detail;
    if (statusPercent) statusPercent.textContent = `${safePercent}%`;
    if (progressFill) progressFill.style.width = `${safePercent}%`;
  }

  function resetProgressUI(): void {
    updateProgress(0, "Ready to process", "Upload starts when you click process.");
  }

  function resetDownloadData(): void {
    previewUrl = "";
    processedFileName = "";

    if (downloadBtn) {
      downloadBtn.removeAttribute("href");
      downloadBtn.removeAttribute("download");
      downloadBtn.classList.add("hidden");
    }
  }

  // Marca como ativo o preset que bate com a velocidade atual.
  function updatePresetActiveState(currentSpeed: number): void {
    presetButtons.forEach((button) => {
      const buttonSpeed = Number(button.dataset.speed);
      const isActive = Math.abs(buttonSpeed - currentSpeed) < 0.001;
      button.classList.toggle("active", isActive);
    });
  }

  function formatSpeedValue(value: number): string {
    return Number(value).toFixed(2).replace(/\.?0+$/, "");
  }

  function setSpeedValue(value: number | string): void {
    const safeValue = Math.max(0.5, Math.min(2.0, Number(value)));

    if (speedInput) speedInput.value = formatSpeedValue(safeValue);
    if (speedRange) speedRange.value = String(safeValue);

    updatePresetActiveState(safeValue);
  }

  // Volta a interface para o estado inicial, sem arquivo selecionado.
  function resetFileUI(): void {
    clearProgressInterval();
    preview.reset(true);

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
    preview.hideControls();
    setProcessingStatusVisible(true);
    resetProgressUI();
  }

  // Aplica a classe visual de drag tanto na janela quanto na area de drop.
  function setWindowDragState(isActive: boolean): void {
    document.body.classList.toggle("window-drag-over", isActive);

    if (dropZone) {
      dropZone.classList.toggle("drag-over", isActive);
    }
  }

  // Preenche os dados do arquivo e libera a etapa de processamento.
  function showSelectedFile(file: File): void {
    clearProgressInterval();
    preview.reset(true);

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
    setIdlePreviewUI("Preparing preview...", "Decoding your audio in this browser.");
    preview.decodeFile(file).catch((error) => {
      console.error("Preview decode error:", error);
      setErrorUI("Could not decode audio file.");
    });
  }

  // Estado usado enquanto o arquivo esta sendo enviado/processado.
  function setProcessingUI(): void {
    clearProgressInterval();
    preview.reset(false);

    if (confirmBtn) {
      confirmBtn.classList.add("hidden");
      confirmBtn.disabled = true;
    }

    if (removeFileBtn) removeFileBtn.disabled = true;
    if (processCard) processCard.classList.remove("error");

    resetDownloadData();
    preview.hideControls();
    setProcessingStatusVisible(true);
    updateProgress(0, "Uploading audio...", "Sending your file to the server.");
  }

  // Estado final quando o backend devolve URLs de download e preview.
  function setSuccessUI(): void {
    if (downloadBtn) downloadBtn.classList.remove("hidden");
    if (removeFileBtn) removeFileBtn.disabled = false;
    if (confirmBtn) confirmBtn.disabled = false;
    if (processCard) processCard.classList.remove("error");

    preview.hideControls();
    setProcessingStatusVisible(true);

    updateProgress(100, "Audio ready", "Upload complete. Your processed file is ready.");
  }

  // Estado de erro reaproveitado para validacao local e falhas do servidor.
  function setErrorUI(message: string): void {
    clearProgressInterval();
    preview.reset(false);

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

    preview.hideControls();
    setProcessingStatusVisible(true);
    updateProgress(0, "Processing failed", "Try again with another file or speed value.");
  }

  // Simula a fase de processamento depois do upload real para manter feedback continuo.
  function startProcessingSimulation(startPercent = PROCESSING_START): void {
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

  // Usa XMLHttpRequest porque fetch nao expoe progresso de upload de forma simples.
  function uploadAndConvertAudio(formData: FormData): Promise<ConvertResponse> {
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

      // Ao terminar o upload, a barra passa para a etapa de processamento.
      xhr.upload.addEventListener("load", () => {
        processingStarted = true;
        startProcessingSimulation(PROCESSING_START);
      });

      xhr.addEventListener("load", () => {
        clearProgressInterval();

        let responseData: ConvertResponse | null = null;
        if (xhr.responseType === "json") {
          responseData = xhr.response as ConvertResponse | null;
        } else {
          responseData = tryParseJson(xhr.responseText);
        }

        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(responseData || {});
          return;
        }

        const errorMessage = (responseData && responseData.error) || "Server error";
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

      // Garante que a simulacao comece mesmo se o evento de upload variar por browser.
      xhr.addEventListener("readystatechange", () => {
        if (xhr.readyState === XMLHttpRequest.HEADERS_RECEIVED && !processingStarted) {
          processingStarted = true;
          startProcessingSimulation(PROCESSING_START);
        }
      });

      xhr.send(formData);
    });
  }

  function tryParseJson(value: unknown): ConvertResponse | null {
    if (!value || typeof value !== "string") return null;

    try {
      return JSON.parse(value) as ConvertResponse;
    } catch {
      return null;
    }
  }

  // Historico local: guarda so metadados e URL temporaria devolvida pelo backend.
  function getHistory(): HistoryItem[] {
    try {
      return (JSON.parse(localStorage.getItem("audio_history") || "[]") as HistoryItem[]) || [];
    } catch {
      return [];
    }
  }

  function saveHistory(history: HistoryItem[]): void {
    localStorage.setItem("audio_history", JSON.stringify(history));
  }

  function addToHistory(item: HistoryItem): void {
    const history = getHistory();
    history.unshift(item);

    const trimmed = history.slice(0, 5);

    saveHistory(trimmed);
    renderHistory();
  }

  // Recria a lista de historico e registra handlers de download/remocao em cada item.
  function renderHistory(): void {
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

      const btn = el.querySelector(".history-download") as HTMLButtonElement;
      const deleteBtn = el.querySelector(".history-delete") as HTMLButtonElement;

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

  // Valida o arquivo localmente antes de liberar a conversao.
  function handleSelectedFile(file: File | null): void {
    if (!file) {
      resetFileUI();
      return;
    }

    if (file.size > MAX_UPLOAD_SIZE_BYTES) {
      alert(`File is too large. Maximum upload size is ${MAX_UPLOAD_SIZE_MB} MB.`);
      resetFileUI();
      return;
    }

    if (!file.type || !file.type.startsWith("audio/")) {
      setErrorUI("Please drop a valid audio file.");
      return;
    }

    showSelectedFile(file);
  }

  // Mantem range, input manual e presets de velocidade sempre sincronizados.
  if (speedRange && speedInput) {
    speedRange.addEventListener("input", () => {
      const value = parseFloat(speedRange.value);
      speedInput.value = formatSpeedValue(value);
      updatePresetActiveState(value);
      preview.handleSettingsChange();
    });

    speedInput.addEventListener("input", () => {
      const normalizedValue = speedInput.value
        .replace(",", ".")
        .replace(/[^0-9.]/g, "")
        .replace(/(\..*)\./g, "$1");

      if (normalizedValue !== speedInput.value) {
        speedInput.value = normalizedValue;
      }

      const rawValue = normalizedValue;
      let value = parseFloat(rawValue);

      if (isNaN(value)) return;

      if (value < 0.5) value = 0.5;
      if (value > 2.0) value = 2.0;

      speedInput.value = formatSpeedValue(value);
      speedRange.value = String(value);

      updatePresetActiveState(value);
      preview.handleSettingsChange();
    });

    speedInput.addEventListener("blur", () => {
      const value = parseFloat(speedInput.value.replace(",", "."));

      if (isNaN(value)) {
        setSpeedValue(speedRange.value);
        preview.handleSettingsChange();
        return;
      }

      setSpeedValue(value);
      preview.handleSettingsChange();
    });

    setSpeedValue(parseFloat(speedInput.value));
  }

  if (presetButtons.length) {
    presetButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const presetSpeed = parseFloat(button.dataset.speed as string);
        setSpeedValue(presetSpeed);
        preview.handleSettingsChange();
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

  // Suporte a drag and drop direto sobre a area principal.
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

  // Suporte a drag and drop em qualquer ponto da janela.
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

  // Remove a selecao local e, se ja houver arquivo processado, pede limpeza no backend.
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

  // Monta o FormData e dispara a conversao no backend.
  if (confirmBtn) {
    confirmBtn.addEventListener("click", async () => {
      if (!selectedFile) return;

      setProcessingUI();

      const formData = new FormData();
      const normalizedSpeed = speedInput!.value.replace(",", ".");

      formData.append("audio", selectedFile);
      formData.append("speed", normalizedSpeed);
      formData.append("reverb", reverbRange.value);

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
          speed: speedInput!.value,
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

const starsCanvas = document.getElementById("stars") as HTMLCanvasElement;
const sCtx = starsCanvas.getContext("2d") as CanvasRenderingContext2D;

// O canvas cobre a janela inteira e precisa acompanhar redimensionamentos.
function resizeStars(): void {
  starsCanvas.width = window.innerWidth;
  starsCanvas.height = window.innerHeight;
}
resizeStars();
window.addEventListener("resize", resizeStars);

const stars = Array.from({ length: 200 }, () => ({
  x: Math.random() * window.innerWidth,
  y: Math.random() * window.innerHeight * 0.8,
  r: Math.random() * 1.2 + 0.2,
  o: Math.random() * 0.7 + 0.2,
  s: Math.random() * 0.006 + 0.002
}));

// Animacao leve de estrelas piscando no fundo.
(function drawStars(): void {
  sCtx.clearRect(0, 0, starsCanvas.width, starsCanvas.height);
  stars.forEach((star) => {
    star.o += star.s;
    if (star.o > 0.9 || star.o < 0.15) star.s *= -1;
    sCtx.beginPath();
    sCtx.arc(star.x, star.y, star.r, 0, Math.PI * 2);
    sCtx.fillStyle = `rgba(255,255,255,${star.o})`;
    sCtx.fill();
  });
  requestAnimationFrame(drawStars);
})();
