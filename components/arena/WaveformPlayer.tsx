"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatTime } from "@/lib/format";
import type { CaptionSegment } from "@/lib/types";

const BAR_COUNT = 64;
// Shown until the real waveform decodes (or if a cross-origin decode fails).
const PLACEHOLDER = Array.from({ length: BAR_COUNT }, (_, i) => 0.28 + 0.32 * Math.abs(Math.sin(i * 0.7)));

// Decode once per URL, then reuse — clips are static, so the peaks never change.
const peaksCache = new Map<string, number[]>();
let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  audioCtx = audioCtx ?? new Ctor();
  return audioCtx;
}

// Fetch the clip bytes and reduce the samples to BAR_COUNT RMS buckets (a real waveform).
async function computePeaks(src: string): Promise<number[]> {
  const cached = peaksCache.get(src);
  if (cached) return cached;
  const ctx = getCtx();
  if (!ctx) return PLACEHOLDER;
  const res = await fetch(src);
  const buf = await res.arrayBuffer();
  const audio = await ctx.decodeAudioData(buf);
  const data = audio.getChannelData(0);
  const bucket = Math.floor(data.length / BAR_COUNT) || 1;
  const peaks: number[] = [];
  let max = 0;
  for (let i = 0; i < BAR_COUNT; i += 1) {
    let sum = 0;
    const start = i * bucket;
    for (let j = 0; j < bucket; j += 1) {
      const s = data[start + j] ?? 0;
      sum += s * s;
    }
    const rms = Math.sqrt(sum / bucket);
    peaks.push(rms);
    if (rms > max) max = rms;
  }
  const norm = peaks.map((p) => (max > 0 ? Math.min(1, p / max) : 0));
  peaksCache.set(src, norm);
  return norm;
}

export function WaveformPlayer({
  src,
  color,
  durationSec,
  playing,
  caption,
  onProgress,
  onEnded,
  onError,
  label
}: {
  src: string;
  color: string;
  durationSec: number;
  playing: boolean;
  caption?: CaptionSegment[];
  onProgress: (progress: number, played: boolean) => void;
  onEnded: () => void;
  onError: () => void;
  label: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [progress, setProgress] = useState(0);
  const [time, setTime] = useState(0);
  const [peaks, setPeaks] = useState<number[]>(PLACEHOLDER);

  // Decode the real waveform for this clip (cross-origin fetch + Web Audio).
  useEffect(() => {
    let alive = true;
    setPeaks(peaksCache.get(src) ?? PLACEHOLDER);
    computePeaks(src)
      .then((p) => {
        if (alive) setPeaks(p);
      })
      .catch(() => {
        /* keep placeholder bars — playback still works */
      });
    return () => {
      alive = false;
    };
  }, [src]);

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
    const gap = rect.width / peaks.length < 6 ? 2 : 4;
    const barWidth = Math.max(2, (rect.width - gap * (peaks.length - 1)) / peaks.length);
    peaks.forEach((height, index) => {
      const x = index * (barWidth + gap);
      const h = Math.max(4, height * (rect.height - 18));
      const y = (rect.height - h) / 2;
      ctx.fillStyle = index / peaks.length <= progress ? color : "rgba(242,240,234,.16)";
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, h, 99);
      ctx.fill();
    });
  }, [color, progress, peaks]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (playing) {
      void audio.play().catch(onError);
    } else {
      audio.pause();
    }
  }, [playing, onError]);

  const active = useMemo(() => {
    if (!caption?.length) return null;
    return caption.find((seg) => time >= seg.start && time < seg.end) ?? null;
  }, [caption, time]);

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
      </div>
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        crossOrigin="anonymous"
        onTimeUpdate={(event) => {
          const target = event.currentTarget;
          const nextProgress = target.duration ? target.currentTime / target.duration : target.currentTime / durationSec;
          setProgress(Math.min(1, nextProgress));
          setTime(target.currentTime);
          onProgress(nextProgress, target.currentTime > 0.25);
        }}
        onEnded={() => {
          setProgress(1);
          setTime(durationSec);
          onProgress(1, true);
          onEnded();
        }}
        onError={onError}
      />
      <div className="timer-row" aria-hidden="true">
        <span>{formatTime(time)}</span>
        <span>{formatTime(durationSec)}</span>
      </div>
      {caption?.length ? (
        <p className="caption-line" data-on={Boolean(active)} aria-live="off">
          {active ? (
            <>
              <span className="caption-who" data-who={active.speaker}>
                {active.speaker}
              </span>
              <span className="caption-text">{active.text}</span>
            </>
          ) : (
            <span className="caption-text muted">Live transcript — play to follow along.</span>
          )}
        </p>
      ) : null}
    </div>
  );
}
