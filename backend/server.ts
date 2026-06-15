import { spawn } from "child_process";
import express, { type Request, type Response } from "express";
import fs from "fs";
import multer from "multer";
import path from "path";

const app = express();
const PORT = process.env.PORT || 3000;

// Quando roda a versao compilada em dist/, volta para a pasta backend.
// Isso mantem uploads, outputs e frontend no mesmo lugar em dev e producao.
const BACKEND_DIR = path.basename(__dirname) === "dist" ? path.resolve(__dirname, "..") : __dirname;

const UPLOADS_DIR = path.join(BACKEND_DIR, "uploads");
const OUTPUTS_DIR = path.join(BACKEND_DIR, "outputs");

// Limites e parametros centrais usados no upload e no processamento de audio.
const MAX_FILE_AGE_MS = 10 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
const OUTPUT_SAMPLE_RATE = 44100;
const OUTPUT_CHANNELS = 2;
const OUTPUT_AUDIO_BITRATE = "128k";
const MAX_UPLOAD_SIZE_MB = 15;
const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * 1024 * 1024;

interface FfmpegOptions {
  inputPath: string;
  outputPath: string;
  speed: number;
  reverbAmount: number;
  onProgress?: (percent: number) => void;
}

type ConvertStreamEvent =
  | { type: "progress"; percent: number }
  | { type: "complete"; fileName: string; downloadUrl: string; previewUrl: string }
  | { type: "error"; error: string };

// Middleware simples de CORS para aceitar chamadas do frontend e preflight OPTIONS.
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

const compiledFrontendPath = path.join(BACKEND_DIR, "dist", "frontend");
const frontendPath = path.join(BACKEND_DIR, "..", "frontend");

// O JS compilado do frontend fica em dist/frontend; HTML e CSS continuam em frontend.
app.use(express.static(compiledFrontendPath));
app.use(express.static(frontendPath));

app.get("/", (_req: Request, res: Response) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

// Cria as pastas temporarias antes de receber ou gerar qualquer arquivo.
[UPLOADS_DIR, OUTPUTS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

function deleteFileIfExists(filePath: string): void {
  fs.access(filePath, fs.constants.F_OK, (accessErr) => {
    if (accessErr) return;

    fs.unlink(filePath, (unlinkErr) => {
      if (unlinkErr) {
        console.error("Error deleting file:", filePath, unlinkErr.message);
        return;
      }

      console.log("Deleted:", path.basename(filePath));
    });
  });
}

// Agenda remocao dos arquivos processados para evitar acumulo no servidor.
function scheduleFileDeletion(filePath: string, delay = MAX_FILE_AGE_MS): void {
  setTimeout(() => {
    deleteFileIfExists(filePath);
  }, delay);
}

// Remove arquivos antigos que sobraram por erro, restart ou download nao feito.
function cleanupOldFiles(directory: string, maxAgeMs: number): void {
  fs.readdir(directory, (readErr, files) => {
    if (readErr) {
      console.error(`Error reading ${directory}:`, readErr.message);
      return;
    }

    files.forEach((file) => {
      const filePath = path.join(directory, file);

      fs.stat(filePath, (statErr, stats) => {
        if (statErr) {
          console.error(`Error stat ${filePath}:`, statErr.message);
          return;
        }

        const fileAge = Date.now() - stats.mtimeMs;

        if (fileAge > maxAgeMs) {
          fs.unlink(filePath, (unlinkErr) => {
            if (unlinkErr) {
              console.error(`Error deleting ${filePath}:`, unlinkErr.message);
              return;
            }

            console.log("Cleaned old file:", file);
          });
        }
      });
    });
  });
}

function startCleanupJob(): void {
  const runCleanup = () => {
    console.log("Running cleanup job...");
    cleanupOldFiles(UPLOADS_DIR, MAX_FILE_AGE_MS);
    cleanupOldFiles(OUTPUTS_DIR, MAX_FILE_AGE_MS);
  };

  runCleanup();
  setInterval(runCleanup, CLEANUP_INTERVAL_MS);
}

function sanitizeBaseFileName(name: string): string {
  // Mantem o nome seguro para o sistema de arquivos e limita o tamanho final.
  return name.replace(/[^\w\-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "audio";
}

function parseTimestampToSeconds(value: string): number | null {
  const match = value.trim().match(/^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/);

  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);

  if ([hours, minutes, seconds].some(Number.isNaN)) return null;

  return hours * 3600 + minutes * 60 + seconds;
}

function parseDurationFromFfmpegLog(value: string): number | null {
  const match = value.match(/Duration:\s*(\d+:\d{2}:\d{2}(?:\.\d+)?)/);
  return match ? parseTimestampToSeconds(match[1]) : null;
}

function writeConvertEvent(res: Response, event: ConvertStreamEvent): void {
  if (res.writableEnded) return;

  res.write(`${JSON.stringify(event)}\n`);
}

// Executa o FFmpeg em processo separado para aplicar velocidade e reverb.
function runFfmpeg({ inputPath, outputPath, speed, reverbAmount, onProgress }: FfmpegOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg";

    let filter: string;
    if (reverbAmount === 0) {
      filter = `asetrate=${OUTPUT_SAMPLE_RATE}*${speed},aresample=${OUTPUT_SAMPLE_RATE}`;
    } else {
      // O reverb usa varios atrasos curtos para criar reflexoes suaves.
      const mix = Math.max(0.01, (reverbAmount / 100) * 0.15).toFixed(2);
      const d1 = 11;
      const d2 = 19;
      const d3 = 31;
      const d4 = 47;
      const d5 = 67;
      const d6 = 89;
      const d7 = 113;
      const d8 = 139;
      const dc1 = Math.max(0.01, (reverbAmount / 100) * 0.18).toFixed(2);
      const dc2 = Math.max(0.01, (reverbAmount / 100) * 0.14).toFixed(2);
      const dc3 = Math.max(0.01, (reverbAmount / 100) * 0.11).toFixed(2);
      const dc4 = Math.max(0.01, (reverbAmount / 100) * 0.08).toFixed(2);
      const dc5 = Math.max(0.01, (reverbAmount / 100) * 0.06).toFixed(2);
      const dc6 = Math.max(0.01, (reverbAmount / 100) * 0.04).toFixed(2);
      const dc7 = Math.max(0.01, (reverbAmount / 100) * 0.03).toFixed(2);
      const dc8 = Math.max(0.01, (reverbAmount / 100) * 0.02).toFixed(2);

      filter = `asetrate=${OUTPUT_SAMPLE_RATE}*${speed},aresample=${OUTPUT_SAMPLE_RATE},aecho=0.95:${mix}:${d1}|${d2}|${d3}|${d4}|${d5}|${d6}|${d7}|${d8}:${dc1}|${dc2}|${dc3}|${dc4}|${dc5}|${dc6}|${dc7}|${dc8},volume=4`;
    }

    const args = [
      "-y",
      "-nostats",
      "-progress",
      "pipe:1",
      "-i",
      inputPath,
      "-vn",
      "-map_metadata",
      "-1",
      "-ac",
      String(OUTPUT_CHANNELS),
      "-ar",
      String(OUTPUT_SAMPLE_RATE),
      "-b:a",
      OUTPUT_AUDIO_BITRATE,
      "-filter:a",
      filter,
      outputPath
    ];

    console.log("FFMPEG:", ffmpegPath, args.join(" "));

    const ffmpeg = spawn(ffmpegPath, args, {
      windowsHide: true
    });

    let stderr = "";
    let stderrDurationBuffer = "";
    let stdoutBuffer = "";
    let inputDurationSeconds: number | null = null;
    let lastProgressPercent = -1;
    let lastProgressAt = 0;

    const emitProgressFromOutputTime = (outputTimeSeconds: number): void => {
      if (!onProgress || !inputDurationSeconds || inputDurationSeconds <= 0) return;

      const estimatedOutputDuration = Math.max(0.1, inputDurationSeconds / speed);
      const percent = Math.max(0, Math.min(99, (outputTimeSeconds / estimatedOutputDuration) * 100));
      const now = Date.now();
      const shouldEmit =
        percent >= 99 ||
        percent - lastProgressPercent >= 0.75 ||
        now - lastProgressAt >= 700;

      if (!shouldEmit) return;

      lastProgressPercent = percent;
      lastProgressAt = now;
      onProgress(percent);
    };

    const handleProgressLine = (line: string): void => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return;

      const separatorIndex = trimmedLine.indexOf("=");
      if (separatorIndex === -1) return;

      const key = trimmedLine.slice(0, separatorIndex);
      const value = trimmedLine.slice(separatorIndex + 1);

      if (key === "out_time") {
        const outputTimeSeconds = parseTimestampToSeconds(value);
        if (outputTimeSeconds !== null) emitProgressFromOutputTime(outputTimeSeconds);
        return;
      }

      if (key === "progress" && value === "end") {
        onProgress?.(100);
      }
    };

    ffmpeg.stdout.on("data", (chunk: Buffer) => {
      stdoutBuffer += chunk.toString();

      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() || "";

      lines.forEach(handleProgressLine);
    });

    ffmpeg.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      stderrDurationBuffer = (stderrDurationBuffer + text).slice(-4000);

      if (inputDurationSeconds === null) {
        inputDurationSeconds = parseDurationFromFfmpegLog(stderrDurationBuffer);
      }

      // Guarda apenas o final do log para mensagens de erro menores e relevantes.
      if (stderr.length > 8000) {
        stderr = stderr.slice(-8000);
      }
    });

    ffmpeg.on("error", (error) => {
      reject(error);
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        onProgress?.(100);
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `FFmpeg exited with code ${code}`));
    });
  });
}

// Multer salva o upload em disco e bloqueia arquivos que nao sejam audio.
const upload = multer({
  dest: UPLOADS_DIR,
  limits: {
    fileSize: MAX_UPLOAD_SIZE_BYTES
  },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith("audio/")) {
      cb(new Error("Only audio files are allowed"));
      return;
    }

    cb(null, true);
  }
});

// Fluxo principal: recebe audio, normaliza parametros, processa e devolve URLs.
app.post("/convert", (req: Request, res: Response) => {
  console.log("ROUTE /convert HIT");

  upload.single("audio")(req, res, async (err: unknown) => {
    if (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Upload error:", message);

      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: `File exceeds the ${MAX_UPLOAD_SIZE_MB} MB limit` });
      }

      return res.status(400).json({ error: "File too large or invalid" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file received" });
    }

    const inputPath = path.resolve(req.file.path);
    const originalName = path.parse(req.file.originalname).name;
    const safeBaseName = sanitizeBaseFileName(originalName);
    const outputName = `${safeBaseName}-${Date.now()}_slowed.mp3`;
    const outputPath = path.join(OUTPUTS_DIR, outputName);

    // Aceita virgula decimal e prende a velocidade no intervalo exposto pela UI.
    const rawSpeed = String(req.body.speed || "1.0").replace(",", ".");
    let speed = parseFloat(rawSpeed);

    if (isNaN(speed)) speed = 1.0;
    if (speed < 0.5) speed = 0.5;
    if (speed > 2.0) speed = 2.0;
    speed = Number(speed.toFixed(2));

    // Mantem o reverb entre 0 e 100 para espelhar o slider do frontend.
    let reverbAmount = parseInt(req.body.reverb ?? "30");
    if (isNaN(reverbAmount)) reverbAmount = 30;
    if (reverbAmount < 0) reverbAmount = 0;
    if (reverbAmount > 100) reverbAmount = 100;

    let streamStarted = false;

    try {
      streamStarted = true;
      res.status(200);
      res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      writeConvertEvent(res, { type: "progress", percent: 0 });

      await runFfmpeg({
        inputPath,
        outputPath,
        speed,
        reverbAmount,
        onProgress: (percent) => {
          writeConvertEvent(res, { type: "progress", percent });
        }
      });

      deleteFileIfExists(inputPath);
      scheduleFileDeletion(outputPath);

      writeConvertEvent(res, {
        type: "complete",
        fileName: outputName,
        downloadUrl: `/download/${outputName}`,
        previewUrl: `/preview/${outputName}`
      });
      res.end();
    } catch (error) {
      deleteFileIfExists(inputPath);
      deleteFileIfExists(outputPath);

      const message = error instanceof Error ? error.message : String(error);
      console.error("FFmpeg error:", message);

      if (streamStarted) {
        writeConvertEvent(res, { type: "error", error: message });
        res.end();
        return;
      }

      res.status(500).json({ error: message });
    }
  });
});

// Preview toca o arquivo processado diretamente no navegador.
app.get("/preview/:file", (req: Request, res: Response) => {
  const filePath = path.join(OUTPUTS_DIR, req.params.file);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("File not found");
  }

  res.sendFile(filePath);
});

// Download remove o arquivo depois da entrega para reduzir arquivos temporarios.
app.get("/download/:file", (req: Request, res: Response) => {
  const filePath = path.join(OUTPUTS_DIR, req.params.file);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("File not found");
  }

  res.download(filePath, (err) => {
    if (err) {
      console.error("Download error:", err);
      return;
    }

    deleteFileIfExists(filePath);
  });
});

// A UI chama esta rota quando o usuario remove uma conversao ja processada.
app.delete("/delete/:file", (req: Request, res: Response) => {
  const filePath = path.join(OUTPUTS_DIR, req.params.file);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: "File not found" });
  }

  fs.unlink(filePath, (error) => {
    if (error) {
      console.error("Delete error:", error.message);
      return res.status(500).json({ error: "Could not delete file" });
    }

    res.status(204).send();
  });
});

startCleanupJob();

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
