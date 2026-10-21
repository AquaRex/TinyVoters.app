// Writes the PWA icons (public/icons/*.png) from a 16x16 pixel design. Run: node tools/make-icons.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const OUT = path.join(ROOT, 'public', 'icons');

// . background, # frame, y/b/p/s logo blocks (yellow, blue, pink, shine), k shadow
const DESIGN = [
  '................',
  '................',
  '......yyyy......',
  '.....syyyyk.....',
  '.....yyyyyk.....',
  '.....yyyyyk.....',
  '......kkkk......',
  '...bbbb..pppp...',
  '..sbbbbksppppk..',
  '..bbbbbkpppppk..',
  '..bbbbbkpppppk..',
  '...kkkk..kkkk...',
  '................',
  '................',
  '................',
  '................',
];
const COLORS = {
  '.': [44, 46, 59],
  y: [226, 184, 90],
  b: [75, 120, 168],
  p: [196, 93, 122],
  s: [251, 245, 233],
  k: [25, 26, 34],
};

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, pad) {
  const inner = size - pad * 2;
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const gx = Math.floor(((x - pad) / inner) * 16);
      const gy = Math.floor(((y - pad) / inner) * 16);
      const ch = gx >= 0 && gy >= 0 && gx < 16 && gy < 16 ? DESIGN[gy][gx] : '.';
      raw.set(COLORS[ch], y * (size * 3 + 1) + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'icon-192.png'), png(192, 0));
fs.writeFileSync(path.join(OUT, 'icon-512.png'), png(512, 0));
// maskable: keep the logo inside the safe zone
fs.writeFileSync(path.join(OUT, 'maskable-512.png'), png(512, 64));
fs.writeFileSync(path.join(OUT, 'apple-touch-icon.png'), png(180, 10));
console.log('icons written to', OUT);
