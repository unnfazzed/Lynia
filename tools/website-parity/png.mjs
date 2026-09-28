/**
 * Minimal pure-JS PNG codec for the website parity harness: no dependencies beyond node:zlib.
 *
 * Scope is deliberately narrow: it decodes what Chromium's screenshotter writes (8-bit, non-interlaced
 * grey / RGB / palette / grey+alpha / RGBA) into RGBA, and encodes RGBA back out (RGB when the image is
 * opaque, so the diff/sheet PNGs stay small). It is NOT a general-purpose PNG library: 16-bit and
 * Adam7-interlaced images throw rather than decode wrongly.
 */
import { inflateSync, deflateSync } from "node:zlib";

const SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** @returns {{width:number, height:number, data:Buffer}} data is RGBA, 4 bytes per pixel. */
export function decodePng(buf) {
  if (!buf.subarray(0, 8).equals(SIGNATURE)) throw new Error("png: not a PNG file");
  let pos = 8;
  let ihdr = null;
  let palette = null;
  let trns = null;
  const idat = [];
  while (pos < buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString("latin1", pos + 4, pos + 8);
    const body = buf.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (type === "IHDR") {
      ihdr = {
        width: body.readUInt32BE(0),
        height: body.readUInt32BE(4),
        depth: body[8],
        colorType: body[9],
        interlace: body[12],
      };
    } else if (type === "PLTE") palette = body;
    else if (type === "tRNS") trns = body;
    else if (type === "IDAT") idat.push(body);
    else if (type === "IEND") break;
  }
  if (!ihdr) throw new Error("png: missing IHDR");
  const { width, height, depth, colorType, interlace } = ihdr;
  const ch = CHANNELS[colorType];
  if (!ch) throw new Error(`png: unsupported colour type ${colorType}`);
  if (depth !== 8) throw new Error(`png: unsupported bit depth ${depth} (only 8-bit)`);
  if (interlace !== 0) throw new Error("png: interlaced PNGs are not supported");

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * ch;
  const px = Buffer.alloc(stride * height);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < height; y++) {
    const ft = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = px.subarray(y * stride, (y + 1) * stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= ch ? out[i - ch] : 0;
      const b = prev[i];
      const c = i >= ch ? prev[i - ch] : 0;
      let v = src[i];
      if (ft === 1) v += a;
      else if (ft === 2) v += b;
      else if (ft === 3) v += (a + b) >> 1;
      else if (ft === 4) v += paeth(a, b, c);
      else if (ft !== 0) throw new Error(`png: bad filter type ${ft} on row ${y}`);
      out[i] = v & 0xff;
    }
    prev = out;
  }

  if (colorType === 6) return { width, height, data: px };
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0, j = 0; i < width * height; i++, j += ch) {
    let r,
      g,
      b,
      a = 255;
    if (colorType === 2) [r, g, b] = [px[j], px[j + 1], px[j + 2]];
    else if (colorType === 0) r = g = b = px[j];
    else if (colorType === 4) [r, g, b, a] = [px[j], px[j], px[j], px[j + 1]];
    else {
      const k = px[j];
      [r, g, b] = [palette[k * 3], palette[k * 3 + 1], palette[k * 3 + 2]];
      if (trns && k < trns.length) a = trns[k];
    }
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  }
  return { width, height, data };
}

function chunk(type, body) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(body.length, 0);
  head.write(type, 4, "latin1");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])), 0);
  return Buffer.concat([head, body, crc]);
}

/**
 * Encode RGBA pixels as PNG. Writes colour type 2 (RGB) when every pixel is opaque, else 6 (RGBA).
 * Per-row adaptive filtering (minimum sum of absolute differences), the usual libpng heuristic.
 */
export function encodePng({ width, height, data }) {
  let opaque = true;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 255) {
      opaque = false;
      break;
    }
  }
  const ch = opaque ? 3 : 4;
  const stride = width * ch;
  const rows = Buffer.alloc((stride + 1) * height);
  let prev = Buffer.alloc(stride);
  const cur = Buffer.alloc(stride);
  const cand = [0, 1, 2, 3, 4].map(() => Buffer.alloc(stride));
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const s = (y * width + x) * 4;
      const d = x * ch;
      cur[d] = data[s];
      cur[d + 1] = data[s + 1];
      cur[d + 2] = data[s + 2];
      if (ch === 4) cur[d + 3] = data[s + 3];
    }
    let best = 0;
    let bestSum = Infinity;
    for (let ft = 0; ft < 5; ft++) {
      const o = cand[ft];
      let sum = 0;
      for (let i = 0; i < stride; i++) {
        const a = i >= ch ? cur[i - ch] : 0;
        const b = prev[i];
        const c = i >= ch ? prev[i - ch] : 0;
        const p = ft === 0 ? 0 : ft === 1 ? a : ft === 2 ? b : ft === 3 ? (a + b) >> 1 : paeth(a, b, c);
        const v = (cur[i] - p) & 0xff;
        o[i] = v;
        sum += v < 128 ? v : 256 - v;
      }
      if (sum < bestSum) {
        bestSum = sum;
        best = ft;
      }
    }
    rows[y * (stride + 1)] = best;
    cand[best].copy(rows, y * (stride + 1) + 1);
    cur.copy(prev);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = opaque ? 2 : 6;
  return Buffer.concat([
    SIGNATURE,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(rows, { level: 6 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
