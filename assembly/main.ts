// ===========================================================================
// Project Warpcore - A 3D Perspective Starfield
// Rebuilt from first principles for WASM-4 + AssemblyScript compatibility
// ===========================================================================

// ---------------------------------------------------------------------------
// WASM-4 Memory-Mapped I/O (these addresses are provided by WASM-4)
// ---------------------------------------------------------------------------
const PALETTE: usize = 0x04;
const DRAW_COLORS: usize = 0x14;
const FRAMEBUFFER: usize = 0xa0;

// ---------------------------------------------------------------------------
// WASM-4 API Functions (imported from WASM-4 runtime)
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
// Star Data (using proper AssemblyScript StaticArrays)
// ---------------------------------------------------------------------------
const starX = new StaticArray<f32>(STAR_COUNT);
const starY = new StaticArray<f32>(STAR_COUNT);
const starZ = new StaticArray<f32>(STAR_COUNT);

// Audio note arrays
const bassNotes = new StaticArray<u32>(4);
const arpNotes = new StaticArray<u32>(4);

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
// Star Management
// ---------------------------------------------------------------------------
function resetStar(idx: i32): void {
  starX[idx] = randomRange(-80.0, 80.0);
  starY[idx] = randomRange(-80.0, 80.0);
  starZ[idx] = MAX_DISTANCE;
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
  // Set Gemstone Palette
  store<u32>(PALETTE + 0, 0x000000);  // PALETTE[0] = Obsidian (Background)
  store<u32>(PALETTE + 4, 0x6C757D);  // PALETTE[1] = Hematite (Far Stars)
  store<u32>(PALETTE + 8, 0x87CEEB);  // PALETTE[2] = Celestite (Near Stars)
  store<u32>(PALETTE + 12, 0xFFFFFF); // PALETTE[3] = Moonstone (Text)

  // Initialize audio note data
  bassNotes[0] = NOTE_C2;
  bassNotes[1] = NOTE_G1;
  bassNotes[2] = NOTE_F2;
  bassNotes[3] = NOTE_E2;

  arpNotes[0] = NOTE_C4;
  arpNotes[1] = NOTE_G3;
  arpNotes[2] = NOTE_F4;
  arpNotes[3] = NOTE_E4;

  // Reset global state
  frameCounter = 0;
  lastBassAct = 0xFFFFFFFF;

  // Initialize stars with random z distribution
  for (let i: i32 = 0; i < STAR_COUNT; i++) {
    starX[i] = randomRange(-80.0, 80.0);
    starY[i] = randomRange(-80.0, 80.0);
    starZ[i] = randomRange(1.0, MAX_DISTANCE);
  }

  initialized = true;
}

// ---------------------------------------------------------------------------
// WASM-4 Lifecycle: update()
// ---------------------------------------------------------------------------
export function update(): void {
  // Ensure initialization
  if (!initialized) {
    start();
  }

  // Clear screen to black (PALETTE[0])
  store<u16>(DRAW_COLORS, 0x0001);
  rect(0, 0, 160, 160);

  // Draw starfield
  for (let i: i32 = 0; i < STAR_COUNT; i++) {
    let x = starX[i];
    let y = starY[i];
    let z = starZ[i];

    // Move star forward
    z -= SPEED;

    // Reset if too close
    if (z < 1.0) {
      x = randomRange(-80.0, 80.0);
      y = randomRange(-80.0, 80.0);
      z = MAX_DISTANCE;
      starX[i] = x;
      starY[i] = y;
    }

    starZ[i] = z;

    // 3D perspective projection
    const invZ = 1.0 / z;
    const screenX = x * invZ + 80.0;
    const screenY = y * invZ + 80.0;

    // Bounds check
    if (screenX < 0.0 || screenX >= 160.0 || screenY < 0.0 || screenY >= 160.0) {
      continue;
    }

    // Color based on depth (far = gray, near = blue)
    const colorIndex: u16 = z > FAR_PLANE_DISTANCE ? 0x0002 : 0x0003;
    store<u16>(DRAW_COLORS, colorIndex);

    // Draw pixel
    pset(i32(screenX), i32(screenY));
  }

  // Draw text
  store<u16>(DRAW_COLORS, 0x0004); // White text
  text("WARPCORE P4", 40, 150);

  // Audio tracker (4-act sequence, 16 seconds each)
  const actIndex = (frameCounter / (60 * 16)) % 4;

  // Bass note - play once per act change
  if (actIndex != lastBassAct) {
    const bassFreq = bassNotes[actIndex];
    tone(bassFreq, 60 * 16, 40, TONE_PULSE2);
    lastBassAct = actIndex;
  }

  // Arp note - play every 8 frames
  if ((frameCounter % 8) == 0) {
    const arpFreq = arpNotes[actIndex];
    tone(arpFreq, 8, 60, TONE_PULSE1);
  }

  frameCounter++;
}
