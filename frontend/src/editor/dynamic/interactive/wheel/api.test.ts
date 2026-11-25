import { Point } from 'fabric'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setupEditor } from '../../../animation/testing'
import { defaultWheel } from './model'
import { t } from '../../../strings'
import type { EditorEngine } from '../../../engine/editor'
import { DoryWheel } from './DoryWheel'
import { serializeObject } from '../../../engine/serialization'

let engine: EditorEngine | null = null
afterEach(() => {
  engine?.dispose()
  engine = null
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('wheel editor API', () => {
  it('inserts, edits, duplicates and restores wheel configuration with undo/redo', async () => {
    ;({ engine } = await setupEditor())
    await engine.wheels.insert()
    expect(engine.state.selection.kinds).toEqual(['wheel'])
    const before = engine.state.doc.pages[0].objects[0].wheel
    const next = defaultWheel()
    next.slices[0] = { ...next.slices[0], text: 'Prize', color: '#123456', percentage: 10 }
    next.slices[1].percentage = 40
    expect(engine.wheels.set(next)).toBe(true)
    expect(engine.state.doc.pages[0].objects[0].wheel).toEqual(next)
    await engine.undo()
    expect(engine.state.doc.pages[0].objects[0].wheel).toEqual(before)
    await engine.redo()
    expect(engine.state.doc.pages[0].objects[0].wheel).toEqual(next)
    await engine.arrange.duplicate()
    expect(engine.state.doc.pages[0].objects).toHaveLength(2)
    expect(engine.state.doc.pages[0].objects[1].wheel).toEqual(next)
    expect(engine.state.doc.pages[0].objects[1].id).not.toBe(engine.state.doc.pages[0].objects[0].id)
  })

  it('rejects invalid edits without changing the saved configuration', async () => {
    ;({ engine } = await setupEditor())
    await engine.wheels.insert()
    const before = engine.state.doc
    const invalid = defaultWheel()
    invalid.slices[0].percentage = 1
    expect(engine.wheels.set(invalid)).toBe(false)
    expect(engine.state.doc).toBe(before)
  })

  it('allows shared-view spins by click or keyboard API, but not editing or dragging to spin', async () => {
    const docWheel = serializeObject(new DoryWheel({ wheel: defaultWheel(), left: 200, top: 200, originX: 'center', originY: 'center' }))
    const setup = await setupEditor({ mode: 'shared-view', objects: [docWheel] })
    engine = setup.engine
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const before = engine.state.doc
    const history = engine.state.history
    const announce = vi.spyOn(engine, 'announce')
    engine.wheels.spin(setup.pageId, docWheel.id)
    expect(announce).toHaveBeenCalledWith(expect.stringContaining(`${t.wheel.winner}:`))
    announce.mockClear()
    const canvas = engine.viewOf(setup.pageId)!.canvas
    const pointer = (x: number) => ({ e: new MouseEvent('mousedown', { button: 0, clientX: x, clientY: 200 }), scenePoint: new Point(x, 200), viewportPoint: new Point(x, 200), alreadySelected: false, isClick: true })
    canvas.fire('mouse:down', pointer(200))
    canvas.fire('mouse:up', pointer(201))
    expect(announce).toHaveBeenCalledOnce()
    announce.mockClear()
    canvas.fire('mouse:down', pointer(200))
    canvas.fire('mouse:up', pointer(250))
    expect(announce).not.toHaveBeenCalled()
    await engine.wheels.insert()
    expect(engine.wheels.set(defaultWheel())).toBe(false)
    expect(engine.state.doc).toBe(before)
    expect(engine.state.history).toBe(history)
  })
})
