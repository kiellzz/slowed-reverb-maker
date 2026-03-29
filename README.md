## Slowed + Reverb Maker

A simple web app to transform any audio/song into a slowed + reverb effect.

## Try It Online

[slowed-reverb-maker.onrender.com](https://slowed-reverb-maker.onrender.com/)

Upload any audio file (MP3, WAV, etc.)
File size: maximum 10 MB

## Tech Stack

Frontend: HTML, CSS, JavaScript
Backend: Node.js, Express, Multer, FFmpeg
Deployment: Render

## Deploy Notes

The backend is tuned for lightweight deploys:
- uses `spawn` instead of `exec` for FFmpeg jobs
- strips metadata and ignores video streams
- exports MP3 at `128k`, `44.1kHz`, stereo for faster processing
- keeps upload size limited to 10 MB
