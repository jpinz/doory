import { describe, expect, it } from 'vitest'
import type { DocPage, DoryDocument } from '@/types/document'
import { parseMessage } from './channel'
import { initialState } from './machine'
import { previewsOf } from './useViewHost'
import { defaultDie } from '../dynamic/interactive/dice/model'
import { defaultWheel } from '../dynamic/interactive/wheel/model'

const page = (id: string, extra: Partial<DocPage> = {}): DocPage => ({ id, background: { type: 'solid', color: '#ffffff' }, objects: [], ...extra })
const docOf = (...pages: DocPage[]): DoryDocument => ({ schemaVersion: 1, width: 1920, height: 1080, unit: 'px', pages })

describe('previewsOf', () => {
  it('describes each page by its own size, name, notes and resolved time', () => {
    const doc = docOf(page('a', { name: ' Intro ', notes: 'Hello' }), page('b', { width: 1080, height: 1080 }), page('c', { width: 1080, height: 1920 }))
    expect(previewsOf(doc, [3, null, 8])).toEqual([
      { id: 'a', name: 'Intro', notes: 'Hello', durationSec: 3, width: 1920, height: 1080, actions: [], flow: { x: 60, y: 80 }, links: [], wheels: [], dice: [] },
      { id: 'b', name: '', notes: '', durationSec: null, width: 1080, height: 1080, actions: [], flow: { x: 380, y: 80 }, links: [], wheels: [], dice: [] },
      { id: 'c', name: '', notes: '', durationSec: 8, width: 1080, height: 1920, actions: [], flow: { x: 700, y: 80 }, links: [], wheels: [], dice: [] },
    ])
  })

  it('describes visible wheels on each page, including grouped wheels', () => {
    const wheel = { id: 'w1', type: 'dorywheel', name: 'Prize', wheel: defaultWheel() }
    const doc = docOf(page('a', { objects: [{ id: 'group', type: 'group', objects: [wheel] }, { ...wheel, id: 'hidden', visible: false }] }), page('b'))
    expect(previewsOf(doc, [null, null]).map((p) => p.wheels)).toEqual([[{ id: 'w1', label: 'Prize' }], []])
  })

  it('describes visible dice on each page, named or not', () => {
    const die = { id: 'd1', type: 'dorydie', die: defaultDie() }
    const doc = docOf(page('a', { objects: [{ id: 'group', type: 'group', objects: [{ ...die, name: 'Red' }] }, { ...die, id: 'd2' }, { ...die, id: 'hidden', visible: false }] }))
    expect(previewsOf(doc, [null])[0].dice).toEqual([{ id: 'd1', label: 'Red' }, { id: 'd2', label: 'Die' }])
  })

  it('numbers dice that share a name, and says where each sits on the page', () => {
    const die = { type: 'dorydie', die: defaultDie(), width: 200, height: 200, originX: 'left', originY: 'top', top: 108 }
    const doc = docOf(page('a', { objects: [{ ...die, id: 'd1', name: 'Die', left: 192 }, { ...die, id: 'd2', left: 960 }, { ...die, id: 'd3', name: 'Red', left: 0 }] }))
    const dice = previewsOf(doc, [null])[0].dice!
    expect(dice.map((d) => d.label)).toEqual(['Die 1', 'Die 2', 'Red'])
    expect(dice[1].box!.x).toBeCloseTo(0.5)
    expect(dice[1].box!.y).toBeCloseTo(0.1)
  })

  it('gives the flow map each slide\'s section, saved spot and linked elements', () => {
    const doc: DoryDocument = {
      ...docOf(
        page('a', { sectionId: 's1', flowPosition: { x: 500, y: 40 }, objects: [{ id: 'o', type: 'rect', left: 960, top: 540, width: 100, height: 100, originX: 'left', originY: 'top', presentationLink: { pageId: 'b' } } as never] }),
        page('b', { sectionId: 's1' }),
      ),
      meta: { sections: [{ id: 's1', name: 'Round 1' }] },
    } as DoryDocument
    const [a, b] = previewsOf(doc, [null, null])
    expect(a).toMatchObject({ flow: { x: 500, y: 40 }, section: { id: 's1', name: 'Round 1' } })
    expect(a.links).toEqual([{ pageId: 'b', x: (960 + 50) / 1920, y: (540 + 50) / 1080 }])
    expect(b.flow).toEqual({ x: 380, y: 60 })
  })

  it('cuts what a hand-made document holds to what the channel carries, so one odd page cannot stop the view', () => {
    const doc = docOf(page('a', { name: 'n'.repeat(500), notes: 'x'.repeat(9000), width: 99_999, height: 30_000 }), page('b'))
    const previews = previewsOf(doc, [null, null])
    expect(previews[0].name).toHaveLength(200)
    expect(previews[0].notes).toHaveLength(5000)
    expect(previews[0].width).toBe(20_000)
    expect(previews[0].height).toBe(20_000)
    const message = { v: 1, from: 'show', kind: 'init', title: 'T', theme: null, pages: previews, state: initialState({ count: 2, durations: [null, null] }) }
    expect(parseMessage(message, 'view')).not.toBeNull()
  })

  it('treats notes that are not text as no notes', () => {
    const doc = docOf(page('a', { notes: 5 as unknown as string }))
    expect(previewsOf(doc, [null])[0].notes).toBe('')
  })

  it('carries flow routes to the presenter window and falls back for deleted destinations', () => {
    const doc = docOf(page('a', { presentationNext: 'c' }), page('b', { presentationNext: 'deleted' }), page('c', { presentationNext: null }))
    const previews = previewsOf(doc, [null, null, null])
    expect(previews.map((p) => p.nextPageId)).toEqual(['c', 'c', null])
    expect(parseMessage({
      v: 1, from: 'show', kind: 'init', title: 'Flow', theme: null, pages: previews,
      state: initialState({ count: 3, durations: [null, null, null] }),
    }, 'view')).not.toBeNull()
  })
})
