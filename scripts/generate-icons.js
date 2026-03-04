/**
 * Generate BillyCord app icons for Electron packaging.
 * Creates a 256x256 PNG icon matching the BillyCord logo.
 *
 * Run: node scripts/generate-icons.js
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const buildDir = path.join(__dirname, '..', 'build');

if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

const pngPath = path.join(buildDir, 'icon.png');
const icoPath = path.join(buildDir, 'icon.ico');

// ----- CRC32 -----
function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 1) crc = (crc >>> 1) ^ 0xEDB88320;
      else crc = crc >>> 1;
    }
  }
  return (crc ^ -1) >>> 0;
}

function makeChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const lengthBuffer = Buffer.alloc(4);
  lengthBuffer.writeUInt32BE(data.length);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
}

// ----- Render the BillyCord icon at 256x256 -----
const W = 256;
const H = 256;

// Color definitions matching the logo
const BG_COLOR = { r: 0, g: 0, b: 0, a: 255 };         // Black background
const BLUE = { r: 59, g: 130, b: 246, a: 255 };         // #3B82F6 - blue for BC text
const LIGHT_BLUE = { r: 96, g: 165, b: 250, a: 255 };   // Lighter accent
const WHITE = { r: 255, g: 255, b: 255, a: 255 };

// Simple pixel buffer
const pixels = Buffer.alloc(W * H * 4);

function setPixel(x, y, color) {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const idx = (y * W + x) * 4;
  pixels[idx] = color.r;
  pixels[idx + 1] = color.g;
  pixels[idx + 2] = color.b;
  pixels[idx + 3] = color.a;
}

function fillRect(x1, y1, x2, y2, color) {
  for (let y = Math.max(0, Math.floor(y1)); y < Math.min(H, Math.ceil(y2)); y++) {
    for (let x = Math.max(0, Math.floor(x1)); x < Math.min(W, Math.ceil(x2)); x++) {
      setPixel(x, y, color);
    }
  }
}

function fillCircle(cx, cy, r, color) {
  const r2 = r * r;
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      const dx = x - cx;
      const dy = y - cy;
      if (dx * dx + dy * dy <= r2) {
        setPixel(x, y, color);
      }
    }
  }
}

function fillRoundedRect(x1, y1, x2, y2, r, color) {
  // Fill center
  fillRect(x1 + r, y1, x2 - r, y2, color);
  fillRect(x1, y1 + r, x2, y2 - r, color);
  // Fill corners
  fillCircle(x1 + r, y1 + r, r, color);
  fillCircle(x2 - r, y1 + r, r, color);
  fillCircle(x1 + r, y2 - r, r, color);
  fillCircle(x2 - r, y2 - r, r, color);
}

// ----- Draw the BillyCord logo -----

// 1. Black background with rounded corners
fillRoundedRect(0, 0, 256, 256, 40, BG_COLOR);

// 2. Draw a chat bubble shape in blue (upper portion)
// Main bubble body
fillRoundedRect(30, 40, 226, 170, 24, BLUE);
// Tail of chat bubble (bottom-left triangle)
for (let row = 0; row < 35; row++) {
  const width = Math.floor(35 - row);
  fillRect(50, 170 + row, 50 + width, 171 + row, BLUE);
}

// 3. Draw "BC" text in white on the bubble
// Letter B
const bx = 60;
const by = 65;
const letterH = 80;
const letterW = 50;
const stroke = 12;

// B - vertical bar
fillRect(bx, by, bx + stroke, by + letterH, WHITE);
// B - top horizontal
fillRect(bx, by, bx + letterW, by + stroke, WHITE);
// B - middle horizontal
fillRect(bx, by + letterH / 2 - stroke / 2, bx + letterW, by + letterH / 2 + stroke / 2, WHITE);
// B - bottom horizontal
fillRect(bx, by + letterH - stroke, bx + letterW, by + letterH, WHITE);
// B - top right curve
fillRect(bx + letterW - stroke, by, bx + letterW, by + letterH / 2, WHITE);
// B - bottom right curve
fillRect(bx + letterW - stroke, by + letterH / 2, bx + letterW, by + letterH, WHITE);

// Letter C
const cx = 135;
const cy = by;

// C - vertical bar (left)
fillRect(cx, cy, cx + stroke, cy + letterH, WHITE);
// C - top horizontal
fillRect(cx, cy, cx + letterW, cy + stroke, WHITE);
// C - bottom horizontal
fillRect(cx, cy + letterH - stroke, cx + letterW, cy + letterH, WHITE);

// 4. Small dots or indicator at bottom right of bubble for chat feel
fillCircle(180, 155, 5, LIGHT_BLUE);
fillCircle(198, 155, 4, LIGHT_BLUE);
fillCircle(212, 155, 3, LIGHT_BLUE);

// 5. "BillyCord" text indicator at very bottom (small)
// Just add a subtle accent line
fillRoundedRect(60, 220, 196, 226, 3, BLUE);

// ----- Encode as PNG -----
const rawRows = [];
for (let y = 0; y < H; y++) {
  rawRows.push(0); // filter: none
  for (let x = 0; x < W; x++) {
    const idx = (y * W + x) * 4;
    rawRows.push(pixels[idx], pixels[idx + 1], pixels[idx + 2], pixels[idx + 3]);
  }
}

const rawBuffer = Buffer.from(rawRows);
const compressed = zlib.deflateSync(rawBuffer);

const pngSignature = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);

const ihdrData = Buffer.alloc(13);
ihdrData.writeUInt32BE(W, 0);
ihdrData.writeUInt32BE(H, 4);
ihdrData[8] = 8; // bit depth
ihdrData[9] = 6; // RGBA
ihdrData[10] = 0;
ihdrData[11] = 0;
ihdrData[12] = 0;

const pngFile = Buffer.concat([
  pngSignature,
  makeChunk('IHDR', ihdrData),
  makeChunk('IDAT', compressed),
  makeChunk('IEND', Buffer.alloc(0)),
]);

fs.writeFileSync(pngPath, pngFile);
console.log(`Created 256x256 BillyCord icon PNG: ${pngPath} (${pngFile.length} bytes)`);

// ----- Create ICO file -----
// ICO format: header + directory entry + PNG data
function createIco(pngBuffer) {
  // ICO header: 6 bytes
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);     // reserved
  header.writeUInt16LE(1, 2);     // type: icon
  header.writeUInt16LE(1, 4);     // 1 image

  // Directory entry: 16 bytes
  const entry = Buffer.alloc(16);
  entry[0] = 0;   // width (0 = 256)
  entry[1] = 0;   // height (0 = 256)
  entry[2] = 0;   // color palette
  entry[3] = 0;   // reserved
  entry.writeUInt16LE(1, 4);   // color planes
  entry.writeUInt16LE(32, 6);  // bits per pixel
  entry.writeUInt32LE(pngBuffer.length, 8);   // size of PNG data
  entry.writeUInt32LE(6 + 16, 12);             // offset to PNG data

  return Buffer.concat([header, entry, pngBuffer]);
}

const icoFile = createIco(pngFile);
fs.writeFileSync(icoPath, icoFile);
console.log(`Created ICO icon: ${icoPath} (${icoFile.length} bytes)`);

console.log('\nBillyCord icon generation complete!');
console.log('Files in build/:');
fs.readdirSync(buildDir).forEach(f => {
  const stat = fs.statSync(path.join(buildDir, f));
  console.log(`  ${f} (${stat.size} bytes)`);
});
