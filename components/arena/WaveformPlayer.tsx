"use client";

import { useEffect, useRef, useState } from "react";
import { formatTime } from "@/lib/format";

const bars = [0.18, 0.44, 0.72, 0.95, 0.68, 0.38, 0.24, 0.5, 0.82, 0.58, 0.34, 0.66, 0.9, 0.48, 0.28, 0.62, 0.76, 0.42, 0.2, 0.56, 0.86, 0.7, 0.36, 0.52];

export function WaveformPlayer({
  src,
  color,
  durationSec,
  playing,
  onProgress,
  onEnded,
  onError,
  label
}: {
  src: string;
  color: string;
  durationSec: number;
  playing: boolean;
  onProgress: (progress: number, played: boolean) => void;
  onEnded: () => void;
  onError: () => void;
  label: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [time, setTime] = useState(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);
    const gap = 5;
    const barWidth = Math.max(3, (rect.width - gap * (bars.length - 1)) / bars.length);
    bars.forEach((height, index) => {
      const x = index * (barWidth + gap);
      const h = Math.max(8, height * (rect.height - 22));
      const y = (rect.height - h) / 2;
      ctx.fillStyle = index / bars.length <= progress ? color : "rgba(242,240,234,.16)";
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, h, 99);
      ctx.fill();
    });
  }, [color, progress]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      void audio.play().catch(onError);
    } else {
      audio.pause();
    }
  }, [playing, onError]);

  return (
    <div>
      <div
        className="wave-shell"
        aria-label={`${label}, ${formatTime(durationSec)} audio clip, ${playing ? "playing" : "paused"}`}
        role="img"
        style={{ "--progress": progress } as React.CSSProperties}
      >
        <canvas ref={canvasRef} aria-hidden="true" />
        <span className="wave-playhead" aria-hidden="true" />
        <span className="wave-draw-mask" aria-hidden="true" />
      </div>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onTimeUpdate={(event) => {
          const target = event.currentTarget;
          const nextProgress = target.duration ? target.currentTime / target.duration : target.currentTime / durationSec;
          setProgress(Math.min(1, nextProgress));
          setTime(target.currentTime);
          onProgress(nextProgress, target.currentTime > 0.25);
        }}
        onEnded={() => {
          setProgress(1);
          onProgress(1, true);
          onEnded();
        }}
        onError={onError}
      />
      <div className="timer-row" aria-hidden="true">
        <span>{formatTime(time)}</span>
        <span>{formatTime(durationSec)}</span>
      </div>
    </div>
  );
}
