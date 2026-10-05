/**
 * A small QR Code generator: byte mode, versions 1 to 10, error correction L, M, Q or H, all eight masks tried and the lowest-penalty one kept.
 * It is a compact port of the structure in the QR Code Model 2 standard (ISO/IEC 18004), written for the "scan to open on your phone" code on `/app`
 * so the page needs no dependency and no image. Pure functions: the result is a matrix of booleans, drawn as SVG by the caller.
 */

export type Ecc = "L" | "M" | "Q" | "H";

/** Format-bit codes for each level. */
const ECC_BITS: Record<Ecc, number> = { L: 1, M: 0, Q: 3, H: 2 };

/** Error-correction codewords per block, and number of blocks, for versions 1 to 10 (index 0 unused). Indexed by ecc then version. */
const ECC_PER_BLOCK: Record<Ecc, readonly number[]> = {
  L: [0, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18],
  M: [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
  Q: [0, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24],
  H: [0, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28],
};
const BLOCKS: Record<Ecc, readonly number[]> = {
  L: [0, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4],
  M: [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5],
  Q: [0, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8],
  H: [0, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8],
};

const MAX_VERSION = 10;

/** Total data and error-correction codewords of a version (function patterns removed). */
function rawCodewords(version: number): number {
  let modules = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    modules -= (25 * align - 10) * align - 55;
    if (version >= 7) modules -= 36; // version information
  }
  return Math.floor(modules / 8);
}

function dataCodewords(version: number, ecc: Ecc): number {
  return rawCodewords(version) - ECC_PER_BLOCK[ecc][version] * BLOCKS[ecc][version];
}

// ── Reed-Solomon over GF(256), polynomial 0x11D ──

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255] ?? 0;
})();

const gfMul = (a: number, b: number): number => (a === 0 || b === 0 ? 0 : (EXP[(LOG[a] ?? 0) + (LOG[b] ?? 0)] ?? 0));

function generator(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = new Array<number>(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j += 1) {
      next[j] = (next[j] ?? 0) ^ (poly[j] ?? 0);
      next[j + 1] = (next[j + 1] ?? 0) ^ gfMul(poly[j] ?? 0, EXP[i] ?? 0);
    }
    poly = next;
  }
  return poly;
}

function remainder(data: readonly number[], degree: number): number[] {
  const gen = generator(degree);
  const rem = new Array<number>(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ (rem.shift() ?? 0);
    rem.push(0);
    for (let i = 0; i < degree; i += 1) rem[i] = (rem[i] ?? 0) ^ gfMul(gen[i + 1] ?? 0, factor);
  }
  return rem;
}

// ── bit helpers ──

function pushBits(bits: number[], value: number, length: number): void {
  for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1);
}

function utf8(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

function bchFormat(data: number): number {
  let rem = data;
  for (let i = 0; i < 10; i += 1) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}

function bchVersion(version: number): number {
  let rem = version;
  for (let i = 0; i < 12; i += 1) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (version << 12) | rem;
}

function alignmentPositions(version: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const size = version * 4 + 17;
  const step = Math.floor((version * 8 + count * 3 + 5) / (count * 4 - 4)) * 2;
  const out = [6];
  for (let pos = size - 7; out.length < count; pos -= step) out.splice(1, 0, pos);
  return out;
}

export interface QrCode {
  /** Modules per side. */
  size: number;
  version: number;
  mask: number;
  /** `modules[y][x]` is true for a dark module. */
  modules: readonly (readonly boolean[])[];
}

/**
 * Encodes `text` (UTF-8, byte mode) into the smallest version that fits at the requested error-correction level. Throws if it does not fit in
 * version 10 (about 270 bytes at level L), which is far more than any URL the site encodes.
 */
export function encodeQr(text: string, ecc: Ecc = "M", forceMask?: number): QrCode {
  const bytes = utf8(text);
  let version = 1;
  for (; version <= MAX_VERSION; version += 1) {
    const countBits = version < 10 ? 8 : 16;
    if (4 + countBits + bytes.length * 8 <= dataCodewords(version, ecc) * 8) break;
  }
  if (version > MAX_VERSION) throw new Error("The text is too long for a version 10 QR code.");

  // data bits: mode 0100, character count, bytes, terminator, padding
  const bits: number[] = [];
  pushBits(bits, 0b0100, 4);
  pushBits(bits, bytes.length, version < 10 ? 8 : 16);
  for (const byte of bytes) pushBits(bits, byte, 8);
  const capacity = dataCodewords(version, ecc) * 8;
  pushBits(bits, 0, Math.min(4, capacity - bits.length));
  while (bits.length % 8 !== 0) bits.push(0);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) pushBits(bits, pad, 8);

  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | (bits[i + j] ?? 0);
    data.push(byte);
  }

  // split into blocks, add error correction, interleave
  const blocks = BLOCKS[ecc][version] ?? 1;
  const eccLen = ECC_PER_BLOCK[ecc][version] ?? 0;
  const totalWords = rawCodewords(version);
  const shortBlocks = blocks - (totalWords % blocks);
  const shortLen = Math.floor(totalWords / blocks) - eccLen;
  const dataBlocks: number[][] = [];
  const eccBlocks: number[][] = [];
  for (let i = 0, offset = 0; i < blocks; i += 1) {
    const len = shortLen + (i < shortBlocks ? 0 : 1);
    const block = data.slice(offset, offset + len);
    offset += len;
    dataBlocks.push(block);
    eccBlocks.push(remainder(block, eccLen));
  }
  const codewords: number[] = [];
  for (let i = 0; i < shortLen + 1; i += 1) for (const block of dataBlocks) if (i < block.length) codewords.push(block[i] ?? 0);
  for (let i = 0; i < eccLen; i += 1) for (const block of eccBlocks) codewords.push(block[i] ?? 0);

  const size = version * 4 + 17;
  const reserved: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const base: boolean[][] = Array.from({ length: size }, () => new Array<boolean>(size).fill(false));
  const set = (x: number, y: number, dark: boolean): void => {
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    (base[y] as boolean[])[x] = dark;
    (reserved[y] as boolean[])[x] = true;
  };

  // function patterns: timing, finders with separators, alignment
  for (let i = 0; i < size; i += 1) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  const finder = (cx: number, cy: number): void => {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy));
        set(cx + dx, cy + dy, dist !== 2 && dist !== 4);
      }
    }
  };
  finder(3, 3);
  finder(size - 4, 3);
  finder(3, size - 4);
  const aligns = alignmentPositions(version);
  for (const ay of aligns) {
    for (const ax of aligns) {
      if ((ax === 6 && ay === 6) || (ax === 6 && ay === (aligns[aligns.length - 1] ?? 0)) || (ax === (aligns[aligns.length - 1] ?? 0) && ay === 6)) continue;
      for (let dy = -2; dy <= 2; dy += 1) for (let dx = -2; dx <= 2; dx += 1) set(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
  }

  // reserve format and version areas (drawn after the mask is chosen)
  const reserveFormat = (): void => {
    for (let i = 0; i < 9; i += 1) {
      (reserved[8] as boolean[])[i] = true;
      (reserved[i] as boolean[])[8] = true;
    }
    for (let i = 0; i < 8; i += 1) {
      (reserved[8] as boolean[])[size - 1 - i] = true;
      (reserved[size - 1 - i] as boolean[])[8] = true;
    }
    (reserved[size - 8] as boolean[])[8] = true;
  };
  reserveFormat();
  if (version >= 7) {
    for (let i = 0; i < 6; i += 1) {
      for (let j = 0; j < 3; j += 1) {
        (reserved[size - 11 + j] as boolean[])[i] = true;
        (reserved[i] as boolean[])[size - 11 + j] = true;
      }
    }
  }

  // place codeword bits in the zigzag order
  const stream: boolean[] = [];
  for (const word of codewords) for (let i = 7; i >= 0; i -= 1) stream.push(((word >>> i) & 1) === 1);
  const placed: boolean[][] = base.map((row) => row.slice());
  let k = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert += 1) {
      for (let j = 0; j < 2; j += 1) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!(reserved[y] as boolean[])[x] && k < stream.length) {
          (placed[y] as boolean[])[x] = stream[k] ?? false;
          k += 1;
        }
      }
    }
  }

  const maskFn = (mask: number, x: number, y: number): boolean => {
    switch (mask) {
      case 0:
        return (x + y) % 2 === 0;
      case 1:
        return y % 2 === 0;
      case 2:
        return x % 3 === 0;
      case 3:
        return (x + y) % 3 === 0;
      case 4:
        return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0;
      case 5:
        return ((x * y) % 2) + ((x * y) % 3) === 0;
      case 6:
        return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
      default:
        return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    }
  };

  const build = (mask: number): boolean[][] => {
    const grid = placed.map((row) => row.slice());
    for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) if (!(reserved[y] as boolean[])[x] && maskFn(mask, x, y)) (grid[y] as boolean[])[x] = !(grid[y] as boolean[])[x];
    // format bits
    const format = bchFormat((ECC_BITS[ecc] << 3) | mask);
    const bit = (i: number): boolean => ((format >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i += 1) (grid[i] as boolean[])[8] = bit(i);
    (grid[7] as boolean[])[8] = bit(6);
    (grid[8] as boolean[])[8] = bit(7);
    (grid[8] as boolean[])[7] = bit(8);
    for (let i = 9; i < 15; i += 1) (grid[8] as boolean[])[14 - i] = bit(i);
    for (let i = 0; i < 8; i += 1) (grid[8] as boolean[])[size - 1 - i] = bit(i);
    for (let i = 8; i < 15; i += 1) (grid[size - 15 + i] as boolean[])[8] = bit(i);
    (grid[size - 8] as boolean[])[8] = true; // the always-dark module
    if (version >= 7) {
      const info = bchVersion(version);
      for (let i = 0; i < 18; i += 1) {
        const dark = ((info >>> i) & 1) === 1;
        const a = size - 11 + (i % 3);
        const b = Math.floor(i / 3);
        (grid[a] as boolean[])[b] = dark;
        (grid[b] as boolean[])[a] = dark;
      }
    }
    return grid;
  };

  const penalty = (grid: boolean[][]): number => {
    let score = 0;
    const lineScore = (cells: boolean[]): number => {
      let s = 0;
      let run = 1;
      for (let i = 1; i < cells.length; i += 1) {
        if (cells[i] === cells[i - 1]) {
          run += 1;
          if (run === 5) s += 3;
          else if (run > 5) s += 1;
        } else run = 1;
      }
      const text = cells.map((c) => (c ? "1" : "0")).join("");
      for (const pattern of ["10111010000", "00001011101"]) {
        let from = text.indexOf(pattern);
        while (from !== -1) {
          s += 40;
          from = text.indexOf(pattern, from + 1);
        }
      }
      return s;
    };
    for (let y = 0; y < size; y += 1) score += lineScore(grid[y] as boolean[]);
    for (let x = 0; x < size; x += 1) score += lineScore(grid.map((row) => row[x] as boolean));
    for (let y = 0; y < size - 1; y += 1) {
      for (let x = 0; x < size - 1; x += 1) {
        const c = (grid[y] as boolean[])[x];
        if (c === (grid[y] as boolean[])[x + 1] && c === (grid[y + 1] as boolean[])[x] && c === (grid[y + 1] as boolean[])[x + 1]) score += 3;
      }
    }
    let dark = 0;
    for (const row of grid) for (const cell of row) if (cell) dark += 1;
    score += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
    return score;
  };

  if (forceMask !== undefined) return { size, version, mask: forceMask, modules: build(forceMask) };
  let best = 0;
  let bestGrid = build(0);
  let bestScore = penalty(bestGrid);
  for (let mask = 1; mask < 8; mask += 1) {
    const grid = build(mask);
    const score = penalty(grid);
    if (score < bestScore) {
      best = mask;
      bestGrid = grid;
      bestScore = score;
    }
  }
  return { size, version, mask: best, modules: bestGrid };
}
