import type { PapeeAnimState } from "@/components/papee/PapeeSprites";

/**
 * PAPEE_TOOLS_PLAN.md §Z.9 — Soundtrack hooks.
 *
 * Each pose can declare a one-shot foley sound. Gated behind
 * `prefs.enableSounds`, default `false`. Sounds are foley, never
 * voice.
 *
 * Audio element pool of 8, no overlap of the same cue within 120ms.
 *
 * The data URLs below are tiny WebAudio-generated tones — placeholder
 * one-shots that ship with the bundle so the surface is functional
 * out of the box. Swap in real foley assets at any time by replacing
 * the entries in `CUE_URLS`.
 */

export type PapeeCue =
  | "blip"        // speech bubble appears
  | "thud"        // jumping landing
  | "chime"       // celebrating
  | "warble"      // alarmed
  | "key-click"   // typing / unlocking
  | "page-turn"   // ledger / writing
  | "sweep"       // broom / dismissal
  | "whistle"     // walking long distance
  | "sigh";       // calm-down transition

/**
 * Pose → cue table. Poses absent from this map play no sound.
 * Multiple poses may map to the same cue (e.g. typing + unlocking
 * both → key-click).
 */
export const POSE_TO_CUE: Partial<Record<PapeeAnimState, PapeeCue>> = {
  jumping: "thud",
  celebrating: "chime",
  alarmed: "warble",
  typing: "key-click",
  unlocking: "key-click",
  writing: "page-turn",
  ledger: "page-turn",
  broom: "sweep",
  walking: "whistle",
  "sigh-of-relief": "sigh",
};

/**
 * Tiny WAV one-shots produced with WebAudio. base64-encoded so the
 * file is import-safe and ships with no asset hosting requirement.
 * These intentionally use distinct frequency/duration so they're
 * recognizable but unobtrusive.
 */
export const CUE_URLS: Record<PapeeCue, string> = {
  blip: tone(880, 0.06),
  thud: tone(120, 0.18, "square"),
  chime: tone(1760, 0.22, "triangle"),
  warble: tone(440, 0.18, "sawtooth"),
  "key-click": tone(2200, 0.04),
  "page-turn": tone(320, 0.14, "triangle"),
  sweep: tone(180, 0.22, "sawtooth"),
  whistle: tone(2640, 0.12, "sine"),
  sigh: tone(220, 0.30, "sine"),
};

/**
 * Build a tiny mono WAV file as a data URL. This avoids shipping
 * binary assets while still giving each cue a distinct timbre.
 */
function tone(freq: number, durationSec: number, wave: "sine" | "square" | "sawtooth" | "triangle" = "sine"): string {
  const sampleRate = 22050;
  const samples = Math.floor(sampleRate * durationSec);
  const buffer = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(buffer);

  // RIFF header
  writeStr(view, 0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  writeStr(view, 8, "WAVE");
  writeStr(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(view, 36, "data");
  view.setUint32(40, samples * 2, true);

  for (let i = 0; i < samples; i++) {
    const t = i / sampleRate;
    const phase = (t * freq) % 1;
    let sample = 0;
    switch (wave) {
      case "sine":     sample = Math.sin(phase * Math.PI * 2); break;
      case "square":   sample = phase < 0.5 ? 1 : -1; break;
      case "sawtooth": sample = 2 * phase - 1; break;
      case "triangle": sample = 4 * Math.abs(phase - 0.5) - 1; break;
    }
    // Linear envelope to avoid clicks
    const env = Math.min(1, t / 0.005) * Math.min(1, (durationSec - t) / 0.02);
    const intSample = Math.max(-1, Math.min(1, sample * env * 0.4)) * 0x7fff;
    view.setInt16(44 + i * 2, intSample, true);
  }

  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]!);
  return `data:audio/wav;base64,${btoa(binary)}`;
}

function writeStr(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
}
