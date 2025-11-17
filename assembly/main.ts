// ===========================================================================
// Project Warpcore (P4) - A 3D Perspective Starfield
// Stack: Approach 3 (AssemblyScript → WASM-4)
// Gemstone Palette: Obsidian, Hematite, Celestite, Moonstone
// ===========================================================================

// ---------------------------------------------------------------------------
// WASM-4 Memory-Mapped I/O
// ---------------------------------------------------------------------------
export const PALETTE: usize = 0x04;
export const DRAW_COLORS: usize = 0x14;
export const GAMEPAD1: usize = 0x16;
export const FRAMEBUFFER: usize = 0xa0;

// ---------------------------------------------------------------------------
// WASM-4 API Imports
// ---------------------------------------------------------------------------
@external("env", "rect")
export declare function rect(x: i32, y: i32, width: u32, height: u32): void;

@external("env", "oval")
export declare function oval(x: i32, y: i32, width: u32, height: u32): void;

@external("env", "text")
export declare function text(str: string, x: i32, y: i32): void;

@external("env", "blit")
export declare function blit(
  sprite: usize,
  x: i32,
  y: i32,
  width: u32,
  height: u32,
  flags: u32
): void;

@external("env", "blitSub")
export declare function blitSub(
  sprite: usize,
  x: i32,
  y: i32,
  width: u32,
  height: u32,
  srcX: u32,
  srcY: u32,
  srcStride: u32,
  flags: u32
): void;

@external("env", "line")
export declare function line(x1: i32, y1: i32, x2: i32, y2: i32): void;

@external("env", "hline")
export declare function hline(x: i32, y: i32, len: u32): void;

@external("env", "vline")
export declare function vline(x: i32, y: i32, len: u32): void;

@external("env", "tone")
export declare function tone(
  frequency: u32,
  duration: u32,
  volume: u32,
  flags: u32
): void;

@external("env", "diskr")
export declare function diskr(dest: usize, size: u32): u32;

@external("env", "diskw")
export declare function diskw(src: usize, size: u32): u32;

@external("env", "trace")
export declare function trace(str: string): void;

@external("env", "tracef")
export declare function tracef(fmt: string, ...args: number[]): void;

// Pixel set function
function pset(x: i32, y: i32): void {
  // Bounds check
  if (x < 0 || x >= 160 || y < 0 || y >= 160) return;

  // Get current draw colors
  const drawColors = load<u16>(DRAW_COLORS);
  const colorIndex = u8((drawColors & 0x0f) - 1);

  if (colorIndex > 3) return;

  // Calculate framebuffer position
  const idx = (y * 160 + x) >> 2;
  const shift = u8((x & 0x3) << 1);
  const mask = u8(0x3 << shift);

  // Read-modify-write
  const fbAddr = FRAMEBUFFER + idx;
  const pixel = load<u8>(fbAddr);
  store<u8>(fbAddr, (pixel & ~mask) | (colorIndex << shift));
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const STAR_COUNT: i32 = 150;
const MAX_DISTANCE: f32 = 200.0;
const FAR_PLANE_DISTANCE: f32 = MAX_DISTANCE / 2.0;
const SPEED: f32 = 2.0;

// Audio constants (WASM-4 tone flags)
const TONE_PULSE1: u32 = 0;
const TONE_PULSE2: u32 = 1;
const TONE_TRIANGLE: u32 = 2;
const TONE_NOISE: u32 = 3;

// Note frequencies (Hz) - simplified chromatic scale
const NOTE_C2: u32 = 65;
const NOTE_E2: u32 = 82;
const NOTE_F2: u32 = 87;
const NOTE_G1: u32 = 49;
const NOTE_C4: u32 = 262;
const NOTE_E4: u32 = 330;
const NOTE_F4: u32 = 349;
const NOTE_G3: u32 = 196;

// ---------------------------------------------------------------------------
// Star Class
// ---------------------------------------------------------------------------
class Star {
  x: f32;
  y: f32;
  z: f32;

  constructor(x: f32 = 0.0, y: f32 = 0.0, z: f32 = MAX_DISTANCE) {
    this.x = x;
    this.y = y;
    this.z = z;
  }
}

// ---------------------------------------------------------------------------
// Random Number Generator (Simple LCG)
// ---------------------------------------------------------------------------
let randomSeed: u32 = 12345;

function random(): f32 {
  randomSeed = (randomSeed * 1103515245 + 12345) & 0x7fffffff;
  return f32(randomSeed) / f32(0x7fffffff);
}

function randomRange(min: f32, max: f32): f32 {
  return min + random() * (max - min);
}

// ---------------------------------------------------------------------------
// Star Management
// ---------------------------------------------------------------------------
function resetStar(star: Star): void {
  star.x = randomRange(-80.0, 80.0);
  star.y = randomRange(-80.0, 80.0);
  star.z = MAX_DISTANCE;
}

// ---------------------------------------------------------------------------
// Scroller Class
// ---------------------------------------------------------------------------
class Scroller {
  message: string;
  scrollPos: f32;
  speed: f32;

  constructor(message: string, speed: f32 = 30.0) {
    this.message = message;
    this.scrollPos = 0.0;
    this.speed = speed;
  }

  update(deltaTime: f32): void {
    this.scrollPos += this.speed * deltaTime;
    const maxScroll = f32(this.message.length * 8);
    if (this.scrollPos >= maxScroll) {
      this.scrollPos = 0.0;
    }
  }

  draw(y: i32): void {
    const charWidth = 8;
    const screenWidth = 160;
    const messageWidth = this.message.length * charWidth;

    // Calculate offset for scrolling
    const offset = i32(this.scrollPos);
    const x = screenWidth - offset;

    // Draw the main text
    text(this.message, x, y);

    // Draw wrapped-around portion if necessary
    if (x < -messageWidth + screenWidth) {
      text(this.message, x + messageWidth, y);
    }
  }
}

// ---------------------------------------------------------------------------
// Audio Progression
// ---------------------------------------------------------------------------
class ChordNote {
  bass: u32;
  arp: u32;

  constructor(bass: u32, arp: u32) {
    this.bass = bass;
    this.arp = arp;
  }
}

const progression: ChordNote[] = [
  new ChordNote(NOTE_C2, NOTE_C4), // Am equivalent
  new ChordNote(NOTE_G1, NOTE_G3), // G
  new ChordNote(NOTE_F2, NOTE_F4), // F
  new ChordNote(NOTE_E2, NOTE_E4)  // E
];

// ---------------------------------------------------------------------------
// Global State
// ---------------------------------------------------------------------------
let stars: Star[] = [];
let scroller: Scroller | null = null;
let frameCounter: u32 = 0;
let lastBassAct: u32 = 0xFFFFFFFF;

// ---------------------------------------------------------------------------
// WASM-4 Lifecycle: start()
// ---------------------------------------------------------------------------
export function start(): void {
  // Set Gemstone Palette
  store<u32>(PALETTE + 0, 0x000000); // PALETTE[0] = Obsidian (Background)
  store<u32>(PALETTE + 4, 0x6C757D); // PALETTE[1] = Hematite (Far Stars)
  store<u32>(PALETTE + 8, 0x87CEEB); // PALETTE[2] = Celestite (Near Stars)
  store<u32>(PALETTE + 12, 0xFFFFFF); // PALETTE[3] = Moonstone (Scroller Text)

  // Initialize stars
  for (let i = 0; i < STAR_COUNT; i++) {
    const star = new Star();
    resetStar(star);
    // Distribute stars along z-axis for initial state
    star.z = randomRange(1.0, MAX_DISTANCE);
    stars.push(star);
  }

  // Initialize scroller
  scroller = new Scroller(
    "   PROJECT WARPCORE (P4)   ...   A3 STACK VALIDATION   ...   ASSEMBLYSCRIPT + WASM-4   ...   64K OR BUST   ...   ",
    25.0
  );
}

// ---------------------------------------------------------------------------
// WASM-4 Lifecycle: update()
// ---------------------------------------------------------------------------
export function update(): void {
  // -------------------------------------------------------------------------
  // 0. Lazy Initialization (ensure start() has been called)
  // -------------------------------------------------------------------------
  if (scroller === null) {
    start();
  }

  // -------------------------------------------------------------------------
  // 1. Clear Screen to PALETTE[0] (Obsidian)
  // -------------------------------------------------------------------------
  store<u16>(DRAW_COLORS, 0x0001); // Fill color = PALETTE[0]
  rect(0, 0, 160, 160);

  // -------------------------------------------------------------------------
  // 2. Starfield Kernel (3D Projection)
  // -------------------------------------------------------------------------
  for (let i = 0; i < stars.length; i++) {
    const star = stars[i];

    // Update position
    star.z -= SPEED;

    // Reset if too close
    if (star.z < 1.0) {
      resetStar(star);
    }

    // 3D Projection
    const invZ = 1.0 / star.z;
    const screenX = star.x * invZ + 80.0;
    const screenY = star.y * invZ + 80.0;

    // Bounds check (don't draw if offscreen)
    if (screenX < 0.0 || screenX >= 160.0 || screenY < 0.0 || screenY >= 160.0) {
      continue;
    }

    // Color selection based on depth
    const colorIndex: u16 = star.z > FAR_PLANE_DISTANCE ? 0x0002 : 0x0003;
    store<u16>(DRAW_COLORS, colorIndex);

    // Draw pixel (cast f32 to i32)
    pset(i32(screenX), i32(screenY));
  }

  // -------------------------------------------------------------------------
  // 3. Scroller Update & Draw
  // -------------------------------------------------------------------------
  scroller!.update(1.0 / 60.0);
  store<u16>(DRAW_COLORS, 0x0004); // PALETTE[3] = Moonstone
  scroller!.draw(150);

  // -------------------------------------------------------------------------
  // 4. Audio Tracker (64-second, 4-act sequence)
  // -------------------------------------------------------------------------
  const actIndex = (frameCounter / (60 * 16)) % 4;

  // Bass note - play once per act change (every 16 seconds)
  if (actIndex != lastBassAct) {
    tone(
      progression[actIndex].bass,
      60 * 16,      // Duration: 16 seconds
      40,           // Volume
      TONE_PULSE2   // Channel
    );
    lastBassAct = actIndex;
  }

  // Arp note - play every 8 frames (~133ms at 60fps)
  if ((frameCounter % 8) == 0) {
    tone(
      progression[actIndex].arp,
      8,            // Duration: 8 frames
      60,           // Volume
      TONE_PULSE1   // Channel
    );
  }

  frameCounter++;
}

// ---------------------------------------------------------------------------
// Error Handler (Required by AssemblyScript)
// ---------------------------------------------------------------------------
export function abort(
  message: string | null,
  fileName: string | null,
  lineNumber: u32,
  columnNumber: u32
): void {
  // No-op for WASM-4 (no console available)
}
