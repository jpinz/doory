import { describe, expect, it } from 'vitest'
import type { BackgroundMotion, PageBackground } from '@/types/document'
import { backgroundMotion, createMovingBackground, cyclicStops, motionKindsFor, normalizeMotion, sampleMotion, withMotion } from './backgroundMotion'

const PAGE = { width: 200, height: 100 }
const pattern = (pattern: string, motion?: BackgroundMotion): PageBackground => ({ type: 'pattern', pattern, color: '#000000', paper: '#ffffff', size: 20, motion })
const linear: PageBackground = {
  type: 'gradient',
  kind: 'linear',
  angle: 90,
  stops: [
    { offset: 0, color: '#ff0000' },
    { offset: 1, color: '#0000ff' },
  ],
}

/** Where a layer sends the point (x, y), weighted by how opaque it is. */
function placed(motion: BackgroundMotion, tMs: number): { x: number; y: number; scale: number; alpha: number }[] {
  return sampleMotion(motion, tMs, PAGE, 20)
    .layers.filter((l) => l.alpha > 0)
    .map(({ matrix: [a, b, , , e, f], alpha }) => ({ x: Math.round(a * 10 + e) + 0, y: Math.round(b * 10 + f) + 0, scale: Math.hypot(a, b), alpha }))
}

describe('background motion', () => {
  it('offers only the motions a background can show', () => {
    expect(motionKindsFor(pattern('dots'))).toEqual(['drift', 'rotate', 'pulse', 'zoom'])
    expect(motionKindsFor(pattern('spiral-line'))).not.toContain('drift')
    expect(motionKindsFor({ ...linear, kind: 'radial' } as PageBackground)).toEqual(['pulse', 'zoom', 'shift'])
    expect(motionKindsFor({ type: 'image', src: 'x.png', fit: 'cover' })).toEqual([])
  })

  it('cleans up stored motion', () => {
    expect(normalizeMotion({ kind: 'spin' })).toBeNull()
    expect(normalizeMotion({ kind: 'drift', periodMs: 10, angle: 100, reverse: true })).toEqual({ kind: 'drift', periodMs: 500, angle: 90 })
    expect(normalizeMotion({ kind: 'drift', angle: -45 })).toEqual({ kind: 'drift', periodMs: 4000, angle: 315 })
    expect(normalizeMotion({ kind: 'zoom', periodMs: 2000, reverse: true })).toEqual({ kind: 'zoom', periodMs: 2000, reverse: true })
  })

  it('drops a motion the background cannot have', () => {
    const drifting = pattern('dots', { kind: 'drift', periodMs: 4000 })
    expect(backgroundMotion(drifting)?.kind).toBe('drift')
    const spiral = withMotion({ ...drifting, pattern: 'spiral-rays' } as PageBackground, backgroundMotion(drifting))
    expect(backgroundMotion(spiral)).toBeNull()
    expect('motion' in spiral).toBe(false)
    expect(withMotion(linear, { kind: 'shift', periodMs: 4000 })).toMatchObject({ motion: { kind: 'shift' } })
  })

  it.each<BackgroundMotion>([
    { kind: 'drift', periodMs: 4000, angle: 45 },
    { kind: 'rotate', periodMs: 4000, reverse: true },
    { kind: 'pulse', periodMs: 4000 },
    { kind: 'zoom', periodMs: 4000 },
    { kind: 'zoom', periodMs: 4000, reverse: true },
  ])('$kind loops without a jump', (motion) => {
    const start = placed(motion, 0)
    const end = placed(motion, 4000 - 1e-6)
    // Drift ends a whole tile on, which looks the same as where it began.
    const tiles = motion.kind === 'drift' ? { x: 20, y: 20 } : { x: 0, y: 0 }
    const visible = (layers: typeof start) => layers.filter((l) => l.alpha > 0.999).at(-1)!
    expect(visible(end).x - visible(start).x).toBeCloseTo(tiles.x, 0)
    expect(visible(end).y - visible(start).y).toBeCloseTo(tiles.y, 0)
    expect(visible(end).scale).toBeCloseTo(visible(start).scale, 3)
  })

  it('starts each loop on the still picture', () => {
    for (const kind of ['rotate', 'pulse'] as const) expect(placed({ kind, periodMs: 4000 }, 0)).toEqual([{ x: 10, y: 0, scale: 1, alpha: 1 }])
    expect(placed({ kind: 'zoom', periodMs: 4000 }, 0).at(-1)).toEqual({ x: 10, y: 0, scale: 1, alpha: 1 })
  })

  it('runs gradient colours there and back again', () => {
    const stops = (linear as Extract<PageBackground, { type: 'gradient' }>).stops
    const still = cyclicStops(stops, 0, 0, 1)
    expect(still.at(0)).toEqual({ offset: 0, color: '#ff0000' })
    expect(still.at(-1)).toEqual({ offset: 1, color: '#0000ff' })
    const half = cyclicStops(stops, 0.5, 0, 1)
    expect(half.at(0)?.color).toBe(still.at(-1)?.color)
    expect(half.at(-1)?.color).toBe(still.at(0)?.color)
  })

  it('paints a moving pattern that changes over time', () => {
    const moving = createMovingBackground(pattern('stripes', { kind: 'rotate', periodMs: 4000 }), PAGE, 1)!
    const canvas = document.createElement('canvas')
    canvas.width = PAGE.width
    canvas.height = PAGE.height
    const ctx = canvas.getContext('2d')!
    const frame = (t: number): string => {
      ctx.clearRect(0, 0, PAGE.width, PAGE.height)
      moving.draw(ctx, t)
      return canvas.toDataURL()
    }
    expect(frame(1000)).not.toBe(frame(0))
    expect(frame(4000)).toBe(frame(0))
    moving.dispose()
    expect(createMovingBackground(pattern('dots'), PAGE, 1)).toBeNull()
  })
})
