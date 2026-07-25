// Generates brand assets (icon, adaptive icon, splash icon) without any
// image dependencies — pure Node zlib PNG encoding.
// Design: original World Cup–style soccer ball in brand colors (not the
// trademarked FIFA mark). Run via `npm run generate-assets`.
const zlib = require('zlib')
const fs = require('fs')
const path = require('path')

function crc32(buf) {
  let table = crc32.table
  if (!table) {
    table = crc32.table = []
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c >>> 0
    }
  }
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function writePng(file, size, pixelFn) {
  const bpp = 4 // RGBA
  const raw = Buffer.alloc(size * (size * bpp + 1))
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * bpp + 1)
    raw[rowStart] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixelFn(x, y)
      const o = rowStart + 1 + x * bpp
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8   // bit depth
  ihdr[9] = 6   // color type RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
  fs.writeFileSync(file, png)
  console.log(`wrote ${file} (${png.length} bytes)`)
}

const BG = [10, 10, 15, 255]        // #0a0a0f app background
const ACCENT = [233, 69, 96, 255]   // #e94560 brand red
const DARK = [10, 10, 15, 255]      // pentagon panels / seams

// Point-in-regular-polygon test (n sides, circumradius r, rotated rot rad).
function inPolygon(px, py, cx, cy, r, rot, n) {
  const dx = px - cx
  const dy = py - cy
  if (dx * dx + dy * dy > r * r) return false
  // inside if within every edge half-plane; apothem = r*cos(pi/n)
  const apothem = r * Math.cos(Math.PI / n)
  for (let i = 0; i < n; i++) {
    const a = rot + ((i + 0.5) * 2 * Math.PI) / n // edge-normal directions
    if (dx * Math.cos(a) + dy * Math.sin(a) > apothem) return false
  }
  return true
}

// Distance from point to line segment.
function segDist(px, py, x1, y1, x2, y2) {
  const vx = x2 - x1
  const vy = y2 - y1
  const wx = px - x1
  const wy = py - y1
  const t = Math.max(0, Math.min(1, (wx * vx + wy * vy) / (vx * vx + vy * vy)))
  const dx2 = wx - t * vx
  const dy2 = wy - t * vy
  return Math.sqrt(dx2 * dx2 + dy2 * dy2)
}

// Stylized soccer ball: red sphere, dark central pentagon, five partial
// pentagons around the rim, seams joining them.
function soccerPixel(size, transparentBg) {
  const c = size / 2
  const R = size * 0.37
  const seamW = size * 0.012

  // Central pentagon (one vertex pointing up)
  const up = -Math.PI / 2
  const centR = R * 0.34
  // Vertex directions of the central pentagon
  const vertexAngles = []
  for (let i = 0; i < 5; i++) vertexAngles.push(up + (i * 2 * Math.PI) / 5)
  // Outer pentagons sit toward the rim along each vertex direction
  const outerDist = R * 0.78
  const outerR = R * 0.22

  return (x, y) => {
    const dx = x - c
    const dy = y - c
    const d = Math.sqrt(dx * dx + dy * dy)
    if (d > R) return transparentBg ? [0, 0, 0, 0] : BG

    let col = ACCENT

    // Central pentagon panel
    if (inPolygon(x, y, c, c, centR, up, 5)) col = DARK

    for (const a of vertexAngles) {
      const ox = c + Math.cos(a) * outerDist
      const oy = c + Math.sin(a) * outerDist
      // Outer pentagon panels (clipped by the ball edge), rotated to face center
      if (inPolygon(x, y, ox, oy, outerR, a + Math.PI / 5, 5)) col = DARK
      // Seam from central pentagon vertex to outer pentagon center
      const vx = c + Math.cos(a) * centR
      const vy = c + Math.sin(a) * centR
      if (segDist(x, y, vx, vy, ox, oy) < seamW) col = DARK
    }

    // anti-alias the ball edge
    const edge = R - d
    if (edge < 1.5) {
      const t = Math.max(0, edge / 1.5)
      if (transparentBg) return [col[0], col[1], col[2], Math.round(255 * t)]
      return [
        Math.round(col[0] * t + BG[0] * (1 - t)),
        Math.round(col[1] * t + BG[1] * (1 - t)),
        Math.round(col[2] * t + BG[2] * (1 - t)),
        255,
      ]
    }
    return col
  }
}

const assets = path.join(__dirname, '..', 'assets')
fs.mkdirSync(assets, { recursive: true })
writePng(path.join(assets, 'icon.png'), 1024, soccerPixel(1024, false))
writePng(path.join(assets, 'adaptive-icon.png'), 1024, soccerPixel(1024, true))
writePng(path.join(assets, 'splash-icon.png'), 512, soccerPixel(512, true))
