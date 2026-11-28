/**
 * Background patterns, drawn with the 2D canvas API so that the editor, every export and the animated frames show the
 * same picture. A tile pattern repeats a small square from the page's top-left corner; a spiral is drawn once around
 * the centre of the page. A pattern is two colours and a size (the tile edge, or the spacing of the spiral).
 */

export type PatternId = 'dots' | 'grid' | 'stripes' | 'checks' | 'zigzag' | 'plus' | 'spiral-rays' | 'spiral-line'
export const PATTERN_IDS: readonly PatternId[] = ['dots', 'grid', 'stripes', 'checks', 'zigzag', 'plus', 'spiral-rays', 'spiral-line']

export interface PatternSpec {
  pattern: PatternId
  color: string
  paper: string
  size: number
}

export interface Region {
  x: number
  y: number
  w: number
  h: number
}

export const DEFAULT_PATTERN_COLOR = '#7a64e0'
export const DEFAULT_PATTERN_PAPER = '#ffffff'
const SIZE_RANGE = { min: 8, max: 2000 } as const
/** More tiles than this in one region are not drawn one by one (the shapes would be smaller than a pixel anyway). */
const MAX_TILES = 250_000
const RAYS = 12
const TAU = Math.PI * 2

export function isPatternId(value: unknown): value is PatternId {
  return typeof value === 'string' && (PATTERN_IDS as readonly string[]).includes(value)
}

export function isSpiral(id: PatternId): boolean {
  return id === 'spiral-rays' || id === 'spiral-line'
}

/** The tile edge for a page: about 1/18 of the shorter side, within sane limits. */
export function tileSize(pageWidth: number, pageHeight: number): number {
  return Math.min(160, Math.max(16, Math.round(Math.min(pageWidth, pageHeight) / 18)))
}

/** A pattern as stored in a page background, with anything unusable replaced by a default. */
export function readPattern(raw: { pattern?: unknown; color?: unknown; paper?: unknown; size?: unknown }): PatternSpec {
  const size = typeof raw.size === 'number' && Number.isFinite(raw.size) ? raw.size : 40
  return {
    pattern: isPatternId(raw.pattern) ? raw.pattern : 'dots',
    color: typeof raw.color === 'string' && raw.color ? raw.color : DEFAULT_PATTERN_COLOR,
    paper: typeof raw.paper === 'string' && raw.paper ? raw.paper : DEFAULT_PATTERN_PAPER,
    size: Math.min(SIZE_RANGE.max, Math.max(SIZE_RANGE.min, size)),
  }
}

/** Distance from the page centre to the farthest corner of `region`. */
function reachOf(region: Region, cx: number, cy: number): number {
  const dx = Math.max(Math.abs(region.x - cx), Math.abs(region.x + region.w - cx))
  const dy = Math.max(Math.abs(region.y - cy), Math.abs(region.y + region.h - cy))
  return Math.hypot(dx, dy) + 2
}

function drawTiles(ctx: CanvasRenderingContext2D, id: PatternId, s: number, region: Region): void {
  const i0 = Math.floor(region.x / s) - 1
  const j0 = Math.floor(region.y / s) - 1
  const i1 = Math.ceil((region.x + region.w) / s) + 1
  const j1 = Math.ceil((region.y + region.h) / s) + 1
  if ((i1 - i0) * (j1 - j0) > MAX_TILES) return
  const h = s / 2
  const line = Math.max(1, Math.round(s / 14))
  ctx.beginPath()
  if (id === 'grid') {
    for (let i = i0; i <= i1; i++) {
      ctx.moveTo(i * s, j0 * s)
      ctx.lineTo(i * s, j1 * s)
    }
    for (let j = j0; j <= j1; j++) {
      ctx.moveTo(i0 * s, j * s)
      ctx.lineTo(i1 * s, j * s)
    }
    ctx.lineWidth = line
    ctx.stroke()
    return
  }
  for (let j = j0; j < j1; j++) {
    for (let i = i0; i < i1; i++) {
      const x = i * s
      const y = j * s
      switch (id) {
        case 'dots': {
          const r = Math.max(1.5, s / 9)
          ctx.moveTo(x + h + r, y + h)
          ctx.arc(x + h, y + h, r, 0, TAU)
          break
        }
        case 'checks':
          ctx.rect(x, y, h, h)
          ctx.rect(x + h, y + h, h, h)
          break
        case 'stripes':
          ctx.moveTo(x, y + s)
          ctx.lineTo(x + s, y)
          break
        case 'zigzag':
          ctx.moveTo(x, y + s * 0.7)
          ctx.lineTo(x + h, y + s * 0.3)
          ctx.lineTo(x + s, y + s * 0.7)
          break
        case 'plus': {
          const arm = s / 6
          ctx.moveTo(x + h - arm, y + h)
          ctx.lineTo(x + h + arm, y + h)
          ctx.moveTo(x + h, y + h - arm)
          ctx.lineTo(x + h, y + h + arm)
          break
        }
        default:
          break
      }
    }
  }
  if (id === 'dots' || id === 'checks') {
    ctx.fill()
    return
  }
  ctx.lineWidth = id === 'stripes' ? line * 2 : line * 1.5
  ctx.lineCap = id === 'stripes' ? 'square' : 'round'
  ctx.lineJoin = 'round'
  ctx.stroke()
}

/** Curved wedges turning around the centre: every other one in the pattern colour. */
function drawRays(ctx: CanvasRenderingContext2D, s: number, cx: number, cy: number, reach: number): void {
  const twist = reach / (s * 3)
  const steps = Math.ceil(Math.max(32, twist / 0.03))
  const wedge = TAU / RAYS
  ctx.beginPath()
  for (let k = 0; k < RAYS; k += 2) {
    const a = k * wedge
    for (let i = 0; i <= steps; i++) {
      const r = (reach * i) / steps
      const th = a + r / (s * 3)
      if (i === 0) ctx.moveTo(cx, cy)
      else ctx.lineTo(cx + r * Math.cos(th), cy + r * Math.sin(th))
    }
    for (let i = steps; i >= 1; i--) {
      const r = (reach * i) / steps
      const th = a + wedge + r / (s * 3)
      ctx.lineTo(cx + r * Math.cos(th), cy + r * Math.sin(th))
    }
    ctx.closePath()
  }
  ctx.fill()
}

/** One line coiling out from the centre (an Archimedean spiral), `s` apart from coil to coil. */
function drawCoil(ctx: CanvasRenderingContext2D, s: number, cx: number, cy: number, reach: number): void {
  const b = s / TAU
  const end = (reach + s) / b
  ctx.beginPath()
  ctx.moveTo(cx, cy)
  for (let th = 0; th < end; ) {
    th += Math.min(0.25, 6 / Math.max(1, b * th))
    const r = b * th
    ctx.lineTo(cx + r * Math.cos(th), cy + r * Math.sin(th))
  }
  ctx.lineWidth = s / 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.stroke()
}

/** Paints `spec` over `region` (page px) of a page of `page` size, in whatever transform `ctx` has. */
export function drawPattern(ctx: CanvasRenderingContext2D, spec: PatternSpec, page: { width: number; height: number }, region: Region): void {
  ctx.save()
  ctx.fillStyle = spec.paper
  ctx.fillRect(region.x, region.y, region.w, region.h)
  ctx.fillStyle = spec.color
  ctx.strokeStyle = spec.color
  if (isSpiral(spec.pattern)) {
    const cx = page.width / 2
    const cy = page.height / 2
    const reach = reachOf(region, cx, cy)
    if (spec.pattern === 'spiral-rays') drawRays(ctx, spec.size, cx, cy, reach)
    else drawCoil(ctx, spec.size, cx, cy, reach)
  } else drawTiles(ctx, spec.pattern, spec.size, region)
  ctx.restore()
}

/** `data:` URL of a small square preview, for swatches. */
export function patternPreview(id: PatternId, color: string, paper: string, px = 48): string {
  const canvas = document.createElement('canvas')
  canvas.width = px
  canvas.height = px
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  const size = isSpiral(id) ? px / 5 : px / 2
  drawPattern(ctx, { pattern: id, color, paper, size }, { width: px, height: px }, { x: 0, y: 0, w: px, h: px })
  return canvas.toDataURL()
}
