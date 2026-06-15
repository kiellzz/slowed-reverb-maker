interface AudioPreviewElements {
  playButton: HTMLButtonElement | null;
  progressWrap: HTMLElement | null;
  progressFill: HTMLElement | null;
  progressTrack: HTMLElement | null;
  currentTime: HTMLElement | null;
  duration: HTMLElement | null;
}

interface AudioPreviewCallbacks {
  getPlaybackRate: () => number;
  getReverbMix: () => number;
  onReady: () => void;
  onUnavailable: () => void;
  onError: (message: string) => void;
}

export class AudioPreview {
  private audioCtx: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private graphNodes: AudioNode[] = [];
  private rafId: number | null = null;
  private startTime = 0;
  private startOffset = 0;
  private playbackRate = 1;
  private currentOffset = 0;
  private isPlaying = false;
  private decodeId = 0;
  private activeFile: File | null = null;

  constructor(
    private readonly elements: AudioPreviewElements,
    private readonly callbacks: AudioPreviewCallbacks
  ) {
    this.hideControls();
    this.bindControls();
  }

  reset(clearBuffer: boolean): void {
    this.decodeId += 1;
    this.stopSource();
    this.currentOffset = 0;
    this.startOffset = 0;
    this.playbackRate = this.callbacks.getPlaybackRate();

    if (clearBuffer) {
      this.buffer = null;
      this.activeFile = null;
    }

    this.renderProgress(0);
  }

  hideControls(): void {
    this.elements.progressWrap?.classList.add("hidden");
    this.hidePlayButton();
    this.renderProgress(0);
  }

  async decodeFile(file: File): Promise<void> {
    const requestId = ++this.decodeId;
    const ctx = this.getAudioContext();
    this.activeFile = file;

    if (!ctx) {
      this.callbacks.onUnavailable();
      return;
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const decodedBuffer = await ctx.decodeAudioData(arrayBuffer);

      if (requestId !== this.decodeId || this.activeFile !== file) return;

      this.buffer = decodedBuffer;
      this.currentOffset = 0;
      this.startOffset = 0;
      this.showControls();
      this.callbacks.onReady();
    } catch (error) {
      if (requestId !== this.decodeId || this.activeFile !== file) return;

      console.error("Preview decode error:", error);
      this.callbacks.onError("Could not decode audio file.");
    }
  }

  handleSettingsChange(): void {
    if (!this.buffer) return;

    if (!this.isPlaying) {
      this.renderProgress(this.currentOffset);
      return;
    }

    const restartOffset = this.getCurrentBufferOffset();
    this.stopSource();
    this.currentOffset = restartOffset;

    this.startAt(restartOffset).catch((error) => {
      console.error("Preview restart error:", error);
      this.setPlayButtonState(false);
      this.renderProgress(this.currentOffset);
    });
  }

  private bindControls(): void {
    this.elements.playButton?.addEventListener("click", () => {
      this.togglePlayback().catch((error) => {
        console.error("Preview playback error:", error);
      });
    });

    this.elements.progressTrack?.addEventListener("click", (event) => {
      this.seek(event);
    });
  }

  private async togglePlayback(): Promise<void> {
    if (!this.buffer) return;

    if (this.isPlaying) {
      this.pause();
      return;
    }

    await this.startAt(this.currentOffset);
  }

  private seek(event: MouseEvent): void {
    if (!this.buffer || !this.buffer.duration || !this.elements.progressTrack) return;

    const rect = this.elements.progressTrack.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const nextOffset = pct * this.buffer.duration;

    if (this.isPlaying) {
      this.stopSource();
      this.currentOffset = nextOffset;
      this.startAt(nextOffset).catch((error) => {
        console.error("Preview seek error:", error);
        this.setPlayButtonState(false);
        this.renderProgress(this.currentOffset);
      });
      return;
    }

    this.currentOffset = nextOffset;
    this.renderProgress(this.currentOffset);
  }

  private getAudioContext(): AudioContext | null {
    if (this.audioCtx) return this.audioCtx;

    const AudioContextCtor =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

    if (!AudioContextCtor) return null;

    this.audioCtx = new AudioContextCtor();
    return this.audioCtx;
  }

  private createSyntheticImpulseResponse(ctx: AudioContext): AudioBuffer {
    const durationSeconds = 2;
    const length = Math.floor(ctx.sampleRate * durationSeconds);
    const impulse = ctx.createBuffer(2, length, ctx.sampleRate);

    for (let channelIndex = 0; channelIndex < impulse.numberOfChannels; channelIndex += 1) {
      const channel = impulse.getChannelData(channelIndex);

      for (let i = 0; i < length; i += 1) {
        const time = i / ctx.sampleRate;
        const decay = Math.exp(-3.8 * time);
        channel[i] = (Math.random() * 2 - 1) * decay * 0.22;
      }
    }

    return impulse;
  }

  private getCurrentBufferOffset(): number {
    if (!this.buffer) return 0;

    if (!this.isPlaying || !this.audioCtx) {
      return Math.max(0, Math.min(this.buffer.duration, this.currentOffset));
    }

    const elapsedBufferTime = (this.audioCtx.currentTime - this.startTime) * this.playbackRate;
    return Math.max(
      0,
      Math.min(this.buffer.duration, this.startOffset + elapsedBufferTime)
    );
  }

  private async startAt(offset: number): Promise<void> {
    if (!this.buffer) return;

    const ctx = this.getAudioContext();
    if (!ctx) return;

    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    const rate = this.callbacks.getPlaybackRate();
    const mix = this.callbacks.getReverbMix();
    const safeOffset = offset >= this.buffer.duration
      ? 0
      : Math.max(0, Math.min(this.buffer.duration, offset));

    this.stopSource();

    const source = ctx.createBufferSource();
    const dryGain = ctx.createGain();
    const wetGain = ctx.createGain();
    const convolver = ctx.createConvolver();

    source.buffer = this.buffer;
    source.playbackRate.value = rate;
    dryGain.gain.value = 1 - mix;
    wetGain.gain.value = mix;
    convolver.buffer = this.createSyntheticImpulseResponse(ctx);

    source.connect(dryGain).connect(ctx.destination);
    source.connect(convolver).connect(wetGain).connect(ctx.destination);

    this.source = source;
    this.graphNodes = [source, dryGain, convolver, wetGain];
    this.startOffset = safeOffset;
    this.currentOffset = safeOffset;
    this.playbackRate = rate;
    this.startTime = ctx.currentTime;
    this.isPlaying = true;

    source.onended = () => {
      this.handleEnded(source);
    };

    try {
      source.start(0, safeOffset);
    } catch (error) {
      this.source = null;
      this.isPlaying = false;
      this.disconnectGraph();
      throw error;
    }

    this.setPlayButtonState(true);
    this.renderProgress(safeOffset);
    this.startAnimation();
  }

  private pause(): void {
    this.currentOffset = this.getCurrentBufferOffset();
    this.stopSource();
    this.setPlayButtonState(false);
    this.renderProgress(this.currentOffset);
  }

  private handleEnded(source: AudioBufferSourceNode): void {
    if (source !== this.source || !this.isPlaying) return;

    this.cancelAnimation();
    this.isPlaying = false;
    this.source = null;
    this.currentOffset = 0;
    this.startOffset = 0;

    this.disconnectGraph();
    this.setPlayButtonState(false);
    this.renderProgress(0);
  }

  private startAnimation(): void {
    this.cancelAnimation();

    const tick = () => {
      if (!this.isPlaying) return;

      this.renderProgress(this.getCurrentBufferOffset());
      this.rafId = requestAnimationFrame(tick);
    };

    this.rafId = requestAnimationFrame(tick);
  }

  private cancelAnimation(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private stopSource(): void {
    this.cancelAnimation();
    this.isPlaying = false;

    const source = this.source;
    this.source = null;

    if (source) {
      source.onended = null;

      try {
        source.stop();
      } catch {
        // The source may have ended naturally already.
      }
    }

    this.disconnectGraph();
  }

  private disconnectGraph(): void {
    this.graphNodes.forEach((node) => {
      try {
        node.disconnect();
      } catch {
        // A node may already be disconnected after a natural end.
      }
    });

    this.graphNodes = [];
  }

  private showControls(): void {
    this.elements.progressWrap?.classList.remove("hidden");
    this.showPlayButton();
    this.renderProgress(this.currentOffset);
  }

  private hidePlayButton(): void {
    if (!this.elements.playButton) return;

    this.setPlayButtonState(false);
    this.elements.playButton.classList.add("hidden");
  }

  private showPlayButton(): void {
    if (!this.elements.playButton) return;

    this.elements.playButton.classList.remove("hidden");
    this.setPlayButtonState(false);
  }

  private setPlayButtonState(isPlaying: boolean): void {
    if (!this.elements.playButton) return;

    this.elements.playButton.classList.toggle("is-playing", isPlaying);
    this.elements.playButton.textContent = "";
    this.elements.playButton.setAttribute("aria-label", isPlaying ? "Pause preview" : "Play preview");
  }

  private renderProgress(bufferOffset = this.currentOffset): void {
    const rate = this.isPlaying ? this.playbackRate : this.callbacks.getPlaybackRate();
    const bufferDuration = this.buffer?.duration || 0;
    const safeOffset = Math.max(0, Math.min(bufferDuration, bufferOffset));
    const previewDuration = bufferDuration > 0 ? bufferDuration / rate : 0;
    const previewTime = rate > 0 ? safeOffset / rate : 0;
    const progress = bufferDuration > 0 ? (safeOffset / bufferDuration) * 100 : 0;

    if (this.elements.progressFill) this.elements.progressFill.style.width = `${progress}%`;
    if (this.elements.currentTime) this.elements.currentTime.textContent = this.formatTime(previewTime);
    if (this.elements.duration) this.elements.duration.textContent = this.formatTime(previewDuration);
  }

  private formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
  }
}
