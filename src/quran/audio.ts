// Audio : sourate complète + minutage de chaque verset et de chaque mot (quran.com).
// On découpe toujours sur des frontières de versets, sans jamais altérer la récitation.
import path from "node:path";
import { PATHS } from "../config.ts";
import { downloadFile, fetchJson } from "../lib/http.ts";
import { run } from "../lib/proc.ts";
import type { Reciter } from "./reciters.ts";

const QDC = "https://api.qurancdn.com/api/qdc/audio/reciters";

/** [position du mot, début ms, fin ms] dans le fichier de la sourate. */
export type WordSegment = [number, number, number];

export interface VerseTiming {
  key: string;
  fromMs: number;
  toMs: number;
  segments: WordSegment[];
}

export interface SurahAudio {
  url: string;
  timings: Map<string, VerseTiming>;
}

interface ApiAudioFiles {
  audio_files: Array<{
    audio_url: string;
    verse_timings: Array<{
      verse_key: string;
      timestamp_from: number;
      timestamp_to: number;
      segments?: unknown[];
    }>;
  }>;
}

export async function getSurahAudio(reciter: Reciter, surah: number): Promise<SurahAudio> {
  const data = await fetchJson<ApiAudioFiles>(`${QDC}/${reciter.qdcId}/audio_files?chapter=${surah}&segments=true`);
  const file = data.audio_files[0];
  if (!file) throw new Error(`Pas d'audio pour la sourate ${surah} (${reciter.name}).`);
  const timings = new Map<string, VerseTiming>();
  for (const vt of file.verse_timings) {
    const segments = (vt.segments ?? [])
      .filter((s): s is number[] => Array.isArray(s) && s.length >= 3)
      .map((s) => [s[0], s[1], s[2]] as WordSegment);
    timings.set(vt.verse_key, { key: vt.verse_key, fromMs: vt.timestamp_from, toMs: vt.timestamp_to, segments });
  }
  return { url: file.audio_url, timings };
}

export async function downloadSurahAudio(reciter: Reciter, surah: number, url: string): Promise<string> {
  const ext = path.extname(new URL(url).pathname) || ".mp3";
  const dest = path.join(PATHS.cache, "audio", reciter.slug, `${String(surah).padStart(3, "0")}${ext}`);
  return downloadFile(url, dest);
}

/** Extrait [start, end] (secondes) en AAC, avec de courts fondus pour éviter les clics. */
export async function cutAudio(src: string, dest: string, startSec: number, endSec: number): Promise<void> {
  const duration = endSec - startSec;
  const fadeOut = Math.min(0.5, duration / 4);
  await run("ffmpeg", [
    "-v", "error", "-y",
    "-ss", startSec.toFixed(3),
    "-i", src,
    "-t", duration.toFixed(3),
    // Les MP3 embarquent parfois une pochette : on ne garde que le son.
    "-map", "0:a:0", "-vn",
    "-af", `afade=t=in:st=0:d=0.06,afade=t=out:st=${(duration - fadeOut).toFixed(3)}:d=${fadeOut.toFixed(3)}`,
    "-ac", "2", "-ar", "44100", "-c:a", "aac", "-b:a", "192k",
    dest,
  ]);
}
