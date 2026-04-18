/**
 * SVG pose components for Papee — a friendly paperclip creature.
 * Each pose is a <g> group rendered inside a parent <svg viewBox="-6 -8 60 80">.
 * Colors use CSS vars for theme adaptation.
 */

/* ---- Shoe ---- */

/** Small oval shoe used by several foot-down poses. */
function Shoe({ cx, cy }: { cx: number; cy: number }) {
  return (
    <ellipse
      cx={cx}
      cy={cy}
      rx={4.5}
      ry={2.2}
      fill="currentColor"
    />
  );
}

/* ---- Body ---- */

/** The paperclip body — the signature shape. Rounded, friendly, slightly chunky. */
function Body() {
  return (
    <>
      {/* Outer body shadow for depth */}
      <path
        d="M16 4C9 4 4 9 4 16L4 44C4 52 10 58 18 58L30 58C38 58 44 52 44 44L44 20C44 12 38 6 30 6L22 6C17 6 13 10 13 15L13 40C13 45 17 49 22 49L30 49"
        fill="none"
        stroke="var(--muted-foreground)"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.08"
      />
      {/* Main body */}
      <path
        d="M16 4C9 4 4 9 4 16L4 44C4 52 10 58 18 58L30 58C38 58 44 52 44 44L44 20C44 12 38 6 30 6L22 6C17 6 13 10 13 15L13 40C13 45 17 49 22 49L30 49"
        fill="var(--card)"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Inner highlight for 3D feel */}
      <path
        d="M18 8C13 8 8 13 8 18L8 42C8 48 12 54 18 54"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.5"
        strokeLinecap="round"
        opacity="0.15"
      />
      {/* Cheek blush spots */}
      <ellipse cx="13" cy="28" rx="3" ry="2" fill="oklch(0.8 0.1 15)" opacity="0.25" />
      <ellipse cx="37" cy="28" rx="3" ry="2" fill="oklch(0.8 0.1 15)" opacity="0.25" />
    </>
  );
}

/* ---- Eyes ---- */

function Eyes({ state = "open" }: { state?: "open" | "closed" | "wide" | "left" | "right" | "happy" }) {
  if (state === "closed") {
    return (
      <>
        <path d="M16 22Q19 24.5 22 22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M28 22Q31 24.5 34 22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </>
    );
  }
  if (state === "wide") {
    return (
      <>
        <circle cx="19" cy="21" r="4" fill="currentColor" />
        <circle cx="31" cy="21" r="4" fill="currentColor" />
        {/* Highlight dots for liveliness */}
        <circle cx="20.5" cy="19.5" r="1.5" fill="var(--card)" />
        <circle cx="32.5" cy="19.5" r="1.5" fill="var(--card)" />
        <circle cx="18" cy="22" r="0.7" fill="var(--card)" opacity="0.5" />
        <circle cx="30" cy="22" r="0.7" fill="var(--card)" opacity="0.5" />
      </>
    );
  }
  if (state === "left") {
    return (
      <>
        <circle cx="17" cy="22" r="2.8" fill="currentColor" />
        <circle cx="29" cy="22" r="2.8" fill="currentColor" />
        <circle cx="18" cy="20.5" r="1" fill="var(--card)" />
        <circle cx="30" cy="20.5" r="1" fill="var(--card)" />
      </>
    );
  }
  if (state === "right") {
    return (
      <>
        <circle cx="21" cy="22" r="2.8" fill="currentColor" />
        <circle cx="33" cy="22" r="2.8" fill="currentColor" />
        <circle cx="22" cy="20.5" r="1" fill="var(--card)" />
        <circle cx="34" cy="20.5" r="1" fill="var(--card)" />
      </>
    );
  }
  if (state === "happy") {
    return (
      <>
        <path d="M16 23.5Q19 19 22 23.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M28 23.5Q31 19 34 23.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </>
    );
  }
  // open (default) — round eyes with highlight
  return (
    <>
      <circle cx="19" cy="22" r="3" fill="currentColor" />
      <circle cx="31" cy="22" r="3" fill="currentColor" />
      <circle cx="20" cy="20.5" r="1.2" fill="var(--card)" />
      <circle cx="32" cy="20.5" r="1.2" fill="var(--card)" />
    </>
  );
}

/* ---- Mouth ---- */

export type MouthState = "smile" | "open" | "flat" | "o" | "grin" | "yawn" | "hum" | "sigh";
export function Mouth({ state = "smile" }: { state?: MouthState }) {
  if (state === "yawn") {
    return (
      <ellipse cx="25" cy="33" rx="3.5" ry="4" fill="currentColor" opacity="0.18" />
    );
  }
  if (state === "hum") {
    return <path d="M22 31Q25 33 28 31" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />;
  }
  if (state === "sigh") {
    return <path d="M21 32Q25 33 29 32" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />;
  }
  if (state === "open") {
    return (
      <ellipse cx="25" cy="32" rx="3.5" ry="3" fill="currentColor" opacity="0.15">
        <animate attributeName="ry" values="3;2.5;3" dur="1s" repeatCount="indefinite" />
      </ellipse>
    );
  }
  if (state === "flat") {
    return <line x1="21" y1="31" x2="29" y2="31" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />;
  }
  if (state === "o") {
    return <circle cx="25" cy="32" r="3" fill="none" stroke="currentColor" strokeWidth="1.5" />;
  }
  if (state === "grin") {
    return (
      <>
        <path d="M19 29Q25 37 31 29" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        {/* Tongue for extra charm on celebrate */}
        <ellipse cx="25" cy="34" rx="2" ry="1.5" fill="oklch(0.75 0.12 15)" opacity="0.5" />
      </>
    );
  }
  // smile (default)
  return <path d="M21 30Q25 34 29 30" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />;
}

/* ---- Arms ---- */

function Arms({ state = "down" }: { state?: "down" | "up" | "wave" | "think" | "spread" | "thumbs-up" }) {
  const armStroke = "currentColor";
  const armWidth = 2.2;

  if (state === "up") {
    return (
      <>
        <path d="M4 28Q-1 18 4 12" fill="none" stroke={armStroke} strokeWidth={armWidth} strokeLinecap="round" />
        <path d="M44 28Q49 18 44 12" fill="none" stroke={armStroke} strokeWidth={armWidth} strokeLinecap="round" />
      </>
    );
  }
  if (state === "wave") {
    return (
      <>
        <path d="M4 28Q0 33 2 37" fill="none" stroke={armStroke} strokeWidth={armWidth} strokeLinecap="round" />
        <path d="M44 28Q50 16 46 10" fill="none" stroke={armStroke} strokeWidth={armWidth} strokeLinecap="round" className="papee-wave-arm" />
        {/* Hand */}
        <circle cx="46" cy="10" r="2" fill="var(--card)" stroke={armStroke} strokeWidth="1.5" className="papee-wave-arm" />
      </>
    );
  }
  if (state === "think") {
    return (
      <>
        <path d="M4 28Q0 33 2 37" fill="none" stroke={armStroke} strokeWidth={armWidth} strokeLinecap="round" />
        <path d="M44 28Q48 22 42 17" fill="none" stroke={armStroke} strokeWidth={armWidth} strokeLinecap="round" />
      </>
    );
  }
  if (state === "spread") {
    return (
      <>
        <path d="M4 28Q-4 24 -2 18" fill="none" stroke={armStroke} strokeWidth={armWidth} strokeLinecap="round" />
        <path d="M44 28Q52 24 50 18" fill="none" stroke={armStroke} strokeWidth={armWidth} strokeLinecap="round" />
      </>
    );
  }
  if (state === "thumbs-up") {
    return (
      <>
        <path d="M4 28Q0 33 2 37" fill="none" stroke={armStroke} strokeWidth={armWidth} strokeLinecap="round" />
        <path d="M44 28Q50 20 47 14" fill="none" stroke={armStroke} strokeWidth={armWidth} strokeLinecap="round" />
        {/* Thumb */}
        <path d="M47 14Q48 9 46 7" fill="none" stroke={armStroke} strokeWidth="2.5" strokeLinecap="round" />
      </>
    );
  }
  if (state === "typing") {
    return (
      <>
        <path d="M4 28Q-1 34 6 38" fill="none" stroke={armStroke} strokeWidth={armWidth} strokeLinecap="round" />
        <path d="M44 28Q49 34 42 38" fill="none" stroke={armStroke} strokeWidth={armWidth} strokeLinecap="round" />
        <rect x="10" y="38" width="28" height="3" rx="1" fill="var(--muted)" stroke={armStroke} strokeWidth="0.6" />
        <rect x="12" y="39" width="2" height="1.2" fill={armStroke} opacity="0.5" />
        <rect x="16" y="39" width="2" height="1.2" fill={armStroke} opacity="0.5" />
        <rect x="20" y="39" width="2" height="1.2" fill={armStroke} opacity="0.5" />
        <rect x="24" y="39" width="2" height="1.2" fill={armStroke} opacity="0.5" />
        <rect x="28" y="39" width="2" height="1.2" fill={armStroke} opacity="0.5" />
        <rect x="32" y="39" width="2" height="1.2" fill={armStroke} opacity="0.5" />
      </>
    );
  }
  if (state === "writing") {
    return (
      <>
        <path d="M4 28Q0 33 2 37" fill="none" stroke={armStroke} strokeWidth={armWidth} strokeLinecap="round" />
        <path d="M44 28Q50 23 53 17" fill="none" stroke={armStroke} strokeWidth={armWidth} strokeLinecap="round" />
        <line x1="53" y1="17" x2="57" y2="11" stroke={armStroke} strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="57" cy="11" r="0.9" fill="var(--primary)" />
      </>
    );
  }
  if (state === "magnify") {
    return (
      <>
        <path d="M4 28Q0 33 2 37" fill="none" stroke={armStroke} strokeWidth={armWidth} strokeLinecap="round" />
        <path d="M44 28Q52 22 54 14" fill="none" stroke={armStroke} strokeWidth={armWidth} strokeLinecap="round" />
        <circle cx="54" cy="10" r="4.5" fill="none" stroke={armStroke} strokeWidth="1.6" />
        <line x1="51" y1="13" x2="48" y2="16" stroke={armStroke} strokeWidth="1.4" strokeLinecap="round" />
        <circle cx="54" cy="10" r="3.5" fill="var(--primary)" opacity="0.12" />
      </>
    );
  }
  if (state === "lever") {
    return (
      <>
        <path d="M4 28Q0 33 2 37" fill="none" stroke={armStroke} strokeWidth={armWidth} strokeLinecap="round" />
        <path d="M44 28Q52 24 56 16" fill="none" stroke={armStroke} strokeWidth={armWidth} strokeLinecap="round" />
        <line x1="56" y1="16" x2="56" y2="3" stroke={armStroke} strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="56" cy="3" r="2" fill="var(--primary)" stroke={armStroke} strokeWidth="0.8" />
      </>
    );
  }
  if (state === "stop") {
    return (
      <>
        <path d="M4 28Q-2 22 0 14" fill="none" stroke={armStroke} strokeWidth={armWidth} strokeLinecap="round" />
        <path d="M44 28Q50 22 48 14" fill="none" stroke={armStroke} strokeWidth={armWidth} strokeLinecap="round" />
        <rect x="-3" y="9" width="6" height="6" rx="1" fill="oklch(0.65 0.25 25)" opacity="0.85" />
        <rect x="45" y="9" width="6" height="6" rx="1" fill="oklch(0.65 0.25 25)" opacity="0.85" />
      </>
    );
  }
  if (state === "shush") {
    return (
      <>
        <path d="M4 28Q0 33 2 37" fill="none" stroke={armStroke} strokeWidth={armWidth} strokeLinecap="round" />
        <path d="M44 28Q34 22 28 23" fill="none" stroke={armStroke} strokeWidth={armWidth} strokeLinecap="round" />
        <line x1="28" y1="23" x2="25" y2="29" stroke={armStroke} strokeWidth="1.6" strokeLinecap="round" />
      </>
    );
  }
  if (state === "broom") {
    return (
      <>
        <path d="M4 28Q0 33 2 37" fill="none" stroke={armStroke} strokeWidth={armWidth} strokeLinecap="round" />
        <path d="M44 28Q50 32 48 38" fill="none" stroke={armStroke} strokeWidth={armWidth} strokeLinecap="round" />
        <line x1="48" y1="38" x2="56" y2="56" stroke={armStroke} strokeWidth="2.2" strokeLinecap="round" />
        <path d="M52 50L60 58L54 60L48 54Z" fill="var(--muted)" stroke={armStroke} strokeWidth="0.8" />
      </>
    );
  }
  if (state === "ledger") {
    return (
      <>
        <path d="M4 28Q-2 32 0 38" fill="none" stroke={armStroke} strokeWidth={armWidth} strokeLinecap="round" />
        <path d="M44 28Q50 32 48 38" fill="none" stroke={armStroke} strokeWidth={armWidth} strokeLinecap="round" />
        <rect x="6" y="34" width="36" height="14" rx="1" fill="var(--card)" stroke={armStroke} strokeWidth="1" />
        <line x1="10" y1="38" x2="38" y2="38" stroke={armStroke} strokeWidth="0.6" opacity="0.5" />
        <line x1="10" y1="41" x2="38" y2="41" stroke={armStroke} strokeWidth="0.6" opacity="0.5" />
        <line x1="10" y1="44" x2="32" y2="44" stroke={armStroke} strokeWidth="0.6" opacity="0.5" />
      </>
    );
  }
  if (state === "key") {
    return (
      <>
        <path d="M4 28Q0 33 2 37" fill="none" stroke={armStroke} strokeWidth={armWidth} strokeLinecap="round" />
        <path d="M44 28Q52 26 56 22" fill="none" stroke={armStroke} strokeWidth={armWidth} strokeLinecap="round" />
        <circle cx="58" cy="20" r="2.5" fill="none" stroke="var(--primary)" strokeWidth="1.6" />
        <line x1="60" y1="20" x2="65" y2="20" stroke="var(--primary)" strokeWidth="1.6" strokeLinecap="round" />
        <line x1="63" y1="20" x2="63" y2="22.5" stroke="var(--primary)" strokeWidth="1.6" strokeLinecap="round" />
        <line x1="65" y1="20" x2="65" y2="22.5" stroke="var(--primary)" strokeWidth="1.6" strokeLinecap="round" />
      </>
    );
  }
  if (state === "dig") {
    return (
      <>
        <path d="M4 28Q-2 38 4 44" fill="none" stroke={armStroke} strokeWidth={armWidth} strokeLinecap="round" />
        <path d="M44 28Q50 38 44 44" fill="none" stroke={armStroke} strokeWidth={armWidth} strokeLinecap="round" />
      </>
    );
  }
  if (state === "sweep") {
    return (
      <>
        <path d="M4 28Q-4 30 -2 36" fill="none" stroke={armStroke} strokeWidth={armWidth} strokeLinecap="round" />
        <path d="M44 28Q52 30 50 36" fill="none" stroke={armStroke} strokeWidth={armWidth} strokeLinecap="round" />
      </>
    );
  }
  if (state === "stretch") {
    return (
      <>
        <path d="M4 28Q-4 14 0 4" fill="none" stroke={armStroke} strokeWidth={armWidth} strokeLinecap="round" />
        <path d="M44 28Q52 14 48 4" fill="none" stroke={armStroke} strokeWidth={armWidth} strokeLinecap="round" />
      </>
    );
  }
  // down (default)
  return (
    <>
      <path d="M4 28Q0 33 2 37" fill="none" stroke={armStroke} strokeWidth={armWidth} strokeLinecap="round" />
      <path d="M44 28Q48 33 46 37" fill="none" stroke={armStroke} strokeWidth={armWidth} strokeLinecap="round" />
    </>
  );
}

/* ---- Legs ---- */

export type LegsState = "stand" | "walk-a" | "walk-b" | "jump" | "tucked" | "crouch" | "wide";
export function Legs({ state = "stand" }: { state?: LegsState }) {
  if (state === "crouch") {
    return (
      <>
        <path d="M18 58Q14 62 16 66" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M30 58Q34 62 32 66" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <Shoe cx={16} cy={67} />
        <Shoe cx={32} cy={67} />
      </>
    );
  }
  if (state === "wide") {
    return (
      <>
        <line x1="18" y1="58" x2="11" y2="65" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <line x1="30" y1="58" x2="37" y2="65" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <Shoe cx={11} cy={66} />
        <Shoe cx={37} cy={66} />
      </>
    );
  }
  const legStroke = "currentColor";
  const legWidth = 2.2;

  if (state === "walk-a") {
    return (
      <>
        <line x1="18" y1="58" x2="13" y2="65" stroke={legStroke} strokeWidth={legWidth} strokeLinecap="round" />
        <line x1="30" y1="58" x2="35" y2="65" stroke={legStroke} strokeWidth={legWidth} strokeLinecap="round" />
        {/* Feet */}
        <circle cx="13" cy="65" r="1.5" fill={legStroke} />
        <circle cx="35" cy="65" r="1.5" fill={legStroke} />
      </>
    );
  }
  if (state === "walk-b") {
    return (
      <>
        <line x1="18" y1="58" x2="22" y2="65" stroke={legStroke} strokeWidth={legWidth} strokeLinecap="round" />
        <line x1="30" y1="58" x2="26" y2="65" stroke={legStroke} strokeWidth={legWidth} strokeLinecap="round" />
        <circle cx="22" cy="65" r="1.5" fill={legStroke} />
        <circle cx="26" cy="65" r="1.5" fill={legStroke} />
      </>
    );
  }
  if (state === "jump") {
    return (
      <>
        <line x1="18" y1="58" x2="14" y2="62" stroke={legStroke} strokeWidth={legWidth} strokeLinecap="round" />
        <line x1="30" y1="58" x2="34" y2="62" stroke={legStroke} strokeWidth={legWidth} strokeLinecap="round" />
      </>
    );
  }
  if (state === "tucked") {
    return (
      <>
        <path d="M18 58Q15 61 18 63" fill="none" stroke={legStroke} strokeWidth={legWidth} strokeLinecap="round" />
        <path d="M30 58Q33 61 30 63" fill="none" stroke={legStroke} strokeWidth={legWidth} strokeLinecap="round" />
      </>
    );
  }
  // stand (default)
  return (
    <>
      <line x1="18" y1="58" x2="16" y2="65" stroke={legStroke} strokeWidth={legWidth} strokeLinecap="round" />
      <line x1="30" y1="58" x2="32" y2="65" stroke={legStroke} strokeWidth={legWidth} strokeLinecap="round" />
      <circle cx="16" cy="65" r="1.5" fill={legStroke} />
      <circle cx="32" cy="65" r="1.5" fill={legStroke} />
    </>
  );
}

/* ---- Decorations ---- */

function Sparkles() {
  return (
    <g className="papee-sparkle">
      <path d="M2 6L3.5 3L5 6L3.5 9Z" fill="var(--primary)" opacity="0.9" />
      <path d="M40 3L41 1L42 3L41 5Z" fill="var(--primary)" opacity="0.7" />
      <path d="M44 14L45.5 12L47 14L45.5 16Z" fill="var(--primary)" opacity="0.8" />
      <circle cx="8" cy="12" r="1" fill="var(--primary)" opacity="0.5" />
    </g>
  );
}

function ExclamationMark() {
  return (
    <g>
      <circle cx="25" cy="-2" r="7" fill="oklch(0.65 0.25 25)" opacity="0.15" />
      <text x="25" y="2" fontSize="13" fontWeight="bold" fill="oklch(0.65 0.25 25)" textAnchor="middle" dominantBaseline="central">!</text>
    </g>
  );
}

function ThinkingDots() {
  return (
    <g className="papee-thinking-dots">
      <circle cx="38" cy="10" r="2" fill="var(--muted-foreground)" opacity="0.4" />
      <circle cx="43" cy="5" r="2.5" fill="var(--muted-foreground)" opacity="0.6" />
      <circle cx="48" cy="0" r="3" fill="var(--muted-foreground)" opacity="0.8" />
    </g>
  );
}

/** A small musical note for the humming pose. */
function MusicalNote() {
  return (
    <g opacity="0.7">
      <ellipse cx="44" cy="6" rx="2" ry="1.6" fill="var(--primary)" />
      <line x1="46" y1="6" x2="46" y2="-2" stroke="var(--primary)" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M46 -2Q49 -1 49 2" fill="none" stroke="var(--primary)" strokeWidth="1.2" strokeLinecap="round" />
    </g>
  );
}

function Zzz() {
  return (
    <g className="papee-zzz">
      <text x="35" y="8" fontSize="9" fill="var(--muted-foreground)" opacity="0.6" fontWeight="bold" fontStyle="italic">z</text>
      <text x="40" y="1" fontSize="7" fill="var(--muted-foreground)" opacity="0.4" fontWeight="bold" fontStyle="italic">z</text>
      <text x="44" y="-4" fontSize="5" fill="var(--muted-foreground)" opacity="0.3" fontWeight="bold" fontStyle="italic">z</text>
    </g>
  );
}

/* ---- Assembled Poses ---- */

export type PapeeAnimState =
  | "idle"
  | "idle-blink"
  | "idle-look-around"
  | "walking"
  | "jumping"
  | "thinking"
  | "celebrating"
  | "alarmed"
  | "sleeping"
  | "waving"
  | "thumbs-up";

export function PapeePose({ state, walkFrame = 0 }: { state: PapeeAnimState; walkFrame?: number }) {
  switch (state) {
    case "idle":
      return <g><Body /><Eyes /><Mouth /><Arms /><Legs /></g>;
    case "idle-blink":
      return <g><Body /><Eyes state="closed" /><Mouth /><Arms /><Legs /></g>;
    case "idle-look-around":
      return <g><Body /><Eyes state="left" /><Mouth /><Arms /><Legs /></g>;
    case "walking":
      return (
        <g>
          <Body /><Eyes /><Mouth />
          <Arms />
          <Legs state={walkFrame % 2 === 0 ? "walk-a" : "walk-b"} />
        </g>
      );
    case "jumping":
      return (
        <g>
          <Body /><Eyes state="happy" /><Mouth state="grin" />
          <Arms state="up" /><Legs state="jump" />
        </g>
      );
    case "thinking":
      return (
        <g>
          <Body /><Eyes state="right" /><Mouth state="flat" />
          <Arms state="think" /><Legs />
          <ThinkingDots />
        </g>
      );
    case "celebrating":
      return (
        <g>
          <Body /><Eyes state="happy" /><Mouth state="grin" />
          <Arms state="up" /><Legs state="jump" />
          <Sparkles />
        </g>
      );
    case "alarmed":
      return (
        <g className="papee-alarm-shake">
          <Body /><Eyes state="wide" /><Mouth state="o" />
          <Arms state="spread" /><Legs />
          <ExclamationMark />
        </g>
      );
    case "sleeping":
      return (
        <g>
          <Body /><Eyes state="closed" /><Mouth state="flat" />
          <Arms /><Legs state="tucked" />
          <Zzz />
        </g>
      );
    case "waving":
      return (
        <g>
          <Body /><Eyes state="happy" /><Mouth state="grin" />
          <Arms state="wave" /><Legs />
        </g>
      );
    case "thumbs-up":
      return (
        <g>
          <Body /><Eyes state="happy" /><Mouth state="smile" />
          <Arms state="thumbs-up" /><Legs />
        </g>
      );
  }
}
