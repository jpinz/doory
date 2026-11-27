import { Point } from 'fabric'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setupEditor } from '../../../animation/testing'
import type { EditorEngine } from '../../../engine/editor'
import { serializeObject } from '../../../engine/serialization'
import { t } from '../../../strings'
import { DoryDie } from './DoryDie'
import { defaultDie, defaultFaces } from './model'

let engine: EditorEngine | null = null
afterEach(() => {
  engine?.dispose()
  engine = null
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('dice editor API', () => {
  it('inserts, edits and restores configuration through undo and duplication', async () => {
    ;({ engine } = await setupEditor())
    await engine.dice.insert()
    expect(engine.state.selection.kinds).toEqual(['die'])
    const spec = { kind: 'symbol' as const, faces: defaultFaces() }
    expect(engine.dice.set(spec)).toBe(true)
    expect(engine.state.doc.pages[0].objects[0].die).toEqual(spec)
    await engine.undo()
    expect(engine.state.doc.pages[0].objects[0].die).toEqual(defaultDie())
    await engine.redo()
    await engine.arrange.duplicate()
    expect(engine.state.doc.pages[0].objects[1].die).toEqual(spec)
    expect(engine.state.doc.pages[0].objects[1].id).not.toBe(engine.state.doc.pages[0].objects[0].id)
  })

  it('lets shared viewers roll without editing or rolling on drag', async () => {
    const docDie = serializeObject(new DoryDie({ die: defaultDie(), left: 200, top: 200, originX: 'center', originY: 'center' }))
    const setup = await setupEditor({ mode: 'shared-view', objects: [docDie] })
    engine = setup.engine
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const before = engine.state.doc
    const announce = vi.spyOn(engine, 'announce')
    const canvas = engine.viewOf(setup.pageId)!.canvas
    const pointer = (x: number) => ({ e: new MouseEvent('mousedown', { button: 0, clientX: x, clientY: 200 }), scenePoint: new Point(x, 200), viewportPoint: new Point(x, 200), alreadySelected: false, isClick: true })
    canvas.fire('mouse:down', pointer(200))
    canvas.fire('mouse:up', pointer(201))
    expect(announce).toHaveBeenCalledWith(expect.stringContaining(`${t.dice.result}:`))
    announce.mockClear()
    canvas.fire('mouse:down', pointer(200))
    canvas.fire('mouse:up', pointer(250))
    expect(announce).not.toHaveBeenCalled()
    expect(engine.dice.set(defaultDie())).toBe(false)
    expect(engine.state.doc).toBe(before)
  })
})
