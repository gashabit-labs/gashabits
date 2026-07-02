// ============================================================================
// COMPONENT ASSEMBLY LINE ART ENGINE  (100% client-side, deterministic)
// No AI / ONNX / WebGPU. Pure hardcoded component dictionary + hash seeding.
// All sprites are 32x32 and painted symmetrically across the vertical axis.
// ============================================================================

export const SPRITE_SIZE = 32;

// --- Cohesive color palette matrices (roles: outline/dark/main/light/accent/extra)
export const PALETTES = {
  "Synthwave Neon": { outline: "#180033", dark: "#c81d77", main: "#ff2d95", light: "#ffb3e6", accent: "#22d3ee", extra: "#a855f7" },
  "Forest Green": { outline: "#12210f", dark: "#2f6b2f", main: "#4caf50", light: "#a5d6a7", accent: "#ffd54f", extra: "#8d6e63" },
  "Pastel Dream": { outline: "#5a5a6e", dark: "#f48fb1", main: "#ffc1d9", light: "#fff0f6", accent: "#9fc4ff", extra: "#c4b0ff" },
  "Ember Forge": { outline: "#2b0a00", dark: "#b3541e", main: "#ff7b00", light: "#ffd29d", accent: "#ffe066", extra: "#e63946" },
  "Cryo Ice": { outline: "#0a1a2b", dark: "#1d6fb8", main: "#4dabf7", light: "#d0ebff", accent: "#ffffff", extra: "#7048e8" },
};
const PALETTE_NAMES = Object.keys(PALETTES);

// ---------------------------------------------------------------------------
// Grid: draws only on the LEFT half (x 0..15) then mirrors to guarantee symmetry
// ---------------------------------------------------------------------------
class Grid {
  constructor() {
    this.cells = new Array(SPRITE_SIZE * SPRITE_SIZE).fill(null);
  }
  set(x, y, c) {
    if (x < 0 || x > 15 || y < 0 || y > 31 || !c) return;
    this.cells[y * SPRITE_SIZE + Math.floor(x)] = c;
  }
  rect(x, y, w, h, c) {
    for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) this.set(x + i, y + j, c);
  }
  ellipse(cx, cy, rx, ry, c) {
    for (let x = 0; x <= 15; x++)
      for (let y = 0; y <= 31; y++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c);
      }
  }
  ring(cx, cy, rx, ry, c) {
    // outline-only ellipse approximation
    for (let x = 0; x <= 15; x++)
      for (let y = 0; y <= 31; y++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        const d = dx * dx + dy * dy;
        if (d <= 1 && d > 0.55) this.set(x, y, c);
      }
  }
  vline(x, y0, y1, c) { for (let y = y0; y <= y1; y++) this.set(x, y, c); }
  hline(x0, x1, y, c) { for (let x = x0; x <= x1; x++) this.set(x, y, c); }
  tri(x0, y0, h, dir, c) {
    // simple triangle for ears / hats; dir 1 => point up
    for (let j = 0; j < h; j++) {
      const w = dir > 0 ? h - j : j + 1;
      for (let i = 0; i < w; i++) this.set(x0 + i, y0 + j, c);
    }
  }
  // Produce the final mirrored 32x32 matrix
  bake() {
    const out = new Array(SPRITE_SIZE * SPRITE_SIZE).fill(null);
    for (let y = 0; y < SPRITE_SIZE; y++)
      for (let x = 0; x <= 15; x++) {
        const c = this.cells[y * SPRITE_SIZE + x];
        if (c) {
          out[y * SPRITE_SIZE + x] = c;
          out[y * SPRITE_SIZE + (31 - x)] = c;
        }
      }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Deterministic byte picker seeded by the verified transaction hash
// ---------------------------------------------------------------------------
class Picker {
  constructor(hash) {
    const h = hash.replace(/^0x/, "").toLowerCase();
    this.bytes = [];
    for (let i = 0; i + 1 < h.length; i += 2) this.bytes.push(parseInt(h.substr(i, 2), 16) || 0);
    if (this.bytes.length === 0) this.bytes = [1, 2, 3, 4];
    this.i = 0;
  }
  next(mod) {
    const v = this.bytes[this.i % this.bytes.length];
    this.i++;
    return mod ? v % mod : v;
  }
}

// ============================================================================
// COMPONENT DICTIONARY — four exact archetypes
// ============================================================================

// 1) TERRARIA-STYLE GAME CHARACTERS ------------------------------------------
function buildCharacter(g, P, p) {
  const kind = p.next(3); // 0 knight, 1 slime, 2 wizard
  if (kind === 1) {
    // SLIME
    g.ellipse(15.5, 22, 12, 9, P.outline);
    g.ellipse(15.5, 22, 10.5, 7.6, P.main);
    g.ellipse(15.5, 18, 8, 4, P.light);
    // eyes
    g.rect(9, 20, 2, 3, P.outline);
    g.rect(9, 20, 1, 2, P.light);
    // mouth
    g.hline(12, 15, 26, P.outline);
    return "Gel Slime";
  }
  if (kind === 2) {
    // WIZARD
    g.tri(3, 2, 12, 1, P.extra); // hat cone (left slope)
    g.rect(3, 13, 13, 2, P.extra);
    g.set(6, 5, P.accent); g.set(4, 9, P.accent);
    g.ellipse(15.5, 19, 7, 6, P.light); // face
    g.ellipse(15.5, 19, 6, 5, P.main);
    g.rect(9, 18, 2, 2, P.outline); // eyes
    g.rect(6, 24, 20, 8, P.dark); // beard/robe
    g.ellipse(15.5, 24, 7, 4, P.light);
    return "Arcane Wizard";
  }
  // KNIGHT
  g.rect(6, 5, 20, 11, P.outline); // helmet
  g.rect(7, 6, 18, 9, P.light);
  g.rect(7, 9, 18, 2, P.outline); // visor slit
  g.rect(13, 2, 6, 4, P.accent); // plume base
  g.tri(11, 0, 3, 1, P.extra);
  g.rect(5, 17, 22, 12, P.outline); // body armor
  g.rect(6, 18, 20, 10, P.main);
  g.rect(6, 22, 20, 2, P.dark);
  g.ellipse(15.5, 23, 4, 4, P.accent); // gem
  return "Iron Knight";
}

// 2) CUTE CATS ---------------------------------------------------------------
function buildCat(g, P, p) {
  // body
  g.ellipse(15.5, 25, 11, 7, P.outline);
  g.ellipse(15.5, 25, 9.5, 5.8, P.main);
  // head
  g.ellipse(15.5, 14, 9, 8, P.outline);
  g.ellipse(15.5, 14, 7.6, 6.6, P.main);
  // ears
  g.tri(4, 3, 6, 1, P.outline);
  g.tri(5, 4, 4, 1, P.main);
  g.set(6, 6, P.light);
  // pattern variant
  const pat = p.next(3);
  if (pat === 0) { g.rect(4, 10, 3, 8, P.dark); } // tabby stripe
  if (pat === 1) { g.ellipse(8, 22, 4, 4, P.light); } // patch
  // eyes
  g.rect(9, 13, 2, 3, P.accent);
  g.set(9, 13, P.outline);
  // nose + cheeks
  g.set(15, 16, P.extra);
  g.set(14, 17, P.extra);
  g.set(11, 17, P.light);
  // whiskers
  g.hline(2, 8, 17, P.outline);
  g.hline(2, 8, 19, P.outline);
  // cute cosmetic hat variant
  const hat = p.next(4);
  if (hat === 0) { g.tri(11, 1, 4, 1, P.extra); g.hline(9, 15, 5, P.extra); } // party hat
  if (hat === 1) { g.rect(6, 3, 20, 2, P.accent); g.rect(9, 0, 14, 3, P.accent); } // top hat
  if (hat === 2) { g.rect(6, 4, 20, 2, P.extra); g.tri(11, 0, 4, 1, P.accent); } // crown-ish
  return "Cosmic Cat";
}

// 3) COLORFUL FLOWERS --------------------------------------------------------
function buildFlower(g, P, p) {
  // twisty roots / stem
  g.vline(15, 20, 31, P.dark);
  g.set(14, 24, P.dark); g.set(13, 27, P.dark); g.set(12, 30, P.dark);
  // leaves
  g.ellipse(10, 25, 4, 2, P.accent);
  // petals (top + upper-left + left)
  const petal = P.main;
  g.ellipse(15.5, 6, 4, 4, petal);
  g.ellipse(9, 10, 4, 4, petal);
  g.ellipse(8, 16, 4, 3.5, petal);
  g.ellipse(12, 4, 3, 3, P.light);
  // center
  g.ellipse(15.5, 12, 5, 5, P.outline);
  g.ellipse(15.5, 12, 3.6, 3.6, P.extra);
  g.set(14, 11, P.light);
  // floating pollen pixels
  const dots = p.next(4);
  for (let k = 0; k <= dots; k++) g.set(3 + k * 2, 3 + (k % 3) * 3, P.accent);
  return "Bloom Sprite";
}

// 4) RPG ITEMS ---------------------------------------------------------------
function buildItem(g, P, p) {
  const kind = p.next(3); // 0 sword, 1 shield, 2 potion
  if (kind === 1) {
    // SHIELD
    g.rect(5, 4, 22, 16, P.outline);
    g.rect(6, 5, 20, 15, P.main);
    // rounded bottom point
    g.ellipse(15.5, 22, 11, 8, P.outline);
    g.ellipse(15.5, 22, 9.5, 6.5, P.main);
    g.rect(6, 5, 20, 2, P.light); // rim highlight
    g.vline(15, 6, 26, P.accent); // emblem cross
    g.hline(9, 15, 12, P.accent);
    g.ellipse(15.5, 12, 3, 3, P.extra);
    return "Guardian Shield";
  }
  if (kind === 2) {
    // POTION
    g.rect(13, 2, 6, 3, P.extra); // cork
    g.rect(13, 5, 6, 3, P.light); // neck
    g.ellipse(15.5, 20, 9, 10, P.outline); // bottle
    g.ellipse(15.5, 20, 7.6, 8.6, P.light);
    g.ellipse(15.5, 23, 6.5, 6, P.main); // liquid
    g.set(11, 16, P.accent); // shine
    g.set(10, 18, P.light);
    return "Mystic Potion";
  }
  // SWORD
  g.vline(15, 2, 20, P.light); // blade
  g.set(14, 3, P.accent);
  g.rect(14, 2, 3, 2, P.light);
  g.hline(9, 15, 21, P.extra); // crossguard
  g.hline(9, 15, 22, P.dark);
  g.rect(14, 23, 3, 6, P.dark); // grip
  g.ellipse(15.5, 30, 3, 2, P.accent); // pommel
  return "Hero Blade";
}

const CATEGORIES = [
  { name: "Game Character", build: buildCharacter },
  { name: "Cute Cat", build: buildCat },
  { name: "Colorful Flower", build: buildFlower },
  { name: "RPG Item", build: buildItem },
];

// ============================================================================
// THE SHUFFLE MECHANIC — hash string is the absolute mathematical seed
// ============================================================================
export function generateSprite(hash) {
  const clean = (hash || "").replace(/^0x/, "").toLowerCase() || "deadbeefcafef00d";
  // Category chosen strictly per spec: parseInt(chunk,16) % vault.length
  const catIndex = parseInt(clean.slice(0, 4) || "0", 16) % CATEGORIES.length;
  const palIndex = parseInt(clean.slice(4, 8) || "0", 16) % PALETTE_NAMES.length;
  const paletteName = PALETTE_NAMES[palIndex];
  const P = PALETTES[paletteName];

  const g = new Grid();
  // consume hash from an offset so palette bytes don't fully overlap layer picks
  const picker = new Picker(clean.slice(8) + clean.slice(0, 8));
  const category = CATEGORIES[catIndex];
  const label = category.build(g, P, picker);

  return {
    hash: clean,
    category: category.name,
    paletteName,
    label,
    pixels: g.bake(), // flat 32x32 array of color strings or null
  };
}

// ============================================================================
// RENDERING — pixelated, crisp scaling on any display
// ============================================================================
export function drawSpriteToCanvas(canvas, sprite, scale = 12) {
  if (!canvas || !sprite) return;
  const size = SPRITE_SIZE * scale;
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, size, size);
  for (let y = 0; y < SPRITE_SIZE; y++)
    for (let x = 0; x < SPRITE_SIZE; x++) {
      const c = sprite.pixels[y * SPRITE_SIZE + x];
      if (c) {
        ctx.fillStyle = c;
        ctx.fillRect(x * scale, y * scale, scale, scale);
      }
    }
}
