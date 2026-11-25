import { describe, expect, it } from 'vitest'
import { defaultWheel, equalizeSlices, readWheel, sliceGeometry, wheelOutcome, wheelTotal } from './model'

describe('wheel configuration and outcomes', () => {
  it('rejects unusable content, percentages, colors and duplicate slice IDs', () => {
    const spec = defaultWheel()
    expect(readWheel(spec)).toEqual(spec)
    for (const change of [{ text: '' }, { text: ' ' }, { color: 'url(https://example.com)' }, { percentage: NaN }, { percentage: -1 }, { percentage: Infinity }, { percentage: 30 }, { id: spec.slices[1].id }]) {
      expect(readWheel({ slices: [{ ...spec.slices[0], ...change }, ...spec.slices.slice(1)] })).toBeNull()
    }
    expect(readWheel({ slices: [spec.slices[0]] })).toBeNull()
    expect(readWheel(null)).toBeNull()
  })

  it('uses the visual percentage intervals as winning probabilities and skips zero-sized slices', () => {
    const spec = defaultWheel()
    spec.slices = spec.slices.map((slice, index) => ({ ...slice, percentage: [10, 30, 0, 60][index] }))
    const counts = [0, 0, 0, 0]
    for (let i = 0; i < 1000; i++) {
      const { slice, rotation } = wheelOutcome(spec, (i + 0.5) / 1000)
      const index = spec.slices.findIndex((entry) => entry.id === slice.id)
      counts[index]++
      const start = spec.slices.slice(0, index).reduce((sum, entry) => sum + entry.percentage, 0)
      const position = ((360 - rotation) % 360) / 3.6
      expect(position).toBeGreaterThan(start)
      expect(position).toBeLessThan(start + slice.percentage)
    }
    expect(counts).toEqual([100, 300, 0, 600])
    expect(wheelOutcome(spec, 0).slice.id).toBe(spec.slices[0].id)
    expect(wheelOutcome(spec, 1 - Number.EPSILON).slice.id).toBe(spec.slices[3].id)
  })

  it('equalizes awkward slice counts without percentage rounding drift', () => {
    const slices = defaultWheel().slices.slice(0, 3)
    const equal = equalizeSlices(slices)
    expect(equal.map((slice) => slice.percentage)).toEqual([33.33, 33.33, 33.34])
    expect(wheelTotal(equal)).toBe(100)
    expect(readWheel({ slices: equal })).not.toBeNull()
    expect(slices[0].percentage).toBe(25)
  })

  it('renders a 100% slice as a full circle rather than an empty SVG arc', () => {
    expect(sliceGeometry(0, 100).path.match(/ A /g)).toHaveLength(2)
    const spec = defaultWheel()
    spec.slices = spec.slices.slice(0, 2).map((slice, index) => ({ ...slice, percentage: index === 0 ? 100 : 0 }))
    expect(readWheel(spec)).not.toBeNull()
    expect(wheelOutcome(spec, 0.999).slice).toBe(spec.slices[0])
  })
})
