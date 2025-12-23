const express = require("express");
const multer = require("multer");
const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = 3000;

// permitir requisições do frontend
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST");
  next();
});

// caminho absoluto do frontend
const frontendPath = path.join(__dirname, "..", "frontend");
app.use(express.static(frontendPath));

// garantir pastas
["uploads", "outputs"].forEach(dir => {
  const fullPath = path.join(__dirname, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath);
  }
});

const upload = multer({
  dest: path.join(__dirname, "uploads")
});

app.post("/convert", upload.single("audio"), (req, res) => {
  console.log("POST /convert hit");

  if (!req.file) {
    return res.status(400).json({ error: "No file received" });
  }

  const inputPath = req.file.path;
  const outputPath = path.join(__dirname, "outputs", `slowed_${Date.now()}.mp3`);

  const naturalSlowed = 'asetrate=44100*0.9,aresample=44100,atempo=1.0';
  const ffmpegPath = "C:\\ffmpeg\\bin\\ffmpeg.exe"; // ajuste para o seu local
  const command = `"${ffmpegPath}" -y -i "${inputPath}" -filter:a "${naturalSlowed}" "${outputPath}"`;

  exec(command, (error, stdout, stderr) => {
    fs.unlink(inputPath, () => {}); // remove temporário

    if (error) {
      console.error("FFmpeg error:", stderr);
      return res.status(500).json({ error: "FFmpeg failed" });
    }

    console.log("Conversion finished");
    // só retorna status de sucesso, sem URL de download
    res.json({ message: "Audio processed successfully" });
  });
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
