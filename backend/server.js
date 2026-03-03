const express = require("express");
const multer = require("multer");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

// CORS simples
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST");
  next();
});

// Frontend
const frontendPath = path.join(__dirname, "..", "frontend");
app.use(express.static(frontendPath));

app.get("/", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

// Pastas
["uploads", "outputs"].forEach(dir => {
  const fullPath = path.join(__dirname, dir);
  if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath);
});

// Multer
const upload = multer({
  dest: path.join(__dirname, "uploads"),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

// CONVERT
app.post("/convert", (req, res) => {
  console.log("ROUTE /convert HIT");
  upload.single("audio")(req, res, err => {
    if (err) {
      console.error("Upload error:", err.message);
      return res.status(400).json({ error: "File too large or invalid" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file received" });
    }

    const inputPath = path.resolve(req.file.path);

    const originalName = path.parse(req.file.originalname).name;
    const outputName = `${originalName}_slowed.mp3`;
    const outputPath = path.join(__dirname, "outputs", outputName);

    // 🔒 RECEBE E VALIDA VELOCIDADE
    let speed = parseFloat(req.body.speed);

    if (isNaN(speed)) speed = 1.0;
    if (speed < 0.5) speed = 0.5;
    if (speed > 2.0) speed = 2.0;

    // Limita para 2 casas decimais
    speed = Number(speed.toFixed(2));

    // 🎧 FILTRO ATUALIZADO
    const filter = `asetrate=44100*${speed},aresample=44100`;
    
    const ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg";

    const command = `"${ffmpegPath}" -y -i "${inputPath}" -filter:a "${filter}" "${outputPath}"`;

    exec(command, (error, stdout, stderr) => {
      fs.unlink(inputPath, () => {});

      if (error) {
  console.error("FFmpeg error:", stderr);
  return res.status(500).json({ error: stderr });
}

      res.json({
        downloadUrl: `/download/${outputName}`
      });
    });
  });
});

// DOWNLOAD + DELETE
app.get("/download/:file", (req, res) => {
  const filePath = path.join(__dirname, "outputs", req.params.file);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("File not found");
  }

  res.download(filePath, err => {
    if (err) {
      console.error("Download error:", err);
      return;
    }

    fs.unlink(filePath, () => {
      console.log("Deleted:", req.params.file);
    });
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
