import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBlankDocument } from '@/lib/document'
import type { DoryDocument } from '@/types/document'
import { createMemoryAdapter } from '../dev/memoryAdapter'
import { EditorProvider } from '../EditorProvider'
import { EditorEngine } from '../engine/editor'
import { defaultDie } from '../dynamic/interactive/dice/model'
import { defaultWheel } from '../dynamic/interactive/wheel/model'
import { t } from '../strings'
import { openLink } from '../presenter/channel'
import { createChannelHub } from '../presenter/testing'
import type { Scoreboard } from '../presenter/scoreboard'
import { Presenter } from './Presenter'

class FakeObserver {
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
}

const rect = (id: string, animation?: Record<string, unknown>) => ({ id, type: 'rect', left: 200, top: 150, width: 100, height: 60, fill: '#ff0000', stroke: null, strokeWidth: 0, originX: 'center', originY: 'center', ...(animation ? { animation } : {}) })
const fade = (delayMs: number, durationMs: number) => ({ enter: { preset: 'fade', durationMs, delayMs, easing: 'linear' } })

function deck(): DoryDocument {
  const doc = createBlankDocument(400, 300)
  doc.pages[0] = { ...doc.pages[0], durationSec: 3, objects: [rect('a', fade(500, 1000))] }
  doc.pages.push({ ...doc.pages[0], id: 'p2', durationSec: 3, objects: [rect('b')], transition: { preset: 'push', durationMs: 800, easing: 'linear', direction: 'right' } })
  doc.pages.push({ ...doc.pages[0], id: 'p3', durationSec: 3, objects: [], transition: undefined })
  return doc
}

async function setup(doc: DoryDocument, props?: Record<string, unknown>) {
  const engine = new EditorEngine({ adapter: createMemoryAdapter().adapter, document: doc, meta: { id: 'd', title: 'Deck', mode: 'guest' }, ephemeral: true })
  await act(async () => {
    render(
      <EditorProvider engine={engine} portalRoot={document.body}>
        <Presenter props={props} />
      </EditorProvider>,
    )
  })
  return engine
}

const key = async (k: string): Promise<void> => {
  await act(async () => {
    fireEvent.keyDown(document, { key: k })
  })
}

function stubReducedMotion(reduced: boolean): void {
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: reduced && query.includes('reduce'), media: query, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined }))
}

describe('Presenter with motion', () => {
  let engine: EditorEngine | null = null
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', FakeObserver)
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 800 })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 600 })
    vi.stubGlobal('BroadcastChannel', class { postMessage(): void {} addEventListener(): void {} removeEventListener(): void {} close(): void {} })
    stubReducedMotion(false)
    sessionStorage.clear()
  })
  afterEach(() => {
    engine?.dispose()
    engine = null
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
    delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth
    delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight
  })

  it('uses the animated stage and draws the first page', async () => {
    engine = await setup(deck())
    await waitFor(() => expect(screen.getByTestId('present-frame')).toHaveAttribute('data-ready', 'true'))
    expect(screen.getByTestId('present-transition')).toHaveAttribute('data-live', 'false')
  })

  it('keeps the plain stage for a design without motion', async () => {
    const doc = createBlankDocument(400, 300)
    doc.pages[0].objects = [rect('a')]
    engine = await setup(doc)
    await waitFor(() => expect(screen.getByTestId('present-frame')).toHaveAttribute('data-ready', 'true'))
    expect(screen.queryByTestId('present-transition')).toBeNull()
  })

  it('activates dice and wheels without advancing or changing the design', async () => {
    stubReducedMotion(true)
    vi.stubGlobal('PointerEvent', MouseEvent)
    const doc = createBlankDocument(400, 300)
    const wheel = defaultWheel()
    doc.pages[0].objects = [
      { id: 'wheel', type: 'dorywheel', left: 80, top: 150, width: 100, height: 100, originX: 'center', originY: 'center', wheel },
      { id: 'die', type: 'dorydie', left: 200, top: 150, width: 100, height: 100, originX: 'center', originY: 'center', die: defaultDie() },
    ]
    doc.pages.push({ ...doc.pages[0], id: 'p2', objects: [] })
    engine = await setup(doc)
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => { (array as Uint32Array)[0] = 4; return array })
    const before = JSON.stringify(engine.state.doc)
    const button = await screen.findByRole('button', { name: `${t.dice.roll}: ${t.dice.name}` })
    const frame = screen.getByTestId('present-frame')
    vi.spyOn(frame, 'getBoundingClientRect').mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON: () => ({}) })
    const box = screen.getByTestId('present-frame-box')
    fireEvent.pointerDown(box, { button: 0, clientX: 400, clientY: 300 })
    fireEvent.pointerUp(box, { button: 0, clientX: 400, clientY: 300 })
    expect(await within(box).findByRole('status')).toHaveTextContent(`${t.dice.result}: 5`)
    expect(frame).toHaveAttribute('data-page-id', doc.pages[0].id)
    fireEvent.click(button)
    expect(within(box).getByRole('status')).toHaveTextContent(`${t.dice.result}: 5`)
    fireEvent.click(screen.getByRole('button', { name: `${t.wheel.spin}: ${t.wheel.name}` }))
    expect(within(box).getByRole('status')).toHaveTextContent(`${t.wheel.winner}: ${wheel.slices[0].text}`)
    expect(JSON.stringify(engine.state.doc)).toBe(before)
  })

  it('starts the page time after the page has built up: its animations first, then its time', async () => {
    engine = await setup(deck())
    // Page 1 builds up for 1.5 s and then stays 3 s: 4.5 s in all.
    expect(screen.getByTestId('present-countdown')).toHaveTextContent(t.presenter.timeLeft('0:05'))
  })

  it('counts the transition into the time of the page that comes in', async () => {
    engine = await setup(deck())
    await key('ArrowRight')
    // Page 2: 0.8 s of transition and 3 s: 3.8 s.
    expect(screen.getByTestId('present-countdown')).toHaveTextContent(t.presenter.timeLeft('0:04'))
  })

  it('plays the transition of the page it arrives at, over the stage, and then takes it away', async () => {
    engine = await setup(deck())
    await waitFor(() => expect(screen.getByTestId('present-frame')).toHaveAttribute('data-ready', 'true'))
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] })
    await key('ArrowRight')
    await waitFor(() => expect(screen.getByTestId('present-transition')).toHaveAttribute('data-live', 'true'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400)
    })
    expect(screen.getByTestId('present-transition')).toHaveAttribute('data-live', 'true')
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900)
    })
    expect(screen.getByTestId('present-transition')).toHaveAttribute('data-live', 'false')
    expect(screen.getByTestId('present-frame')).toHaveAttribute('data-page-id', 'p2')
  })

  it('shows a page without a transition at once', async () => {
    engine = await setup(deck())
    await key('ArrowRight')
    await key('ArrowRight')
    await waitFor(() => expect(screen.getByTestId('present-frame')).toHaveAttribute('data-page-id', 'p3'))
    await waitFor(() => expect(screen.getByTestId('present-frame')).toHaveAttribute('data-ready', 'true'))
    expect(screen.getByTestId('present-transition')).toHaveAttribute('data-live', 'false')
  })

  it('under reduced motion plays no animation and fades instead of any transition', async () => {
    stubReducedMotion(true)
    engine = await setup(deck())
    // No build-up: page 1 is 3 s.
    expect(screen.getByTestId('present-countdown')).toHaveTextContent(t.presenter.timeLeft('0:03'))
    await key('ArrowRight')
    // Page 2 has a quarter second of fade.
    expect(screen.getByTestId('present-countdown')).toHaveTextContent(t.presenter.timeLeft('0:04'))
  })

  it('does not change the design', async () => {
    engine = await setup(deck())
    const before = JSON.stringify(engine.state.doc)
    await key('ArrowRight')
    await key('ArrowRight')
    expect(JSON.stringify(engine.state.doc)).toBe(before)
  })

  function linkView() {
    const hub = createChannelHub()
    vi.stubGlobal('BroadcastChannel', class {
      private channel = hub.create()
      postMessage(message: unknown): void { this.channel.postMessage(message) }
      addEventListener(type: 'message', listener: (event: MessageEvent) => void): void { this.channel.addEventListener(type, listener) }
      removeEventListener(type: 'message', listener: (event: MessageEvent) => void): void { this.channel.removeEventListener(type, listener) }
      close(): void { this.channel.close() }
    })
  }

  it('updates and hides individual score cards through the channel and saves the scoreboard with the design', async () => {
    const session = 'a1b2c3d4e5f60718293a4b5c6d7e8f92'
    linkView()
    const doc = createBlankDocument(400, 300)
    const pageId = doc.pages[0].id
    const card = { type: 'doryscorecard', width: 140, height: 90, top: 150, originX: 'center', originY: 'center', scoreCard: { entryId: 'team', name: 'Team' } }
    doc.pages[0].objects = [{ ...card, id: 'c1', left: 100 }, { ...card, id: 'c2', left: 300 }]
    const view = openLink(session, 'view')!
    let board: Scoreboard | null = null
    view.subscribe((message) => { if (message.kind === 'scoreboard') board = message.scoreboard })
    engine = await setup(doc, { session })
    const pages = JSON.stringify(engine.state.doc.pages)
    act(() => view.send({ kind: 'hello' }))
    await waitFor(() => expect(board?.entries[0].score).toBe(0))
    await waitFor(() => expect(screen.getByTestId('present-frame')).toHaveAttribute('data-ready', 'true'))
    const frame = screen.getByTestId('present-frame') as HTMLCanvasElement
    const pixels = () => frame.getContext('2d')!.getImageData(0, 0, frame.width, frame.height).data.reduce((sum, value) => sum + value, 0)
    const before = pixels()
    act(() => view.send({ kind: 'command', command: { action: 'score-adjust', entryId: 'team', value: 5 } }))
    await waitFor(() => expect(board?.entries[0].score).toBe(5))
    await waitFor(() => expect(pixels()).not.toEqual(before))
    act(() => view.send({ kind: 'command', command: { action: 'score-card', pageId, cardId: 'c1', visible: false } }))
    await waitFor(() => {
      expect([...frame.getContext('2d')!.getImageData(100, 220, 1, 1).data]).toEqual([255, 255, 255, 255])
      expect([...frame.getContext('2d')!.getImageData(500, 220, 1, 1).data]).toEqual([106, 82, 217, 255])
    })
    expect((board as Scoreboard | null)?.cards[1].visible).toBe(true)
    expect(frame).toHaveAttribute('data-page-id', pageId)
    expect(JSON.stringify(engine.state.doc.pages)).toBe(pages)
    expect(engine.state.doc.scoreboard).toEqual({ entries: [{ id: 'team', name: 'Team', score: 5 }], cards: [{ pageId, id: 'c1', entryId: 'team', visible: false }] })
    view.close()
  })

  it('spins the current wheel from the presenter channel and reports its result', async () => {
    const session = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'
    linkView()
    stubReducedMotion(true)
    const doc = createBlankDocument(400, 300)
    const pageId = doc.pages[0].id
    doc.pages[0].objects = [{ id: 'wheel', type: 'dorywheel', name: 'Prize', wheel: defaultWheel(), left: 200, top: 150, width: 200, height: 200 }]
    const view = openLink(session, 'view')
    if (!view) throw new Error('no channel')
    const received = vi.fn()
    view.subscribe(received)
    engine = await setup(doc, { session })
    const before = JSON.stringify(engine.state.doc)
    await waitFor(() => expect(screen.getByRole('button', { name: `${t.wheel.spin}: Prize` })).toBeInTheDocument())
    act(() => view.send({ kind: 'command', command: { action: 'spin-wheel', pageId: 'other', wheelId: 'wheel' } }))
    expect(received).not.toHaveBeenCalledWith(expect.objectContaining({ kind: 'interactive-status' }))
    act(() => view.send({ kind: 'command', command: { action: 'spin-wheel', pageId, wheelId: 'wheel' } }))
    expect(received).toHaveBeenCalledWith(expect.objectContaining({ kind: 'interactive-status', pageId, text: expect.stringContaining(t.wheel.winner) }))
    expect(JSON.stringify(engine.state.doc)).toBe(before)
    view.close()
  })
  it('rolls dice from the presenter channel one at a time or together, with a total for numbered dice', async () => {
    const session = 'a1b2c3d4e5f60718293a4b5c6d7e8f91'
    linkView()
    stubReducedMotion(true)
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => { (array as Uint32Array)[0] = 2; return array })
    const doc = createBlankDocument(400, 300)
    const pageId = doc.pages[0].id
    const die = { type: 'dorydie', die: defaultDie(), top: 150, width: 100, height: 100 }
    doc.pages[0].objects = [{ ...die, id: 'd1', name: 'Red', left: 100 }, { ...die, id: 'd2', name: 'Blue', left: 300 }]
    const view = openLink(session, 'view')
    if (!view) throw new Error('no channel')
    const received = vi.fn()
    view.subscribe(received)
    engine = await setup(doc, { session })
    const before = JSON.stringify(engine.state.doc)
    await waitFor(() => expect(screen.getByRole('button', { name: `${t.dice.roll}: Blue` })).toBeInTheDocument())
    act(() => view.send({ kind: 'command', command: { action: 'roll-dice', pageId, dieIds: ['d2'] } }))
    expect(received).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'interactive-status', pageId, text: `${t.dice.result}: 3` }))
    act(() => view.send({ kind: 'command', command: { action: 'roll-dice', pageId, dieIds: ['d1', 'd2'] } }))
    expect(received).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'interactive-status', pageId, text: `${t.dice.result}: 3, 3 (${t.dice.total}: 6)` }))
    act(() => view.send({ kind: 'command', command: { action: 'roll-dice', pageId, dieIds: ['d1', 'missing'] } }))
    expect(received).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'interactive-status', text: t.presenter.preparing }))
    expect(JSON.stringify(engine.state.doc)).toBe(before)
    view.close()
  })
})
