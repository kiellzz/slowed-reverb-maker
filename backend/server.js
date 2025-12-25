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

const upload = multer({
  dest: path.join(__dirname, "uploads")
});

// CONVERT
app.post("/convert", upload.single("audio"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file received" });
  }

  const inputPath = req.file.path;
  const outputName = `slowed_${Date.now()}.mp3`;
  const outputPath = path.join(__dirname, "outputs", outputName);

  const filter = "asetrate=44100*0.9,aresample=44100,atempo=1.0";
  const ffmpegPath = process.env.FFMPEG_PATH || "ffmpeg";

  const command = `"${ffmpegPath}" -y -i "${inputPath}" -filter:a "${filter}" "${outputPath}"`;

  exec(command, (error, stdout, stderr) => {
    fs.unlink(inputPath, () => {});

    if (error) {
      console.error(stderr);
      return res.status(500).json({ error: "FFmpeg failed" });
    }

    res.json({
      downloadUrl: `/download/${outputName}`
    });
  });
});

// DOWNLOAD + DELETE (aqui está o segredo)
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

    // 🔥 apaga SOMENTE depois que o download termina
    fs.unlink(filePath, () => {
      console.log("Deleted:", req.params.file);
    });
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
