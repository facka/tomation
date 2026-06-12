#!/usr/bin/env node
/**
 * Generate PNG icon assets for the Tomation extension.
 * Creates 16x16, 48x48, and 128x128 icons with a purple background and white "T".
 * No external dependencies — uses only Node.js built-ins.
 */

var fs = require('fs');
var path = require('path');
var zlib = require('zlib');

function createPNG(size, bgR, bgG, bgB, fgR, fgG, fgB) {
  var pixels = Buffer.alloc(size * size * 4);

  // Fill background
  for (var y = 0; y < size; y++) {
    for (var x = 0; x < size; x++) {
      var idx = (y * size + x) * 4;
      pixels[idx] = bgR;
      pixels[idx + 1] = bgG;
      pixels[idx + 2] = bgB;
      pixels[idx + 3] = 255;
    }
  }

  // Draw a "T" shape
  var margin = Math.floor(size * 0.2);
  var thickness = Math.max(2, Math.floor(size * 0.15));

  // Rounded corners on background (cut corners to give rounded feel)
  var radius = Math.max(1, Math.floor(size * 0.15));
  for (var cy = 0; cy < radius; cy++) {
    for (var cx = 0; cx < radius; cx++) {
      var dist = Math.sqrt((radius - cx) * (radius - cx) + (radius - cy) * (radius - cy));
      if (dist > radius) {
        // Top-left corner
        var i1 = (cy * size + cx) * 4;
        pixels[i1 + 3] = 0;
        // Top-right corner
        var i2 = (cy * size + (size - 1 - cx)) * 4;
        pixels[i2 + 3] = 0;
        // Bottom-left corner
        var i3 = ((size - 1 - cy) * size + cx) * 4;
        pixels[i3 + 3] = 0;
        // Bottom-right corner
        var i4 = ((size - 1 - cy) * size + (size - 1 - cx)) * 4;
        pixels[i4 + 3] = 0;
      }
    }
  }

  // Top horizontal bar of T
  var topY = margin;
  for (var ty = topY; ty < topY + thickness; ty++) {
    for (var tx = margin; tx < size - margin; tx++) {
      var ti = (ty * size + tx) * 4;
      pixels[ti] = fgR;
      pixels[ti + 1] = fgG;
      pixels[ti + 2] = fgB;
      pixels[ti + 3] = 255;
    }
  }

  // Vertical stem of T
  var centerX = Math.floor(size / 2);
  var halfThick = Math.floor(thickness / 2);
  for (var vy = topY + thickness; vy < size - margin; vy++) {
    for (var vx = centerX - halfThick; vx <= centerX + halfThick; vx++) {
      if (vx >= 0 && vx < size) {
        var vi = (vy * size + vx) * 4;
        pixels[vi] = fgR;
        pixels[vi + 1] = fgG;
        pixels[vi + 2] = fgB;
        pixels[vi + 3] = 255;
      }
    }
  }

  // Encode as PNG
  var signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  var ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(size, 0);
  ihdrData.writeUInt32BE(size, 4);
  ihdrData[8] = 8;   // bit depth
  ihdrData[9] = 6;   // RGBA
  ihdrData[10] = 0;  // compression
  ihdrData[11] = 0;  // filter
  ihdrData[12] = 0;  // interlace
  var ihdr = makeChunk('IHDR', ihdrData);

  // IDAT — raw pixels with filter byte per row
  var rawData = Buffer.alloc(size * (1 + size * 4));
  for (var ry = 0; ry < size; ry++) {
    var rowOffset = ry * (1 + size * 4);
    rawData[rowOffset] = 0; // filter: none
    pixels.copy(rawData, rowOffset + 1, ry * size * 4, (ry + 1) * size * 4);
  }
  var compressed = zlib.deflateSync(rawData);
  var idat = makeChunk('IDAT', compressed);

  // IEND
  var iend = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function makeChunk(type, data) {
  var length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  var typeBytes = Buffer.from(type, 'ascii');
  var crcInput = Buffer.concat([typeBytes, data]);
  var crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([length, typeBytes, data, crc]);
}

function crc32(buf) {
  var c = 0xFFFFFFFF;
  for (var i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (var j = 0; j < 8; j++) {
      c = (c >>> 1) ^ (c & 1 ? 0xEDB88320 : 0);
    }
  }
  return (c ^ 0xFFFFFFFF) >>> 0;
}

// Main
var iconsDir = path.join(__dirname, 'icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

// Purple background (#6B46C1), white foreground
var sizes = [16, 48, 128];
sizes.forEach(function (size) {
  var png = createPNG(size, 0x6B, 0x46, 0xC1, 0xFF, 0xFF, 0xFF);
  var outPath = path.join(iconsDir, 'icon-' + size + '.png');
  fs.writeFileSync(outPath, png);
  console.log('Created ' + outPath + ' (' + png.length + ' bytes)');
});

console.log('Done.');
