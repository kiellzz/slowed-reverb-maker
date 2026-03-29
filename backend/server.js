const express = require("express");
const multer = require("multer");
const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

const UPLOADS_DIR = path.join(__dirname, "uploads");
const OUTPUTS_DIR = path.join(__dirname, "outputs");

const MAX_FILE_AGE_MS = 10 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000;
const OUTPUT_SAMPLE_RATE = 44100;
const OUTPUT_CHANNELS = 2;
const OUTPUT_AUDIO_BITRATE = "128k";
const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

const frontendPath = path.join(__dirname, "..", "frontend");
app.use(express.static(frontendPath));

app.get("/", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

[UPLOADS_DIR, OUTPUTS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

function deleteFileIfExists(filePath) {
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

function scheduleFileDeletion(filePath, delay = MAX_FILE_AGE_MS) {
  setTimeout(() => {
    deleteFileIfExists(filePath);
  }, delay);
}

function cleanupOldFiles(directory, maxAgeMs) {
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

function startCleanupJob() {
  const runCleanup = () => {
    console.log("Running cleanup job...");
    cleanupOldFiles(UPLOADS_DIR, MAX_FILE_AGE_MS);
    cleanupOldFiles(OUTPUTS_DIR, MAX_FILE_AGE_MS);
  };

  runCleanup();
  setInterval(runCleanup, CLEANUP_INTERVAL_MS);
}

function sanitizeBaseFileName(name) {
  return name.replace(/[^\w\-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "audio";
}

function runFfmpeg({ inputPath, outputPath, speed }) {
  return new Promise((resolve, reject) => {
    const ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg";
    const filter = `asetrate=${OUTPUT_SAMPLE_RATE}*${speed},aresample=${OUTPUT_SAMPLE_RATE}`;
    const args = [
      "-y",
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

    ffmpeg.stderr.on("data", (chunk) => {
      stderr += chunk.toString();

      if (stderr.length > 8000) {
        stderr = stderr.slice(-8000);
      }
    });

    ffmpeg.on("error", (error) => {
      reject(error);
    });

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(stderr.trim() || `FFmpeg exited with code ${code}`));
    });
  });
}

const upload = multer({
  dest: UPLOADS_DIR,
  limits: {
    fileSize: MAX_UPLOAD_SIZE_BYTES
  },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype || !file.mimetype.startsWith("audio/")) {
      cb(new Error("Only audio files are allowed"));
      return;
    }

    cb(null, true);
  }
});

app.post("/convert", (req, res) => {
  console.log("ROUTE /convert HIT");

  upload.single("audio")(req, res, async (err) => {
    if (err) {
      console.error("Upload error:", err.message);
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

    let rawSpeed = String(req.body.speed || "1.0").replace(",", ".");
    let speed = parseFloat(rawSpeed);

    if (isNaN(speed)) speed = 1.0;
    if (speed < 0.5) speed = 0.5;
    if (speed > 2.0) speed = 2.0;

    speed = Number(speed.toFixed(2));

    try {
      await runFfmpeg({ inputPath, outputPath, speed });

      deleteFileIfExists(inputPath);
      scheduleFileDeletion(outputPath);

      res.json({
        fileName: outputName,
        downloadUrl: `/download/${outputName}`,
        previewUrl: `/preview/${outputName}`
      });
    } catch (error) {
      deleteFileIfExists(inputPath);
      deleteFileIfExists(outputPath);

      console.error("FFmpeg error:", error.message);
      res.status(500).json({ error: error.message });
    }
  });
});

app.get("/preview/:file", (req, res) => {
  const filePath = path.join(OUTPUTS_DIR, req.params.file);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("File not found");
  }

  res.sendFile(filePath);
});

app.get("/download/:file", (req, res) => {
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

app.delete("/delete/:file", (req, res) => {
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
