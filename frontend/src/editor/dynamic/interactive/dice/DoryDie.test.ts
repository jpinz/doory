import { Group } from 'fabric'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { deserializeObjects, serializeObject } from '../../../engine/serialization'
import { createRect } from '../../../engine/objects/factories'
import { interactiveAt } from '../at'
import { DoryDie } from './DoryDie'
import { defaultDie, defaultFaces } from './model'

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('DoryDie', () => {
  it('round-trips symbolic faces inside groups and respects foreground objects', async () => {
    const die = new DoryDie({ die: { kind: 'symbol', faces: defaultFaces() }, left: 200, top: 200, originX: 'center', originY: 'center' })
    const group = new Group([die])
    const json = serializeObject(group)
    const [restored] = await deserializeObjects([json], { resolveSrc: async (s) => s, ensureFonts: async () => undefined })
    const child = (restored as Group).getObjects()[0]
    expect(child).toBeInstanceOf(DoryDie)
    expect(serializeObject(restored)).toEqual(json)
    expect(interactiveAt([restored], child.getCenterPoint())).toBe(child)
    const cover = createRect(child.getCenterPoint(), 80)
    expect(interactiveAt([restored, cover], child.getCenterPoint())).toBeNull()
    group.dispose()
    restored.dispose()
    cover.dispose()
  })

  it('keeps rolls local, prevents simultaneous rolls, and cancels on disposal', async () => {
    vi.useFakeTimers()
    const die = new DoryDie({ die: defaultDie() })
    const before = serializeObject(die)
    const done = vi.fn()
    expect(die.roll(false, done)).toBe(true)
    expect(die.roll(false, done)).toBe(false)
    await vi.advanceTimersByTimeAsync(1000)
    expect(done).toHaveBeenCalledOnce()
    expect(Number(done.mock.calls[0][0])).toBeGreaterThanOrEqual(1)
    expect(Number(done.mock.calls[0][0])).toBeLessThanOrEqual(6)
    expect(serializeObject(die)).toEqual(before)
    done.mockClear()
    die.roll(false, done)
    die.dispose()
    await vi.advanceTimersByTimeAsync(1000)
    expect(done).not.toHaveBeenCalled()
  })

  it('announces color-only faces with reduced motion and escapes SVG text', () => {
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => { (array as Uint32Array)[0] = 0; return array })
    const die = new DoryDie({ die: { kind: 'symbol', faces: [{ text: '', color: '#123456' }, { text: '<&', color: '#abcdef' }] } })
    const done = vi.fn()
    expect(die.roll(true, done)).toBe(true)
    expect(done).toHaveBeenCalledWith('Face 1')
    die.set('die', { kind: 'symbol', faces: [{ text: '<&', color: '#abcdef' }, { text: '', color: '#123456' }] })
    expect(die.toSVG()).toContain('&lt;&amp;')
    die.dispose()
  })

  it('draws standard pips instead of numerals on a D6', () => {
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => { (array as Uint32Array)[0] = 4; return array })
    const die = new DoryDie({ die: { kind: 'number', sides: 6, pips: true, color: '#123456' } })
    expect(die.toSVG().match(/<circle/g)).toHaveLength(1)
    expect(die.toSVG()).toContain('fill="#123456"')
    const done = vi.fn()
    die.roll(true, done)
    expect(done).toHaveBeenCalledWith('5', 5)
    const ctx = document.createElement('canvas').getContext('2d')!
    const arc = vi.spyOn(ctx, 'arc')
    const text = vi.spyOn(ctx, 'fillText')
    die._render(ctx)
    expect(arc).toHaveBeenCalledTimes(5)
    expect(text).not.toHaveBeenCalled()
    die.dispose()
  })
})
