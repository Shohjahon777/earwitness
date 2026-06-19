// Dev/mock fallback only. Real clips are pre-rendered by the offline pipeline and served
// straight from their Vercel Blob URLs (Clip.blobUrl). This synth keeps the mock data layer
// (lib/mock-api.ts) audible without any stored files.
const clips: Record<string, { freq: number; seconds: number }> = {
  "channel-a": { freq: 220, seconds: 14 },
  "channel-b": { freq: 277, seconds: 16 },
  human: { freq: 196, seconds: 15 }
};

export function GET(_request: Request, { params }: { params: Promise<{ clip: string }> }) {
  return params.then(({ clip }) => {
    const config = clips[clip] ?? clips["channel-a"];
    const body = wavBytes(config.freq, config.seconds);
    return new Response(body, {
      headers: {
        "content-type": "audio/wav",
        "cache-control": "public, max-age=31536000, immutable"
      }
    });
  });
}

function wavBytes(freq: number, seconds: number) {
  const sampleRate = 44_100;
  const samples = Math.floor(sampleRate * seconds);
  const dataSize = samples * 2;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  for (let i = 0; i < samples; i += 1) {
    const t = i / sampleRate;
    const attack = Math.min(1, i / 2205);
    const release = Math.min(1, (samples - i) / 4410);
    const envelope = Math.max(0, Math.min(attack, release));
    const wobble = Math.sin(2 * Math.PI * 2.2 * t) * 0.025;
    const voiceish =
      Math.sin(2 * Math.PI * (freq + wobble * freq) * t) * 0.52 +
      Math.sin(2 * Math.PI * freq * 2.01 * t) * 0.18;
    view.setInt16(44 + i * 2, Math.max(-1, Math.min(1, voiceish * envelope)) * 24000, true);
  }

  return new Uint8Array(buffer);
}

function writeString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i += 1) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}
