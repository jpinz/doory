import { describe, expect, it } from 'vitest'
import { pointsToOpenPath, spiralPoints } from './shapeGeometry'

/** How far from the centre (where the coil starts) each full turn ends, inside out; each turn is 72 points. */
function crossings(turns: number, tightness: number): number[] {
  const pts = spiralPoints(turns, tightness)
  const out: number[] = []
  for (let i = 72; i < pts.length; i += 72) out.push(pts[i].x - pts[0].x)
  return out
}

describe('spiralPoints', () => {
  it('is round: it starts at the centre and each turn ends further out on the same line', () => {
    for (const tightness of [0, 1]) {
      const pts = spiralPoints(4, tightness)
      expect(pts[0]).toEqual({ x: 50, y: 50 })
      expect(pts.at(-1)).toEqual({ x: 100, y: 50 })
      expect(Math.max(...pts.map((p) => Math.hypot(p.x - 50, p.y - 50)))).toBeCloseTo(50, 2)
      for (let i = 72; i < pts.length; i += 72) expect(pts[i].y).toBeCloseTo(50, 2)
    }
  })

  it('coils as many times as asked, within limits', () => {
    expect(crossings(3, 0)).toHaveLength(3)
    expect(crossings(7, 0)).toHaveLength(7)
    expect(spiralPoints(99, 0).length).toBe(spiralPoints(20, 0).length)
    expect(spiralPoints(0, 0).length).toBe(spiralPoints(1, 0).length)
  })

  it('spaces the coils evenly, or bunches them toward the centre when tight', () => {
    const gaps = (c: number[]): number[] => c.slice(1).map((r, i) => r - c[i])
    const even = gaps(crossings(5, 0))
    expect(Math.max(...even) - Math.min(...even)).toBeLessThan(1)
    const tight = gaps(crossings(5, 1))
    expect(tight[0]).toBeLessThan(tight.at(-1)! / 3)
  })

  it('is an open path', () => {
    expect(pointsToOpenPath([{ x: 0, y: 0 }, { x: 1, y: 2 }])).toBe('M 0 0 L 1 2')
  })
})
