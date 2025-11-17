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

@external("env", "text")
export declare function text(str: string, x: i32, y: i32): void;

@external("env", "tone")
export declare function tone(
  frequency: u32,
  duration: u32,
  volume: u32,
  flags: u32
): void;

@external("env", "trace")
export declare function trace(str: string): void;

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
const STAR_COUNT: i32 = 64;
const MAX_DISTANCE: f32 = 200.0;
const FAR_PLANE_DISTANCE: f32 = MAX_DISTANCE / 2.0;
const SPEED: f32 = 2.0;

// Audio constants (WASM-4 tone flags)
const TONE_PULSE1: u32 = 0;
const TONE_PULSE2: u32 = 1;

// Note frequencies (Hz)
const NOTE_C2: u32 = 65;
const NOTE_E2: u32 = 82;
const NOTE_F2: u32 = 87;
const NOTE_G1: u32 = 49;
const NOTE_C4: u32 = 262;
const NOTE_E4: u32 = 330;
const NOTE_F4: u32 = 349;
const NOTE_G3: u32 = 196;

// ---------------------------------------------------------------------------
// Static Star Data (Pre-allocated arrays)
// ---------------------------------------------------------------------------
const starX = memory.data<f32>([
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
]);

const starY = memory.data<f32>([
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
]);

const starZ = memory.data<f32>([
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
]);

// Audio progression data (bass and arp notes)
const bassNotes = memory.data<u32>([NOTE_C2, NOTE_G1, NOTE_F2, NOTE_E2]);
const arpNotes = memory.data<u32>([NOTE_C4, NOTE_G3, NOTE_F4, NOTE_E4]);

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
function resetStar(idx: i32): void {
  store<f32>(starX + (idx << 2), randomRange(-80.0, 80.0));
  store<f32>(starY + (idx << 2), randomRange(-80.0, 80.0));
  store<f32>(starZ + (idx << 2), MAX_DISTANCE);
}

// ---------------------------------------------------------------------------
// Global State
// ---------------------------------------------------------------------------
let frameCounter: u32 = 0;
let lastBassAct: u32 = 0xFFFFFFFF;
let initialized: bool = false;

// ---------------------------------------------------------------------------
// WASM-4 Lifecycle: start()
// ---------------------------------------------------------------------------
export function start(): void {
  if (initialized) return;

  // Set Gemstone Palette
  store<u32>(PALETTE + 0, 0x000000); // PALETTE[0] = Obsidian (Background)
  store<u32>(PALETTE + 4, 0x6C757D); // PALETTE[1] = Hematite (Far Stars)
  store<u32>(PALETTE + 8, 0x87CEEB); // PALETTE[2] = Celestite (Near Stars)
  store<u32>(PALETTE + 12, 0xFFFFFF); // PALETTE[3] = Moonstone (Scroller Text)

  // Initialize stars
  for (let i: i32 = 0; i < STAR_COUNT; i++) {
    resetStar(i);
    // Distribute stars along z-axis for initial state
    const z = randomRange(1.0, MAX_DISTANCE);
    store<f32>(starZ + (i << 2), z);
  }

  initialized = true;
}

// ---------------------------------------------------------------------------
// WASM-4 Lifecycle: update()
// ---------------------------------------------------------------------------
export function update(): void {
  // -------------------------------------------------------------------------
  // 0. Lazy Initialization (ensure start() has been called)
  // -------------------------------------------------------------------------
  if (!initialized) {
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
  for (let i: i32 = 0; i < STAR_COUNT; i++) {
    const offset = i << 2;
    let x = load<f32>(starX + offset);
    let y = load<f32>(starY + offset);
    let z = load<f32>(starZ + offset);

    // Update position
    z -= SPEED;

    // Reset if too close
    if (z < 1.0) {
      store<f32>(starX + offset, randomRange(-80.0, 80.0));
      store<f32>(starY + offset, randomRange(-80.0, 80.0));
      z = MAX_DISTANCE;
    }

    store<f32>(starZ + offset, z);

    // 3D Projection
    const invZ = 1.0 / z;
    const screenX = x * invZ + 80.0;
    const screenY = y * invZ + 80.0;

    // Bounds check (don't draw if offscreen)
    if (screenX < 0.0 || screenX >= 160.0 || screenY < 0.0 || screenY >= 160.0) {
      continue;
    }

    // Color selection based on depth
    const colorIndex: u16 = z > FAR_PLANE_DISTANCE ? 0x0002 : 0x0003;
    store<u16>(DRAW_COLORS, colorIndex);

    // Draw pixel (cast f32 to i32)
    pset(i32(screenX), i32(screenY));
  }

  // -------------------------------------------------------------------------
  // 3. Text Display
  // -------------------------------------------------------------------------
  store<u16>(DRAW_COLORS, 0x0004); // PALETTE[3] = Moonstone
  text("WARPCORE P4", 40, 150);

  // -------------------------------------------------------------------------
  // 4. Audio Tracker (64-second, 4-act sequence)
  // -------------------------------------------------------------------------
  const actIndex = (frameCounter / (60 * 16)) % 4;

  // Bass note - play once per act change (every 16 seconds)
  if (actIndex != lastBassAct) {
    const bassFreq = load<u32>(bassNotes + (actIndex << 2));
    tone(
      bassFreq,
      60 * 16,      // Duration: 16 seconds
      40,           // Volume
      TONE_PULSE2   // Channel
    );
    lastBassAct = actIndex;
  }

  // Arp note - play every 8 frames (~133ms at 60fps)
  if ((frameCounter % 8) == 0) {
    const arpFreq = load<u32>(arpNotes + (actIndex << 2));
    tone(
      arpFreq,
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
