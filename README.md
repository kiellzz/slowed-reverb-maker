# 🎧 Slowed + Reverb Maker

![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=ffffff)
![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=ffffff)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=000000)
![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=ffffff)
![Express](https://img.shields.io/badge/Express-000000?style=for-the-badge&logo=express&logoColor=ffffff)
![FFmpeg](https://img.shields.io/badge/FFmpeg-007808?style=for-the-badge&logo=ffmpeg&logoColor=ffffff)

---

## 🎬 Demo

![Demo](./media/media.gif)

🚀 Try it live: https://slowed-reverb-maker.onrender.com/

---

## 🧠 About the Project

This project was built to go beyond a simple audio converter, focusing on:

* polished UI/UX
* real-time feedback
* smooth interactions

Users can upload an audio file, customize playback speed, preview the result, and download the processed version.

---

## ✨ Features

### 🎛 Audio Processing

* Adjustable speed (0.5x – 2.0x)
* Slowed + reverb effect via FFmpeg
* Output ready for download

---

### 🎨 Modern UI/UX

* Glassmorphism + gradient dark theme
* Animated background (subtle color transitions)
* Responsive layout (mobile-friendly)
* Smooth transitions and microinteractions

---

### 📂 File Handling

* Drag & drop support
* File preview (play/pause before download)
* File metadata display (name + size)
* Remove file with cleanup on backend

---

### 📊 Smart Progress System

* Real upload progress (via XMLHttpRequest)
* Simulated processing stage for better UX
* Status states:

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
* Vanilla JavaScript (no frameworks)

### Backend

* Node.js
* Express
* Multer (file upload)
* FFmpeg (audio processing)

### Deployment

* Render

---

## ⚙️ How It Works

1. User uploads an audio file  
2. File is sent to the backend (`/convert`)  
3. FFmpeg processes the audio with filters:

```

asetrate=44100*speed,aresample=44100

```

4. Processed file is stored temporarily  
5. User can:

* preview audio  
* download result  

6. Files are automatically deleted after some time  

---

## 📦 Project Structure

```

/frontend
index.html
style.css
main.js

/backend
server.js
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

