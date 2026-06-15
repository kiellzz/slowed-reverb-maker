# 🎧 Slowed + Reverb Maker
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=ffffff)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=ffffff)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=for-the-badge&logo=typescript&logoColor=ffffff)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=ffffff)
![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=ffffff)
![FFmpeg](https://img.shields.io/badge/FFmpeg-007808?style=for-the-badge&logo=ffmpeg&logoColor=ffffff)

---

## 🎬 Demo

> ⚠️ The demo GIF below shows an older version of the UI. The current version features a UI redesign with new controls.

![Demo](./media/media.gif)

🚀 Try it live: https://slowed-reverb-maker.onrender.com/

---

## 🧠 About the Project

This project was built to go beyond a simple audio converter, focusing on:

* Polished UI/UX
* Real-time feedback
* Smooth interactions

Users can select an audio file, customize playback speed and reverb intensity, preview the effect locally before uploading, process it on the backend, and download the processed version.

---

## ✨ Features

### 🎛 Audio Processing

* Adjustable speed (0.5x – 2.0x)
* Adjustable reverb intensity (0 – 100%)
* Local Web Audio API preview before upload
* Synthetic stereo impulse response for preview reverb
* Slowed + reverb effect via FFmpeg
* Dynamic audio normalization
* Output ready for download

---

### 🎨 Modern UI/UX

* Space-themed dark UI with glassmorphism
* Animated starfield background
* Gradient title animation
* Responsive layout (mobile-friendly)
* Smooth transitions and microinteractions

---

### 📂 File Handling

* Drag & drop support
* In-card file preview with play/pause controls
* Interactive audio progress bar with click-to-seek
* Live preview updates when speed or reverb sliders change
* File metadata display (name + size)
* Remove file with cleanup on backend

---

### 📊 Smart Progress System

* Real upload progress (via XMLHttpRequest)
* Simulated processing stage for better UX
* Status states:
  * Preparing local preview
  * Preview ready
  * Uploading...
  * Processing...
  * Finalizing...
* Smooth animated progress bar

---

### 🕘 History System

* Stores last processed audios (localStorage)
* Quick re-download access
* Delete items manually
* Auto-removal when file expires

---

### 🧹 File Lifecycle Management

* Temporary storage system:
  * `/uploads` → raw files
  * `/outputs` → processed files
* Auto cleanup after a few minutes
* Manual deletion via UI

---

## 🛠 Tech Stack

### Frontend
* HTML5
* CSS3 (custom UI, animations)
* Vanilla TypeScript (no frameworks)

### Backend
* Node.js
* Express
* Multer (file upload)
* FFmpeg (audio processing)

### Deployment
* Render

Render settings:

```text
Root Directory: backend
Build Command: npm ci --include=dev && npm run build
Pre-Deploy Command: leave empty
Start Command: npm start
```

---

## Local Development

```bash
cd backend
npm ci
npm run build
npm start
```

The TypeScript sources are `backend/server.ts` and `frontend/main.ts`. The build generates runtime JavaScript inside `backend/dist/`.

---

## ⚙️ How It Works

1. User selects an audio file
2. The browser decodes it with the Web Audio API and shows an in-card preview
3. Preview playback applies the selected speed and dry/wet reverb mix locally
4. When the user clicks process, the file is sent to the backend (`/convert`)
5. FFmpeg processes the audio with filters:
```
asetrate=44100*speed, aresample=44100, aecho (multi-reflection reverb), dynaudnorm
```
6. Processed file is stored temporarily
7. User can:
   * download result
8. Files are automatically deleted after some time

---

## 📦 Project Structure

```
/frontend
  index.html
  style.css
  main.ts
/backend
  server.ts
  tsconfig.json
  /uploads
  /outputs
/media
  media.mp4
```

---

## 👨‍💻 Author

Developed by **Ezequiel Borges**

* GitHub: https://github.com/kiellzz
* LinkedIn: https://linkedin.com/in/ezequielborgesdev/
