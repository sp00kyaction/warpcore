// ===========================================================================
// Project Warpcore - A 3D Perspective Starfield
// Rebuilt for WASM-4 with zero runtime dependencies
// ===========================================================================

// ---------------------------------------------------------------------------
// WASM-4 Memory-Mapped I/O
// ---------------------------------------------------------------------------
const PALETTE: usize = 0x04;
const DRAW_COLORS: usize = 0x14;
const FRAMEBUFFER: usize = 0xa0;

// ---------------------------------------------------------------------------
// WASM-4 API Functions
// ---------------------------------------------------------------------------
@external("env", "rect")
declare function rect(x: i32, y: i32, width: u32, height: u32): void;

@external("env", "text")
declare function text(str: string, x: i32, y: i32): void;

@external("env", "tone")
declare function tone(frequency: u32, duration: u32, volume: u32, flags: u32): void;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const STAR_COUNT: i32 = 64;
const MAX_DISTANCE: f32 = 200.0;
const FAR_PLANE_DISTANCE: f32 = MAX_DISTANCE / 2.0;
const SPEED: f32 = 2.0;

// Audio constants
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
// Star Data Storage (using WASM-4 free memory region)
// WASM-4 memory map:
//   0xa0-0x19a0: Framebuffer (6400 bytes)
//   0x19a0+: Free memory for custom data
// ---------------------------------------------------------------------------
const STAR_DATA_BASE: usize = 0x19a0;
const starX: usize = STAR_DATA_BASE;           // 64 * 4 = 256 bytes
const starY: usize = STAR_DATA_BASE + 256;     // 64 * 4 = 256 bytes
const starZ: usize = STAR_DATA_BASE + 512;     // 64 * 4 = 256 bytes

// Audio note data
const bassNotes: usize = STAR_DATA_BASE + 768;  // 4 * 4 = 16 bytes
const arpNotes: usize = STAR_DATA_BASE + 784;   // 4 * 4 = 16 bytes

// ---------------------------------------------------------------------------
// Random Number Generator
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
// Pixel Drawing Function
// ---------------------------------------------------------------------------
function pset(x: i32, y: i32): void {
  if (x < 0 || x >= 160 || y < 0 || y >= 160) return;

  const drawColors = load<u16>(DRAW_COLORS);
  const colorIndex = u8((drawColors & 0x0f) - 1);
  if (colorIndex > 3) return;

  const idx = (y * 160 + x) >> 2;
  const shift = u8((x & 0x3) << 1);
  const mask = u8(0x3 << shift);

  const fbAddr = FRAMEBUFFER + idx;
  const pixel = load<u8>(fbAddr);
  store<u8>(fbAddr, (pixel & ~mask) | (colorIndex << shift));
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
  // Set palette
  store<u32>(PALETTE + 0, 0x000000);   // Black background
  store<u32>(PALETTE + 4, 0x6C757D);   // Gray (far stars)
  store<u32>(PALETTE + 8, 0x87CEEB);   // Blue (near stars)
  store<u32>(PALETTE + 12, 0xFFFFFF);  // White (text)

  // Initialize audio notes
  store<u32>(bassNotes + 0, NOTE_C2);
  store<u32>(bassNotes + 4, NOTE_G1);
  store<u32>(bassNotes + 8, NOTE_F2);
  store<u32>(bassNotes + 12, NOTE_E2);

  store<u32>(arpNotes + 0, NOTE_C4);
  store<u32>(arpNotes + 4, NOTE_G3);
  store<u32>(arpNotes + 8, NOTE_F4);
  store<u32>(arpNotes + 12, NOTE_E4);

  // Reset state
  frameCounter = 0;
  lastBassAct = 0xFFFFFFFF;

  // Initialize stars with random distribution
  for (let i: i32 = 0; i < STAR_COUNT; i++) {
    const offset = i << 2;
    store<f32>(starX + offset, randomRange(-80.0, 80.0));
    store<f32>(starY + offset, randomRange(-80.0, 80.0));
    store<f32>(starZ + offset, randomRange(1.0, MAX_DISTANCE));
  }

  initialized = true;
}

// ---------------------------------------------------------------------------
// WASM-4 Lifecycle: update()
// ---------------------------------------------------------------------------
export function update(): void {
  // Lazy initialization
  if (!initialized) {
    start();
  }

  // Clear screen to black
  store<u16>(DRAW_COLORS, 0x0001);
  rect(0, 0, 160, 160);

  // Draw starfield
  for (let i: i32 = 0; i < STAR_COUNT; i++) {
    const offset = i << 2;

    let x = load<f32>(starX + offset);
    let y = load<f32>(starY + offset);
    let z = load<f32>(starZ + offset);

    // Move star forward
    z -= SPEED;

    // Reset if too close
    if (z < 1.0) {
      x = randomRange(-80.0, 80.0);
      y = randomRange(-80.0, 80.0);
      z = MAX_DISTANCE;
      store<f32>(starX + offset, x);
      store<f32>(starY + offset, y);
    }

    store<f32>(starZ + offset, z);

    // 3D perspective projection
    const invZ = 1.0 / z;
    const screenX = x * invZ + 80.0;
    const screenY = y * invZ + 80.0;

    // Bounds check
    if (screenX < 0.0 || screenX >= 160.0 || screenY < 0.0 || screenY >= 160.0) {
      continue;
    }

    // Color based on depth
    const colorIndex: u16 = z > FAR_PLANE_DISTANCE ? 0x0002 : 0x0003;
    store<u16>(DRAW_COLORS, colorIndex);

    // Draw pixel
    pset(i32(screenX), i32(screenY));
  }

  // Draw text
  store<u16>(DRAW_COLORS, 0x0004);
  text("WARPCORE P4", 40, 150);

  // Audio tracker
  const actIndex = (frameCounter / (60 * 16)) % 4;

  // Bass note - play once per act change
  if (actIndex != lastBassAct) {
    const bassFreq = load<u32>(bassNotes + (actIndex << 2));
    tone(bassFreq, 60 * 16, 40, TONE_PULSE2);
    lastBassAct = actIndex;
  }

  // Arp note - play every 8 frames
  if ((frameCounter % 8) == 0) {
    const arpFreq = load<u32>(arpNotes + (actIndex << 2));
    tone(arpFreq, 8, 60, TONE_PULSE1);
  }

  frameCounter++;
}
