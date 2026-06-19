/**
 * Upload rendered clips to Vercel Blob and seed Postgres from the pipeline manifest.
 *
 *   1. python pipeline/run.py all   # produces pipeline/out/manifest.json + wavs
 *   2. npm run db:push              # sync schema
 *   3. npm run db:seed              # this script
 *
 * Idempotent. If BLOB_READ_WRITE_TOKEN is set, clips go to Vercel Blob; otherwise they're
 * copied into public/clips and served locally so the app still works without Blob.
 */
import "dotenv/config";
import { readFile, copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { put } from "@vercel/blob";

const ROOT = process.cwd();
const OUT = path.join(ROOT, "pipeline", "out");
const PUBLIC_CLIPS = path.join(ROOT, "public", "clips");

type Manifest = {
  stacks: { id: string; name: string; stt: string; llm: string; tts: string; turns: string; isHuman: boolean }[];
  scenarios: { id: string; label: string; type: "interrupt" | "pause" | "accent" | "clean"; insight: string }[];
  clips: { scenarioId: string; stackId: string; file: string; durationSec: number; transcript: unknown }[];
};

async function uploadClip(file: string): Promise<string> {
  const localPath = path.join(OUT, file);
  if (!existsSync(localPath)) throw new Error(`Missing rendered clip: ${file}. Run the pipeline first.`);

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    const data = await readFile(localPath);
    const blob = await put(`clips/${file}`, data, {
      access: "public",
      contentType: "audio/wav",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return blob.url;
  }

  // Local fallback: copy into public/clips and serve from there.
  await mkdir(PUBLIC_CLIPS, { recursive: true });
  await copyFile(localPath, path.join(PUBLIC_CLIPS, file));
  return `/clips/${file}`;
}

async function main() {
  const manifestPath = path.join(OUT, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error("pipeline/out/manifest.json not found. Run `python pipeline/run.py all` first.");
  }
  const manifest = JSON.parse(await readFile(manifestPath, "utf-8")) as Manifest;

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  console.log(`Seeding ${manifest.stacks.length} stacks, ${manifest.scenarios.length} scenarios, ${manifest.clips.length} clips`);
  console.log(process.env.BLOB_READ_WRITE_TOKEN ? "→ uploading to Vercel Blob" : "→ no Blob token; copying to public/clips");

  for (const s of manifest.stacks) {
    await prisma.stack.upsert({
      where: { id: s.id },
      create: s,
      update: { name: s.name, stt: s.stt, llm: s.llm, tts: s.tts, turns: s.turns, isHuman: s.isHuman },
    });
  }

  for (const sc of manifest.scenarios) {
    await prisma.scenario.upsert({
      where: { id: sc.id },
      create: { id: sc.id, label: sc.label, type: sc.type, insight: sc.insight },
      update: { label: sc.label, type: sc.type, insight: sc.insight },
    });
  }

  for (const c of manifest.clips) {
    const url = await uploadClip(c.file);
    await prisma.clip.upsert({
      where: { scenarioId_stackId: { scenarioId: c.scenarioId, stackId: c.stackId } },
      create: {
        scenarioId: c.scenarioId,
        stackId: c.stackId,
        blobUrl: url,
        durationSec: c.durationSec,
        transcript: c.transcript as object,
      },
      update: { blobUrl: url, durationSec: c.durationSec, transcript: c.transcript as object },
    });
    console.log(`  ✓ ${c.scenarioId} × ${c.stackId} → ${url}`);
  }

  await prisma.$disconnect();
  console.log("Seed complete.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
