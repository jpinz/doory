import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBlankDocument } from '@/lib/document'
import { createMemoryAdapter } from '../../dev/memoryAdapter'
import { EditorEngine } from '../editor'
import { scaledCrop } from './style'

describe('scaledCrop', () => {
  it('moves and enlarges the crop by the same factor as the whole image', () => {
    expect(scaledCrop({ x: 10, y: 20, width: 100, height: 50 }, 400, 300, 2)).toEqual({ x: 20, y: 40, width: 200, height: 100 })
  })

  it('scales a crop between pixels without rounding it', () => {
    expect(scaledCrop({ x: 10.25, y: 20.5, width: 100.5, height: 50.25 }, 400, 300, 2)).toEqual({ x: 20.5, y: 41, width: 201, height: 100.5 })
  })

  it('clamps the crop to the edges of the enlarged image after rounding', () => {
    const crop = scaledCrop({ x: 399, y: 299, width: 1, height: 1 }, 400, 300, 4)
    expect(crop).toEqual({ x: 1596, y: 1196, width: 4, height: 4 })
  })
})

describe('spiral shape', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('is added as a stroked coil whose turns and tightness can be changed and undone', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation((cb) => cb(new Blob(['thumb'], { type: 'image/webp' })))
    const engine = new EditorEngine({ adapter: createMemoryAdapter().adapter, document: createBlankDocument(800, 600), meta: { id: 'd1', title: 'Test', mode: 'guest' }, ephemeral: true })
    const host = document.createElement('div')
    document.body.appendChild(host)
    const pageId = engine.state.doc.pages[0].id
    engine.mountPage(pageId, host)
    ;(await engine.whenView(pageId)).setLayout(1, { x: 0, y: 0, width: 800, height: 600 })
    const first = () => engine.state.doc.pages[0].objects[0]

    await engine.insert.shape('spiral')
    expect(first()).toMatchObject({ type: 'path', shapeKind: 'spiral', spiralTurns: 4, spiralTightness: 0, fill: '', strokeLineCap: 'round' })
    const scale = [first().scaleX, first().scaleY]
    expect(scale[0]).toBe(scale[1])

    engine.animation.setPreset('emphasis', 'pulse')
    const animation = first().animation
    expect(animation).toBeDefined()

    engine.style.setSpiral({ turns: 9, tightness: 0.6 })
    expect(first().animation).toEqual(animation)
    expect(first()).toMatchObject({ shapeKind: 'spiral', spiralTurns: 9, spiralTightness: 0.6 })
    expect([first().scaleX, first().scaleY]).toEqual(scale)
    expect(engine.state.history.undoLabel).toBe('Change spiral')
    await engine.undo()
    expect(first()).toMatchObject({ spiralTurns: 4, spiralTightness: 0 })
    engine.dispose()
  })
})
