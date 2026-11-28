/**
 * Animated page backgrounds. A pattern or gradient background may carry a `motion`: a loop that plays in presentations,
 * animation previews and video / GIF exports (through the frame renderer). The editor and still exports show its first
 * frame, which is the background as it is without motion.
 *
 * Each motion is a loop of `periodMs`: drift slides a tile pattern by one tile, rotate turns the picture once, pulse
 * breathes in and out, zoom grows the picture to twice its size while a copy at half size fades in under it (an endless
 * zoom), and shift runs a gradient's colours along it and back.
 */
import type { BackgroundMotion, GradientStop, PageBackground } from '@/types/document'
import { type Rgba, parseColor, rgbaToCss } from '../colors'
import { sortStops } from './fills'
import { type Region, drawPattern, isSpiral, readPattern } from './patterns'

export type MotionKind = BackgroundMotion['kind']
export const MOTION_KINDS: readonly MotionKind[] = ['drift', 'rotate', 'pulse', 'zoom', 'shift']
/** Loop lengths the speed slider spans (ms), and the one a new motion starts with. */
export const MOTION_PERIOD = { fastest: 2000, slowest: 20_000, initial: 4000 } as const
export const PERIOD_RANGE = { min: 500, max: 60_000 } as const
/** How far a pulse grows and shrinks the picture. */
const PULSE = 0.1
/** The largest bitmap a moving pattern is drawn into once; a larger one is drawn at a lower resolution. */
const MAX_RASTER_PIXELS = 16_000_000
const TAU = Math.PI * 2

type Gradient = Extract<PageBackground, { type: 'gradient' }>
type Size = { width: number; height: number }
export type Matrix = [number, number, number, number, number, number]

/** The motions a background can have: drift needs a repeating tile, rotate a picture that changes when it turns. */
export function motionKindsFor(bg: PageBackground): readonly MotionKind[] {
  if (bg.type === 'pattern') return isSpiral(readPattern(bg).pattern) ? ['rotate', 'pulse', 'zoom'] : ['drift', 'rotate', 'pulse', 'zoom']
  if (bg.type === 'gradient') return bg.kind === 'radial' ? ['pulse', 'zoom', 'shift'] : ['rotate', 'pulse', 'zoom', 'shift']
  return []
}

export function normalizeMotion(raw: unknown): BackgroundMotion | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  if (!(MOTION_KINDS as readonly unknown[]).includes(r.kind)) return null
  const period = typeof r.periodMs === 'number' && Number.isFinite(r.periodMs) ? r.periodMs : MOTION_PERIOD.initial
  const motion: BackgroundMotion = { kind: r.kind as MotionKind, periodMs: Math.min(PERIOD_RANGE.max, Math.max(PERIOD_RANGE.min, period)) }
  if (motion.kind === 'drift') motion.angle = typeof r.angle === 'number' && Number.isFinite(r.angle) ? (((Math.round(r.angle / 45) * 45) % 360) + 360) % 360 : 0
  if (r.reverse === true && motion.kind !== 'drift' && motion.kind !== 'pulse') motion.reverse = true
  return motion
}

/** The motion of a background, or null when it has none it can play. */
export function backgroundMotion(bg: PageBackground): BackgroundMotion | null {
  if (bg.type !== 'pattern' && bg.type !== 'gradient') return null
  const motion = normalizeMotion(bg.motion)
  return motion && motionKindsFor(bg).includes(motion.kind) ? motion : null
}

/** `bg` with `motion` (or without any, for null or a motion it cannot have). */
export function withMotion(bg: PageBackground, motion: BackgroundMotion | null): PageBackground {
  if (bg.type !== 'pattern' && bg.type !== 'gradient') return bg
  const { motion: _old, ...rest } = bg
  const next = normalizeMotion(motion)
  return next && motionKindsFor(bg).includes(next.kind) ? { ...rest, motion: next } : rest
}

/** Where in its loop the motion is at `tMs` on the page clock: 0 ≤ phase < 1. */
export function motionPhase(motion: BackgroundMotion, tMs: number): number {
  return (Math.max(0, tMs) % motion.periodMs) / motion.periodMs
}

/** Scale by `k` and turn by `angle` (rad) around (cx, cy). */
function around(cx: number, cy: number, k: number, angle: number): Matrix {
  const a = k * Math.cos(angle)
  const b = k * Math.sin(angle)
  return [a, b, -b, a, cx - a * cx + b * cy, cy - b * cx - a * cy]
}

export interface MotionLayer {
  /** Page px to page px, applied to the still picture. */
  matrix: Matrix
  alpha: number
}

export interface MotionFrame {
  /** Drawn in order, each over the one before. */
  layers: MotionLayer[]
  /** How far a gradient's colours have run (0–1 of their loop); 0 for every other motion. */
  shift: number
}

/** The motion at `tMs`: how the still picture is placed on the page. `tile` is a pattern's tile edge. */
export function sampleMotion(motion: BackgroundMotion, tMs: number, page: Size, tile: number): MotionFrame {
  const p = motionPhase(motion, tMs)
  const cx = page.width / 2
  const cy = page.height / 2
  const sign = motion.reverse ? -1 : 1
  switch (motion.kind) {
    case 'drift': {
      const rad = ((motion.angle ?? 0) * Math.PI) / 180
      // Whole tiles on both axes, so the loop ends where it began.
      const dx = Math.round(Math.cos(rad)) * tile * p
      const dy = Math.round(Math.sin(rad)) * tile * p
      return { layers: [{ matrix: [1, 0, 0, 1, dx, dy], alpha: 1 }], shift: 0 }
    }
    case 'rotate':
      return { layers: [{ matrix: around(cx, cy, 1, sign * TAU * p), alpha: 1 }], shift: 0 }
    case 'pulse':
      return { layers: [{ matrix: around(cx, cy, 1 + PULSE * Math.sin(TAU * p), 0), alpha: 1 }], shift: 0 }
    case 'zoom': {
      const q = motion.reverse ? 1 - p : p
      return { layers: [{ matrix: around(cx, cy, 2 ** (q - 1), 0), alpha: 1 }, { matrix: around(cx, cy, 2 ** q, 0), alpha: 1 - q }], shift: 0 }
    }
    case 'shift':
      return { layers: [{ matrix: [1, 0, 0, 1, 0, 0], alpha: 1 }], shift: motion.reverse ? (1 - p) % 1 : p }
  }
}

/** The part of the plane (page px) the still picture must cover so that every frame of the motion fills the page. */
export function motionCover(motion: BackgroundMotion, page: Size, tile: number): Region {
  const { width: w, height: h } = page
  const centred = (cw: number, ch: number): Region => ({ x: (w - cw) / 2, y: (h - ch) / 2, w: cw, h: ch })
  switch (motion.kind) {
    case 'drift':
      return { x: -tile, y: -tile, w: w + 2 * tile, h: h + 2 * tile }
    case 'rotate': {
      const d = Math.hypot(w, h)
      return centred(d, d)
    }
    case 'pulse':
      return centred(w / (1 - PULSE), h / (1 - PULSE))
    case 'zoom':
      return centred(w * 2, h * 2)
    case 'shift':
      return { x: 0, y: 0, w, h }
  }
}

/* ------------------------------------------------------------------------------------------------
 * Gradients
 * ---------------------------------------------------------------------------------------------- */

interface Stop {
  offset: number
  color: string
  rgba: Rgba | null
}

function readStops(stops: readonly GradientStop[]): Stop[] {
  const sorted = sortStops(stops).map((s) => ({ offset: Math.min(1, Math.max(0, s.offset)), color: s.color, rgba: parseColor(s.color) }))
  return sorted.length > 0 ? sorted : [{ offset: 0, color: '#ffffff', rgba: parseColor('#ffffff') }]
}

/** The colour of the gradient at `x` (0–1), as the canvas would mix it. */
function colorAt(stops: readonly Stop[], x: number): string {
  if (x <= stops[0].offset) return stops[0].color
  const last = stops[stops.length - 1]
  if (x >= last.offset) return last.color
  let i = 1
  while (stops[i].offset < x) i++
  const a = stops[i - 1]
  const b = stops[i]
  if (!a.rgba || !b.rgba || b.offset === a.offset) return x - a.offset < b.offset - x ? a.color : b.color
  const f = (x - a.offset) / (b.offset - a.offset)
  const mix = (u: number, v: number): number => u + (v - u) * f
  return rgbaToCss({ r: Math.round(mix(a.rgba.r, b.rgba.r)), g: Math.round(mix(a.rgba.g, b.rgba.g)), b: Math.round(mix(a.rgba.b, b.rgba.b)), a: mix(a.rgba.a, b.rgba.a) })
}

/**
 * Colour stops for positions `t0`…`t1` along a gradient (0–1 is the gradient itself) whose colours run on by `shift`
 * of their loop. The loop is the gradient there and back again, so it has no seam.
 */
export function cyclicStops(stops: readonly GradientStop[], shift: number, t0: number, t1: number): { offset: number; color: string }[] {
  const list = readStops(stops)
  const span = t1 - t0
  if (!(span > 0)) return [{ offset: 0, color: colorAt(list, 0) }]
  const origin = 2 * shift
  const at = (t: number): string => {
    const u = (((t - origin) % 2) + 2) % 2
    return colorAt(list, u <= 1 ? u : 2 - u)
  }
  const marks = new Set<number>([t0, t1])
  const offsets = [0, 1, ...list.map((s) => s.offset)]
  for (let k = Math.floor((t0 - origin) / 2) - 1; k <= Math.ceil((t1 - origin) / 2) + 1; k++) {
    for (const o of offsets) {
      for (const t of [origin + 2 * k + o, origin + 2 * k + 2 - o]) if (t > t0 && t < t1) marks.add(t)
    }
  }
  return [...marks].sort((a, b) => a - b).map((t) => ({ offset: Math.min(1, Math.max(0, (t - t0) / span)), color: at(t) }))
}

/**
 * Paints a gradient background over `region` (page px) the way Fabric draws it on the page (in the page's unit square),
 * its colours run on by `shift` when that is a number.
 */
export function drawGradient(ctx: CanvasRenderingContext2D, bg: Gradient, page: Size, region: Region, shift: number | null): void {
  const { width: w, height: h } = page
  if (!(w > 0 && h > 0)) return
  const r = { x: region.x / w, y: region.y / h, w: region.w / w, h: region.h / h }
  const corners = [
    [r.x, r.y],
    [r.x + r.w, r.y],
    [r.x, r.y + r.h],
    [r.x + r.w, r.y + r.h],
  ]
  let gradient: CanvasGradient
  let stops: { offset: number; color: string }[]
  if (bg.kind === 'radial') {
    if (shift === null) {
      gradient = ctx.createRadialGradient(0.5, 0.5, 0, 0.5, 0.5, 0.5)
      stops = readStops(bg.stops)
    } else {
      const reach = 2 * Math.max(...corners.map(([x, y]) => Math.hypot(x - 0.5, y - 0.5)))
      gradient = ctx.createRadialGradient(0.5, 0.5, 0, 0.5, 0.5, reach / 2)
      stops = cyclicStops(bg.stops, shift, 0, reach)
    }
  } else {
    const rad = ((bg.angle ?? 90) * Math.PI) / 180
    const dx = Math.cos(rad)
    const dy = Math.sin(rad)
    const x1 = 0.5 - dx * 0.5
    const y1 = 0.5 - dy * 0.5
    if (shift === null) {
      gradient = ctx.createLinearGradient(x1, y1, x1 + dx, y1 + dy)
      stops = readStops(bg.stops)
    } else {
      const ts = corners.map(([x, y]) => (x - x1) * dx + (y - y1) * dy)
      const t0 = Math.min(...ts)
      const t1 = Math.max(...ts)
      gradient = ctx.createLinearGradient(x1 + dx * t0, y1 + dy * t0, x1 + dx * t1, y1 + dy * t1)
      stops = cyclicStops(bg.stops, shift, t0, t1)
    }
  }
  for (const s of stops) gradient.addColorStop(s.offset, s.color)
  ctx.save()
  ctx.scale(w, h)
  ctx.fillStyle = gradient
  ctx.fillRect(r.x, r.y, r.w, r.h)
  ctx.restore()
}

/* ------------------------------------------------------------------------------------------------
 * Frames
 * ---------------------------------------------------------------------------------------------- */

export interface MovingBackground {
  /** Paints the background at `tMs` on the page clock over the whole of `ctx`, which is `scale` px per page px. */
  draw(ctx: CanvasRenderingContext2D, tMs: number): void
  dispose(): void
}

/**
 * Prepares a background with motion for drawing frame by frame at `scale` output px per page px; null when it has no
 * motion. A pattern is drawn into a bitmap once (large enough for every frame); a gradient is drawn on every frame.
 */
export function createMovingBackground(bg: PageBackground, page: Size, scale: number): MovingBackground | null {
  const motion = backgroundMotion(bg)
  if (!motion || (bg.type !== 'pattern' && bg.type !== 'gradient')) return null
  const spec = bg.type === 'pattern' ? readPattern(bg) : null
  const tile = spec?.size ?? 0
  const cover = motionCover(motion, page, tile)
  let raster: HTMLCanvasElement | null = null
  if (spec) {
    const k = Math.min(scale, Math.sqrt(MAX_RASTER_PIXELS / Math.max(1, cover.w * cover.h)))
    raster = document.createElement('canvas')
    raster.width = Math.max(1, Math.ceil(cover.w * k))
    raster.height = Math.max(1, Math.ceil(cover.h * k))
    const rctx = raster.getContext('2d')
    if (rctx) {
      rctx.scale(raster.width / cover.w, raster.height / cover.h)
      rctx.translate(-cover.x, -cover.y)
      drawPattern(rctx, spec, page, cover)
    }
  }
  return {
    draw(ctx, tMs) {
      const frame = sampleMotion(motion, tMs, page, tile)
      for (const layer of frame.layers) {
        if (layer.alpha <= 0) continue
        ctx.save()
        ctx.setTransform(scale, 0, 0, scale, 0, 0)
        ctx.transform(...layer.matrix)
        ctx.globalAlpha = layer.alpha
        if (raster) ctx.drawImage(raster, cover.x, cover.y, cover.w, cover.h)
        else drawGradient(ctx, bg as Gradient, page, cover, motion.kind === 'shift' ? frame.shift : null)
        ctx.restore()
      }
    },
    dispose() {
      if (raster) {
        raster.width = 1
        raster.height = 1
      }
    },
  }
}
