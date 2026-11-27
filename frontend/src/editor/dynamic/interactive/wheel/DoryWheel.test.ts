import { Group, Point, StaticCanvas } from 'fabric'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defaultWheel } from './model'
import { deserializeObjects, serializeObject } from '../../../engine/serialization'
import { DoryWheel } from './DoryWheel'
import { interactiveAt } from '../at'
import { createRect } from '../../../engine/objects/factories'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('DoryWheel', () => {
  it('round-trips slices and transforms, including when nested in a group', async () => {
    const wheel = new DoryWheel({ left: 200, top: 200, angle: 23, scaleX: 0.7, wheel: defaultWheel() })
    const group = new Group([wheel])
    expect(interactiveAt([group], wheel.getCenterPoint())).toBe(wheel)
    const json = serializeObject(group)
    const [restored] = await deserializeObjects([json], { resolveSrc: async (s) => s, ensureFonts: async () => undefined })
    expect(restored).toBeInstanceOf(Group)
    expect((restored as Group).getObjects()[0]).toBeInstanceOf(DoryWheel)
    const restoredWheel = (restored as Group).getObjects()[0]
    expect(interactiveAt([restored], restoredWheel.getCenterPoint())).toBe(restoredWheel)
    expect(serializeObject(restored)).toEqual(json)
    group.dispose()
    restored.dispose()
  })

  it('keeps animated spin state out of document serialization and prevents simultaneous spins', async () => {
    vi.useFakeTimers()
    const wheel = new DoryWheel({ wheel: defaultWheel() })
    const before = serializeObject(wheel)
    const done = vi.fn()
    expect(wheel.spin(false, done)).toBe(true)
    expect(wheel.spin(false, done)).toBe(false)
    await vi.advanceTimersByTimeAsync(2000)
    expect(serializeObject(wheel)).toEqual(before)
    await vi.advanceTimersByTimeAsync(2300)
    expect(done).toHaveBeenCalledOnce()
    expect(wheel.wheel.slices.map((slice) => slice.text)).toContain(done.mock.calls[0][0])
    expect(serializeObject(wheel)).toEqual(before)
    wheel.dispose()
  })

  it('finishes immediately with reduced motion, and cancels animation on disposal', async () => {
    vi.useFakeTimers()
    const wheel = new DoryWheel({ wheel: defaultWheel() })
    const done = vi.fn()
    wheel.spin(true, done)
    expect(done).toHaveBeenCalledOnce()
    done.mockClear()
    wheel.spin(false, done)
    wheel.dispose()
    await vi.advanceTimersByTimeAsync(5000)
    expect(done).not.toHaveBeenCalled()
  })

  it('hit-tests transformed wheels without activating through foreground objects', () => {
    const wheel = new DoryWheel({ originX: 'center', originY: 'center', left: 200, top: 200, angle: 30, scaleX: 0.5, wheel: defaultWheel() })
    wheel.setCoords()
    const cover = createRect({ x: 200, y: 200 }, 80)
    expect(interactiveAt([wheel], new Point(200, 200))).toBe(wheel)
    expect(interactiveAt([wheel, cover], new Point(200, 200))).toBeNull()
    cover.visible = false
    expect(interactiveAt([wheel, cover], new Point(200, 200))).toBe(wheel)
    expect(interactiveAt([wheel], new Point(500, 500))).toBeNull()
    wheel.dispose()
    cover.dispose()
  })

  it('exports safe, labeled SVG slices and renders visible canvas output', () => {
    const spec = defaultWheel()
    spec.slices[0].text = '<script>&"'
    const wheel = new DoryWheel({ wheel: spec, left: 200, top: 200, originX: 'center', originY: 'center' })
    const svg = wheel.toSVG()
    expect(svg).toContain('&lt;script&gt;&amp;')
    expect(svg).not.toContain('<script>')
    expect(svg).toContain('fill="#6a52d9"')
    const canvas = new StaticCanvas(document.createElement('canvas'), { width: 400, height: 400 })
    canvas.add(wheel)
    canvas.renderAll()
    expect(canvas.getContext().getImageData(270, 130, 1, 1).data[3]).toBe(255)
    void canvas.dispose()
  })
})
