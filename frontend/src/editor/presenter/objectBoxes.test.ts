import { Group, Rect } from 'fabric'
import { describe, expect, it } from 'vitest'
import type { DocObject } from '@/types/document'
import { objectBoxes } from './objectBoxes'

const pageBox = (r: { left: number; top: number; width: number; height: number }, w: number, h: number) => ({ x: r.left / w, y: r.top / h, w: r.width / w, h: r.height / h })

describe('objectBoxes', () => {
  it('places rotated, scaled and grouped objects where Fabric draws them, as fractions of the page', () => {
    const loose = new Rect({ left: 300, top: 200, width: 100, height: 60, angle: 30, scaleX: 1.5, originX: 'left', originY: 'top' })
    const inner = new Rect({ left: 500, top: 400, width: 80, height: 80, angle: 45 })
    const group = new Group([inner, new Rect({ left: 700, top: 500, width: 40, height: 40 })])
    group.set({ angle: 20, scaleX: 2 })
    group.setCoords()
    const doc = [
      { ...loose.toObject(), id: 'loose' },
      { ...group.toObject(), id: 'g', objects: group.getObjects().map((o, i) => ({ ...o.toObject(), id: i === 0 ? 'inner' : 'other' })) },
    ] as DocObject[]
    const boxes = objectBoxes(doc, new Set(['loose', 'inner', 'missing']), 1920, 1080)
    expect([...boxes.keys()].sort()).toEqual(['inner', 'loose'])
    for (const [id, shape] of [['loose', loose], ['inner', inner]] as const) {
      const want = pageBox(shape.getBoundingRect(), 1920, 1080)
      const got = boxes.get(id)!
      for (const k of ['x', 'y', 'w', 'h'] as const) expect(got[k]).toBeCloseTo(want[k], 4)
    }
  })

  it('skips objects without a size', () => {
    expect(objectBoxes([{ id: 'd', type: 'dorydie' }], new Set(['d']), 100, 100).size).toBe(0)
  })
})
