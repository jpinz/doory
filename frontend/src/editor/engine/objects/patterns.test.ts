import { describe, expect, it } from 'vitest'
import { PATTERN_IDS, drawPattern, patternPreview, readPattern, tileSize } from './patterns'

const INK = [17, 34, 51]
const PAPER = [255, 238, 221]

function colours(id: (typeof PATTERN_IDS)[number]): { ink: number; paper: number; other: number } {
  const canvas = document.createElement('canvas')
  canvas.width = 120
  canvas.height = 120
  const ctx = canvas.getContext('2d')!
  drawPattern(ctx, { pattern: id, color: '#112233', paper: '#ffeedd', size: 24 }, { width: 120, height: 120 }, { x: 0, y: 0, w: 120, h: 120 })
  const data = ctx.getImageData(0, 0, 120, 120).data
  const out = { ink: 0, paper: 0, other: 0 }
  for (let i = 0; i < data.length; i += 4) {
    const px = [data[i], data[i + 1], data[i + 2]]
    if (px.every((v, k) => v === INK[k])) out.ink++
    else if (px.every((v, k) => v === PAPER[k])) out.paper++
    else out.other++
  }
  return out
}

describe('background patterns', () => {
  it.each(PATTERN_IDS)('%s paints the whole region in its two colours', (id) => {
    const { ink, paper, other } = colours(id)
    expect(ink).toBeGreaterThan(0)
    expect(paper).toBeGreaterThan(0)
    // Only anti-aliased edges are a mix of the two.
    expect(other).toBeLessThan(ink + paper)
  })

  it('replaces anything unusable in a stored pattern with a default', () => {
    expect(readPattern({ pattern: '"/><script>', color: 5, paper: '', size: Number.NaN })).toEqual({ pattern: 'dots', color: '#7a64e0', paper: '#ffffff', size: 40 })
    expect(readPattern({ pattern: 'spiral-line', color: '#000', paper: '#fff', size: 1 }).size).toBe(8)
    expect(readPattern({ size: 1e9 }).size).toBe(2000)
  })

  it('keeps the tile edge within limits and proportional to the page', () => {
    expect(tileSize(1080, 1080)).toBe(60)
    expect(tileSize(100, 100)).toBe(16)
    expect(tileSize(20000, 20000)).toBe(160)
    expect(tileSize(1920, 1080)).toBe(60)
  })

  it('previews a pattern as a PNG data URL', () => {
    expect(patternPreview('spiral-rays', '#000000', '#ffffff')).toMatch(/^data:image\/png;base64,/)
  })
})
