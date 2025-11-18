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
const STAR_COUNT: i32 = 80;
const BG_STAR_COUNT: i32 = 40;
const STAR_COUNT: i32 = 96;
const MAX_DISTANCE: f32 = 200.0;
const NEAR_PLANE: f32 = MAX_DISTANCE / 3.0;
const FAR_PLANE: f32 = MAX_DISTANCE * 2.0 / 3.0;
const SPEED: f32 = 2.5;

// Audio constants
const TONE_PULSE1: u32 = 0;
const TONE_PULSE2: u32 = 1;
const TONE_TRIANGLE: u32 = 2;
const TONE_NOISE: u32 = 3;

// Note frequencies (Hz) - More musical scale
const NOTE_C3: u32 = 131;
const NOTE_D3: u32 = 147;
const NOTE_E3: u32 = 165;
const NOTE_F3: u32 = 175;
const NOTE_G3: u32 = 196;
const NOTE_A3: u32 = 220;
const NOTE_C4: u32 = 262;
const NOTE_D4: u32 = 294;
const NOTE_E4: u32 = 330;
const NOTE_F4: u32 = 349;
const NOTE_G4: u32 = 392;
const NOTE_A4: u32 = 440;
const NOTE_C5: u32 = 523;

// ---------------------------------------------------------------------------
// Star Data Storage (using WASM-4 free memory region)
// WASM-4 memory map:
//   0xa0-0x19a0: Framebuffer (6400 bytes)
//   0x19a0+: Free memory for custom data
// ---------------------------------------------------------------------------
const starX = memory.data<f32>([
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
]);

const starY = memory.data<f32>([
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
]);

const starZ = memory.data<f32>([
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
]);

// Background stars (static positions)
const bgStarX = memory.data<f32>([
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0
]);

const bgStarY = memory.data<f32>([
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  0, 0, 0, 0, 0, 0, 0, 0
]);

// Audio progression data (bass and arp notes)
const bassNotes = memory.data<u32>([NOTE_C2, NOTE_G1, NOTE_F2, NOTE_E2]);
const arpNotes = memory.data<u32>([NOTE_C4, NOTE_G3, NOTE_F4, NOTE_E4]);
const STAR_DATA_BASE: usize = 0x19a0;
const starX: usize = STAR_DATA_BASE;           // 96 * 4 = 384 bytes
const starY: usize = STAR_DATA_BASE + 384;     // 96 * 4 = 384 bytes
const starZ: usize = STAR_DATA_BASE + 768;     // 96 * 4 = 384 bytes

// Audio note data
const bassNotes: usize = STAR_DATA_BASE + 1152;  // 4 * 4 = 16 bytes
const arpNotes: usize = STAR_DATA_BASE + 1168;   // 4 * 4 = 16 bytes

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
function resetStar(idx: i32): void {
  store<f32>(starX + (idx << 2), randomRange(-250.0, 250.0));
  store<f32>(starY + (idx << 2), randomRange(-250.0, 250.0));
  store<f32>(starZ + (idx << 2), MAX_DISTANCE);
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
  if (initialized) return;

  // Set Gemstone Palette
  store<u32>(PALETTE + 0, 0x000000); // PALETTE[0] = Obsidian (Background)
  store<u32>(PALETTE + 4, 0x6C757D); // PALETTE[1] = Hematite (Far Stars)
  store<u32>(PALETTE + 8, 0x87CEEB); // PALETTE[2] = Celestite (Near Stars)
  store<u32>(PALETTE + 12, 0xFFFFFF); // PALETTE[3] = Moonstone (Scroller Text)

  // Initialize moving stars
  // Set palette
  store<u32>(PALETTE + 0, 0x000000);   // Black background
  store<u32>(PALETTE + 4, 0x4A5568);   // Dark gray (distant stars)
  store<u32>(PALETTE + 8, 0xE0E0E0);   // Light gray (medium stars)
  store<u32>(PALETTE + 12, 0xFFFFFF);  // White (close stars & text)

  // Initialize audio notes - C minor progression
  store<u32>(bassNotes + 0, NOTE_C3);
  store<u32>(bassNotes + 4, NOTE_G3);
  store<u32>(bassNotes + 8, NOTE_F3);
  store<u32>(bassNotes + 12, NOTE_D3);

  store<u32>(arpNotes + 0, NOTE_C5);
  store<u32>(arpNotes + 4, NOTE_E4);
  store<u32>(arpNotes + 8, NOTE_G4);
  store<u32>(arpNotes + 12, NOTE_A4);

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

  // Initialize background stars (static, evenly distributed)
  for (let i: i32 = 0; i < BG_STAR_COUNT; i++) {
    const x = randomRange(0.0, 160.0);
    const y = randomRange(0.0, 160.0);
    store<f32>(bgStarX + (i << 2), x);
    store<f32>(bgStarY + (i << 2), y);
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

  // -------------------------------------------------------------------------
  // 2. Background Stars (Static)
  // -------------------------------------------------------------------------
  store<u16>(DRAW_COLORS, 0x0002); // PALETTE[1] = Hematite (dim)
  for (let i: i32 = 0; i < BG_STAR_COUNT; i++) {
    const offset = i << 2;
    const x = i32(load<f32>(bgStarX + offset));
    const y = i32(load<f32>(bgStarY + offset));
    pset(x, y);
  }

  // -------------------------------------------------------------------------
  // 3. Starfield Kernel (3D Projection)
  // -------------------------------------------------------------------------
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
      store<f32>(starX + offset, randomRange(-250.0, 250.0));
      store<f32>(starY + offset, randomRange(-250.0, 250.0));
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

    // Bounds check with margin for larger stars
    if (screenX < -2.0 || screenX >= 162.0 || screenY < -2.0 || screenY >= 162.0) {
      continue;
    }

    const sx = i32(screenX);
    const sy = i32(screenY);

    // Three-tier color and size based on depth
    if (z < NEAR_PLANE) {
      // Close stars - white, larger (2x2)
      store<u16>(DRAW_COLORS, 0x0004);
      pset(sx, sy);
      pset(sx + 1, sy);
      pset(sx, sy + 1);
      pset(sx + 1, sy + 1);
    } else if (z < FAR_PLANE) {
      // Medium stars - light gray, medium size (cross pattern)
      store<u16>(DRAW_COLORS, 0x0003);
      pset(sx, sy);
      pset(sx + 1, sy);
      pset(sx, sy + 1);
    } else {
      // Far stars - dark gray, single pixel
      store<u16>(DRAW_COLORS, 0x0002);
      pset(sx, sy);
    }
  }

  // -------------------------------------------------------------------------
  // 4. Text Display
  // -------------------------------------------------------------------------
  store<u16>(DRAW_COLORS, 0x0004); // PALETTE[3] = Moonstone
  text("WARPCORE P4", 40, 150);

  // -------------------------------------------------------------------------
  // 5. Audio Tracker (64-second, 4-act sequence)
  // -------------------------------------------------------------------------
  const actIndex = (frameCounter / (60 * 16)) % 4;
  // Draw text
  store<u16>(DRAW_COLORS, 0x0004);
  text("WARPCORE P4", 40, 150);

  // Audio tracker - faster progression
  const actIndex = (frameCounter / (60 * 4)) % 4;

  // Bass note - play once per act change with triangle wave
  if (actIndex != lastBassAct) {
    const bassFreq = load<u32>(bassNotes + (actIndex << 2));
    tone(bassFreq, 60 * 4, 50, TONE_TRIANGLE);
    lastBassAct = actIndex;
  }

  // Melody - varied rhythm pattern
  const beatPos = frameCounter % 32;
  if (beatPos == 0 || beatPos == 8 || beatPos == 12 || beatPos == 20) {
    const arpFreq = load<u32>(arpNotes + (actIndex << 2));
    const duration = (beatPos == 12) ? 12 : 6;
    const volume = (beatPos == 0) ? 80 : 60;
    tone(arpFreq, duration, volume, TONE_PULSE1);
  }

  // Ambient pad on beat 16
  if (beatPos == 16) {
    const bassFreq = load<u32>(bassNotes + (actIndex << 2));
    tone(bassFreq * 2, 20, 30, TONE_PULSE2);
  }

  frameCounter++;
}
