/**
 * Generate app icons for Electron packaging.
 * Creates a 256x256 PNG icon using only Node.js built-ins (no sharp/canvas).
 *
 * For production, replace build/icon.png with a proper design.
 * This creates a simple placeholder icon that works for building.
 *
 * Run: node scripts/generate-icons.js
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const buildDir = path.join(__dirname, '..', 'build');

// Ensure build directory exists
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

// Minimal valid 256x256 PNG with a purple/blue Discord-style background
// This is a base64-encoded 256x256 PNG created as a simple colored icon
// We'll generate it via a small SVG-to-PNG pipeline or just write a minimal PNG

// Create SVG icon
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" style="stop-color:#5865F2"/>
      <stop offset="100%" style="stop-color:#4752C4"/>
    </linearGradient>
  </defs>
  <rect width="256" height="256" rx="48" fill="url(#bg)"/>
  <g transform="translate(128,128)">
    <!-- Discord-style chat bubble icon -->
    <path d="M-52,-30 C-52,-44 -42,-50 -28,-50 L28,-50 C42,-50 52,-44 52,-30 L52,10 C52,24 42,30 28,30 L10,30 L-10,52 L-10,30 L-28,30 C-42,30 -52,24 -52,10 Z"
          fill="white" opacity="0.95"/>
    <!-- Two dots representing chat -->
    <circle cx="-20" cy="-10" r="8" fill="#5865F2"/>
    <circle cx="8" cy="-10" r="8" fill="#5865F2"/>
    <circle cx="36" cy="-10" r="5" fill="#5865F2" opacity="0.5"/>
  </g>
</svg>`;

const svgPath = path.join(buildDir, 'icon.svg');
fs.writeFileSync(svgPath, svg);
console.log('Created SVG icon at:', svgPath);

// Create a simple HTML-based PNG converter hint
const pngPath = path.join(buildDir, 'icon.png');
const icoPath = path.join(buildDir, 'icon.ico');

// Try to convert SVG to PNG using available tools
let converted = false;

// Method 1: Try rsvg-convert (librsvg)
try {
  execSync(`which rsvg-convert 2>/dev/null && rsvg-convert -w 256 -h 256 "${svgPath}" -o "${pngPath}"`, { stdio: 'pipe' });
  console.log('Converted SVG to PNG using rsvg-convert');
  converted = true;
} catch (e) {
  // Not available
}

// Method 2: Try ImageMagick convert
if (!converted) {
  try {
    execSync(`which convert 2>/dev/null && convert -background none -size 256x256 "${svgPath}" "${pngPath}"`, { stdio: 'pipe' });
    console.log('Converted SVG to PNG using ImageMagick');
    converted = true;
  } catch (e) {
    // Not available
  }
}

// Method 3: Create minimal 1x1 PNG as placeholder (electron-builder needs something)
if (!converted) {
  // Minimal valid PNG: 16x16 purple square
  // PNG header + IHDR + IDAT + IEND
  const pngHeader = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
  ]);

  // We'll write a minimal valid PNG manually - 16x16 pixel, 8-bit RGBA
  const width = 16;
  const height = 16;

  // IHDR chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);   // width
  ihdrData.writeUInt32BE(height, 4);  // height
  ihdrData[8] = 8;   // bit depth
  ihdrData[9] = 6;   // color type: RGBA
  ihdrData[10] = 0;  // compression
  ihdrData[11] = 0;  // filter
  ihdrData[12] = 0;  // interlace

  // Create raw image data (filter byte + RGBA for each pixel per row)
  const rawData = [];
  for (let y = 0; y < height; y++) {
    rawData.push(0); // filter: none
    for (let x = 0; x < width; x++) {
      rawData.push(0x58, 0x65, 0xF2, 0xFF); // #5865F2 with full alpha
    }
  }
  const rawBuffer = Buffer.from(rawData);

  // Compress with zlib
  const zlib = require('zlib');
  const compressed = zlib.deflateSync(rawBuffer);

  // Build IDAT chunk
  const idatData = compressed;

  // CRC32 function
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
    const crcInput = Buffer.concat([typeBuffer, data]);
    crcBuffer.writeUInt32BE(crc32(crcInput));
    return Buffer.concat([lengthBuffer, typeBuffer, data, crcBuffer]);
  }

  const ihdrChunk = makeChunk('IHDR', ihdrData);
  const idatChunk = makeChunk('IDAT', idatData);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  const pngFile = Buffer.concat([pngHeader, ihdrChunk, idatChunk, iendChunk]);
  fs.writeFileSync(pngPath, pngFile);
  console.log('Created minimal PNG placeholder icon (16x16) at:', pngPath);
  console.log('NOTE: Replace build/icon.png with a proper 256x256 icon for production.');
  converted = true;
}

// Create .ico placeholder (copy PNG for now; electron-builder handles conversion)
if (fs.existsSync(pngPath) && !fs.existsSync(icoPath)) {
  fs.copyFileSync(pngPath, icoPath);
  console.log('Copied PNG as ICO placeholder at:', icoPath);
}

console.log('\nIcon generation complete!');
console.log('Files in build/:');
fs.readdirSync(buildDir).forEach(f => console.log(`  ${f}`));
