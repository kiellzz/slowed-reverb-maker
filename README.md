# 🎵 Slowed + Reverb Maker

> Transforme qualquer áudio em versão slowed. Projeto em **fase inicial** para aprendizado e testes.

---

## 🗂 Estrutura do projeto
slowed-reverb-maker/
├─ frontend/
│ ├─ index.html
│ ├─ style.css
│ └─ main.js
├─ backend/
│ ├─ server.js
│ ├─ uploads/ # arquivos temporários enviados
│ └─ outputs/ # arquivos processados
├─ .gitignore
└─ README.md


---

## ⚙ Funcionalidades

- Upload de arquivos de áudio (`.mp3`, `.wav` etc.)
- Processamento para versão slowed + reverb
- Armazenamento local dos arquivos processados na pasta `outputs`

---

## 📦 Dependências

- Node.js
- express e multer para backend
- FFmpeg instalado no sistema

Instalação no backend:

- cd backend
- npm install express multer

## Como rodar localmente

Clone o repositório
git clone https://github.com/kiellzz/slowed-reverb-maker.git

Instale as dependencias no backend
cd backend
npm install

Ajuste o caminho no FFmpeg no server.js, se estiver no Windows
const ffmpegPath = "C:\\ffmpeg\\bin\\ffmpeg.exe";

Inicie o servidor
node server.js

Abra no navegador
http://localhost:3000






