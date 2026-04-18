import {
  Arms,
  Body,
  Crown,
  Eyebrows,
  Eyes,
  GroundShadow,
  Legs,
  Mouth,
  PapeeDefs,
  type ArmsState,
  type EyebrowState,
  type EyesState,
  type LegsState,
  type MouthState,
  type PapeeAnimState,
} from "./PapeeSprites";

/**
 * PAPEE_TOOLS_PLAN.md §Z.10 — Pose blend masks.
 *
 * The sprite is split into four regions:
 *
 *     +---+---+
 *     |head|   |
 *     +----+arm|
 *     |body|   |
 *     +---+---+
 *     |  legs |
 *     +---+---+
 *
 * Each region can independently adopt a region-state from a compatible
 * pose. Some poses (`celebrating`, `jumping`, `alarmed`) lock all four
 * regions because their movement is whole-body — blending them with
 * anything else looks broken. Compatibility is enforced here in code,
 * not in art, so adding new poses just means adding a row to the
 * decomposition table.
 *
 * Usage:
 *
 *   <BlendedPapeePose head="magnifying" body="walking" arms="walking" legs="walking" />
 *   → Papee walking while scanning with a loupe.
 */

export interface PoseRegions {
  eyebrows: EyebrowState;
  eyes: EyesState;
  mouth: MouthState;
  arms: ArmsState;
  legs: LegsState;
  /** Optional decoration (sweat drops, sparkles, Zzz, ThinkingDots) — currently unused
   *  in blends since decorations belong to whole-body locked poses. */
  decoration?: "none";
}

const LOCKED: ReadonlySet<PapeeAnimState> = new Set([
  "celebrating",
  "jumping",
  "alarmed",
]);

/**
 * Region decomposition for every pose. Mirrors the assemblies in
 * PapeeSprites.PapeePose so blending stays consistent with the atomic
 * renderings.
 */
const POSE_REGIONS: Record<PapeeAnimState, PoseRegions> = {
  idle:               { eyebrows: "neutral",   eyes: "open",   mouth: "smile", arms: "down",         legs: "stand"  },
  "idle-blink":       { eyebrows: "neutral",   eyes: "closed", mouth: "smile", arms: "down",         legs: "stand"  },
  "idle-look-around": { eyebrows: "neutral",   eyes: "left",   mouth: "smile", arms: "down",         legs: "stand"  },
  walking:            { eyebrows: "neutral",   eyes: "open",   mouth: "smile", arms: "down",         legs: "walk-a" },
  jumping:            { eyebrows: "raised",    eyes: "happy",  mouth: "grin",  arms: "up",           legs: "jump"   },
  thinking:           { eyebrows: "quizzical", eyes: "right",  mouth: "flat",  arms: "think",        legs: "stand"  },
  celebrating:        { eyebrows: "raised",    eyes: "happy",  mouth: "grin",  arms: "up",           legs: "jump"   },
  alarmed:            { eyebrows: "worried",   eyes: "wide",   mouth: "o",     arms: "spread",       legs: "stand"  },
  sleeping:           { eyebrows: "droopy",    eyes: "closed", mouth: "flat",  arms: "down",         legs: "tucked" },
  waving:             { eyebrows: "raised",    eyes: "happy",  mouth: "grin",  arms: "wave",         legs: "stand"  },
  "thumbs-up":        { eyebrows: "raised",    eyes: "happy",  mouth: "smile", arms: "thumbs-up",    legs: "stand"  },
  guarding:           { eyebrows: "neutral",   eyes: "wide",   mouth: "flat",  arms: "spread",       legs: "stand"  },
  "pointing-left":    { eyebrows: "neutral",   eyes: "left",   mouth: "flat",  arms: "pointing-left",  legs: "stand" },
  "pointing-right":   { eyebrows: "neutral",   eyes: "right",  mouth: "flat",  arms: "pointing-right", legs: "stand" },
  typing:             { eyebrows: "neutral",   eyes: "down",   mouth: "flat",  arms: "typing",       legs: "stand"  },
  writing:            { eyebrows: "quizzical", eyes: "up-right", mouth: "flat", arms: "writing",     legs: "stand"  },
  scanning:           { eyebrows: "raised",    eyes: "left",   mouth: "flat",  arms: "spread",       legs: "stand"  },
  magnifying:         { eyebrows: "quizzical", eyes: "wide",   mouth: "o",     arms: "magnify",      legs: "stand"  },
  digging:            { eyebrows: "worried",   eyes: "down",   mouth: "flat",  arms: "dig",          legs: "crouch" },
  unlocking:          { eyebrows: "raised",    eyes: "wide",   mouth: "o",     arms: "key",          legs: "stand"  },
  "throwing-switch":  { eyebrows: "raised",    eyes: "happy",  mouth: "grin",  arms: "lever",        legs: "wide"   },
  stopping:           { eyebrows: "worried",   eyes: "wide",   mouth: "flat",  arms: "stop",         legs: "wide"   },
  shush:              { eyebrows: "neutral",   eyes: "open",   mouth: "o",     arms: "shush",        legs: "stand"  },
  broom:              { eyebrows: "neutral",   eyes: "open",   mouth: "flat",  arms: "broom",        legs: "stand"  },
  ledger:             { eyebrows: "quizzical", eyes: "down",   mouth: "flat",  arms: "ledger",       legs: "stand"  },
  "sleepy-nod":       { eyebrows: "droopy",    eyes: "closed", mouth: "flat",  arms: "down",         legs: "tucked" },
  humming:            { eyebrows: "raised",    eyes: "closed", mouth: "hum",   arms: "down",         legs: "stand"  },
  yawning:            { eyebrows: "droopy",    eyes: "closed", mouth: "yawn",  arms: "stretch",      legs: "stand"  },
  stretching:         { eyebrows: "raised",    eyes: "closed", mouth: "grin",  arms: "stretch",      legs: "wide"   },
  squint:             { eyebrows: "quizzical", eyes: "closed", mouth: "flat",  arms: "down",         legs: "stand"  },
  pacing:             { eyebrows: "quizzical", eyes: "left",   mouth: "flat",  arms: "think",        legs: "walk-a" },
  "head-tilt":        { eyebrows: "quizzical", eyes: "open",   mouth: "smile", arms: "down",         legs: "stand"  },
  "sigh-of-relief":   { eyebrows: "droopy",    eyes: "closed", mouth: "sigh",  arms: "down",         legs: "stand"  },
  "speaking-gesture": { eyebrows: "raised",    eyes: "open",   mouth: "open",  arms: "spread",       legs: "stand"  },
};

export interface BlendedPapeePoseProps {
  /** Head region — controls eyebrows, eyes, mouth. */
  head: PapeeAnimState;
  /** Arms region. */
  arms: PapeeAnimState;
  /** Legs region. */
  legs: PapeeAnimState;
  /** Optional body override (rarely needed; defaults to head). */
  body?: PapeeAnimState;
  walkFrame?: number;
  gazeOverride?: EyesState;
}

/**
 * Renders a Papee assembled from up to four region-poses. If any
 * supplied region uses a LOCKED pose (celebrating/jumping/alarmed),
 * the entire body snaps to that pose's regions.
 */
export function BlendedPapeePose({
  head,
  arms,
  legs,
  body,
  walkFrame = 0,
  gazeOverride,
}: BlendedPapeePoseProps) {
  // Lock rule: any locked input forces all regions to that pose
  const lockedKey =
    [head, arms, legs, body].find((k) => k && LOCKED.has(k as PapeeAnimState)) as
      | PapeeAnimState
      | undefined;

  const headR = POSE_REGIONS[lockedKey ?? head];
  const armsR = POSE_REGIONS[lockedKey ?? arms];
  const legsR = POSE_REGIONS[lockedKey ?? legs];

  // Walking legs animate via walkFrame even when blended
  let legsState = legsR.legs;
  if (legsState === "walk-a") legsState = walkFrame % 2 === 0 ? "walk-a" : "walk-b";

  return (
    <g>
      <PapeeDefs />
      <GroundShadow />
      <Body />
      <Crown />
      <Eyebrows state={headR.eyebrows} />
      <Eyes state={gazeOverride ?? headR.eyes} />
      <Mouth state={headR.mouth} />
      <Arms state={armsR.arms} />
      <Legs state={legsState} />
    </g>
  );
}

export { POSE_REGIONS, LOCKED as LOCKED_POSES };
