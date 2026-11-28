import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../strings'
import { type Envelope, openLink, type PagePreview, type PresenterLink } from '../channel'
import { initialState, type SlideshowState } from '../machine'
import { createChannelHub } from '../testing'
import { PresenterView } from './PresenterView'

const SESSION = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'
const pages: PagePreview[] = [
  { id: 'a', name: 'Intro', notes: 'Welcome everyone.\nSay hello.', durationSec: 10, width: 1920, height: 1080, actions: [{ pageId: 'c', label: 'Open answer' }] },
  { id: 'b', name: 'Square', notes: '', durationSec: 10, width: 1080, height: 1080 },
  { id: 'c', name: '', notes: '<b>not bold</b>', durationSec: null, width: 1080, height: 1920 },
]
const config = { count: pages.length, durations: pages.map((p) => p.durationSec) }
const stateAt = (patch: Partial<SlideshowState> = {}): SlideshowState => ({ ...initialState(config, { autoAdvance: true }), ...patch })

class FakeObserver {
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
}

/** The audience window's end of the conversation, driven by the test. */
function audience() {
  const hub = createChannelHub()
  const received: Envelope[] = []
  const show = openLink(SESSION, 'show', hub.create) as PresenterLink
  show.subscribe((m) => received.push(m))
  const init = (state: SlideshowState = stateAt()): void => show.send({ kind: 'init', title: 'Launch deck', theme: 'dark', pages, state })
  return { hub, show, received, init, commands: () => received.filter((m) => m.kind === 'command').map((m) => (m as Extract<Envelope, { kind: 'command' }>).command) }
}

function pointer(target: HTMLElement, type: string, x: number, y: number): void {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y })
  Object.defineProperty(event, 'pointerId', { value: 1 })
  fireEvent(target, event)
}

describe('PresenterView', () => {
  let originalWidth: PropertyDescriptor | undefined
  let originalHeight: PropertyDescriptor | undefined
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', FakeObserver)
    originalWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
    originalHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 640 })
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 360 })
    URL.createObjectURL = vi.fn(() => 'blob:preview')
    URL.revokeObjectURL = vi.fn()
    localStorage.clear()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    if (originalWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalWidth)
    if (originalHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalHeight)
  })

  it('refuses an address without a valid session, and a browser without a channel', () => {
    const { unmount } = render(<PresenterView session="nope" />)
    expect(screen.getByRole('alert')).toHaveTextContent(t.presenterView.invalid)
    unmount()
    vi.stubGlobal('BroadcastChannel', undefined)
    render(<PresenterView session={SESSION} />)
    expect(screen.getByRole('alert')).toHaveTextContent(t.presenterView.unsupported)
  })

  it('says hello until the presentation answers, then shows it', async () => {
    const a = audience()
    render(<PresenterView session={SESSION} createChannel={a.hub.create} />)
    expect(screen.getByText(t.presenterView.connecting)).toBeInTheDocument()
    await waitFor(() => expect(a.received.some((m) => m.kind === 'hello')).toBe(true))
    act(() => a.init())
    expect(await screen.findByTestId('view-root')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Launch deck')
    expect(screen.getByTestId('view-counter')).toHaveTextContent(t.presenterView.pageOfTotal(1, 3))
    expect(screen.getByTestId('view-notes')).toHaveTextContent('Welcome everyone.')
    expect(document.title).toBe(t.presenterView.pageTitle('Launch deck'))
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('asks for the pictures it needs and shows them when they arrive', async () => {
    const a = audience()
    render(<PresenterView session={SESSION} createChannel={a.hub.create} />)
    await waitFor(() => expect(a.received.some((m) => m.kind === 'hello')).toBe(true))
    act(() => a.init())
    await screen.findByTestId('view-root')
    await waitFor(() => expect(a.received.filter((m) => m.kind === 'need-frame').length).toBeGreaterThanOrEqual(2))
    const asked = a.received.filter((m): m is Extract<Envelope, { kind: 'need-frame' }> => m.kind === 'need-frame')
    expect(asked.map((m) => m.pageId)).toEqual(expect.arrayContaining(['a', 'b']))
    expect(asked.every((m) => m.width >= 160 && m.width <= 1600 && m.width % 160 === 0)).toBe(true)
    const current = asked.find((m) => m.pageId === 'a')
    expect(current).toBeDefined()
    expect(screen.getByTestId('view-current-picture')).toHaveTextContent(t.presenterView.previewLoading)
    act(() => a.show.send({ kind: 'frame', pageId: 'a', width: (current as { width: number }).width, image: new Blob(['x'], { type: 'image/png' }) }))
    const img = await screen.findByAltText(t.presenterView.previewAlt(t.presenterView.current, 1, 'Intro'))
    expect(img).toHaveAttribute('src', 'blob:preview')
  })

  it('sends linked slide actions from the presenter view', async () => {
    const a = audience()
    render(<PresenterView session={SESSION} createChannel={a.hub.create} />)
    await waitFor(() => expect(a.received.some((m) => m.kind === 'hello')).toBe(true))
    act(() => a.init())
    await screen.findByTestId('view-root')
    fireEvent.click(screen.getByTestId('view-action-0'))
    expect(a.commands()).toContainEqual({ action: 'follow', index: 2 })
  })

  it('previews the flow destination instead of the next slide in deck order', async () => {
    const a = audience()
    render(<PresenterView session={SESSION} createChannel={a.hub.create} />)
    await waitFor(() => expect(a.received.some((m) => m.kind === 'hello')).toBe(true))
    act(() => a.show.send({
      kind: 'init', title: 'Flow', theme: null, state: stateAt(),
      pages: pages.map((page, index) => index === 0 ? { ...page, nextPageId: 'c' } : page),
    }))
    await screen.findByTestId('view-root')
    await waitFor(() => expect(a.received.some((message) => message.kind === 'need-frame' && message.pageId === 'c')).toBe(true))
  })

  it('follows the state it is sent: page, notes, "last page"', async () => {
    const a = audience()
    render(<PresenterView session={SESSION} createChannel={a.hub.create} />)
    await waitFor(() => expect(a.received.some((m) => m.kind === 'hello')).toBe(true))
    act(() => a.init())
    await screen.findByTestId('view-root')
    act(() => a.show.send({ kind: 'state', state: stateAt({ index: 2 }) }))
    expect(screen.getByTestId('view-counter')).toHaveTextContent(t.presenterView.pageOfTotal(3, 3))
    // Notes are text, never markup.
    expect(screen.getByTestId('view-notes')).toHaveTextContent('<b>not bold</b>')
    expect(screen.getByTestId('view-notes').querySelector('b')).toBeNull()
    expect(screen.getByText(t.presenterView.lastPage)).toBeInTheDocument()
    act(() => a.show.send({ kind: 'state', state: stateAt({ index: 1 }) }))
    expect(screen.getByTestId('view-notes')).toHaveTextContent(t.presenterView.noNotes)
  })

  it('runs its clocks between messages, and stops the page clock when paused', async () => {
    const a = audience()
    vi.useFakeTimers({ shouldAdvanceTime: false })
    try {
      render(<PresenterView session={SESSION} createChannel={a.hub.create} />)
      act(() => a.init(stateAt({ pageMs: 2000, totalMs: 65_000 })))
      expect(screen.getByTestId('view-elapsed')).toHaveTextContent('1:05')
      expect(screen.getByTestId('view-timer')).toHaveTextContent(t.presenterView.remaining('0:08'))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000)
      })
      expect(screen.getByTestId('view-elapsed')).toHaveTextContent('1:08')
      expect(screen.getByTestId('view-timer')).toHaveTextContent(t.presenterView.remaining('0:05'))
      act(() => a.show.send({ kind: 'state', state: stateAt({ pageMs: 5000, totalMs: 68_000, paused: true }) }))
      await act(async () => {
        await vi.advanceTimersByTimeAsync(3000)
      })
      expect(screen.getByTestId('view-timer')).toHaveTextContent(t.presenterView.pausedNote)
      expect(screen.getByTestId('view-elapsed')).toHaveTextContent('1:11')
      act(() => a.show.send({ kind: 'state', state: stateAt({ index: 2 }) }))
      expect(screen.getByTestId('view-timer')).toHaveTextContent(t.presenterView.waits)
    } finally {
      vi.useRealTimers()
    }
  })

  it('sends commands from its buttons and keys', async () => {
    const a = audience()
    const user = userEvent.setup()
    render(<PresenterView session={SESSION} createChannel={a.hub.create} />)
    act(() => a.init(stateAt({ index: 1 })))
    await screen.findByTestId('view-root')
    await user.click(screen.getByTestId('view-next-button'))
    await user.click(screen.getByTestId('view-prev'))
    await user.click(screen.getByTestId('view-pause'))
    await user.click(screen.getByTestId('view-loop'))
    await user.click(screen.getByTestId('view-restart'))
    await user.click(screen.getByTestId('view-blackout'))
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    fireEvent.keyDown(document, { key: 'Home' })
    fireEvent.keyDown(document, { key: 'End' })
    fireEvent.keyDown(document, { key: 'p' })
    fireEvent.keyDown(document, { key: 'b' })
    fireEvent.keyDown(document, { key: 'r' })
    fireEvent.keyDown(document, { key: 'ArrowLeft', ctrlKey: true })
    fireEvent.keyDown(document, { key: 'n' })
    await user.click(screen.getByTestId('view-exit'))
    expect(a.commands().map((c) => c.action)).toEqual(['next', 'prev', 'toggle-pause', 'toggle-loop', 'restart', 'toggle-blackout', 'next', 'first', 'last', 'toggle-pause', 'toggle-blackout', 'restart', 'exit'])
  })

  it('offers the current page wheels and displays their results', async () => {
    const a = audience()
    const user = userEvent.setup()
    render(<PresenterView session={SESSION} createChannel={a.hub.create} />)
    act(() => a.show.send({
      kind: 'init', title: 'Deck', theme: null,
      pages: [{ ...pages[0], actions: [], wheels: [{ id: 'w1', label: 'Prize' }, { id: 'w2', label: 'Bonus' }] }, pages[1]],
      state: stateAt(),
    }))
    await user.click(await screen.findByRole('button', { name: `${t.wheel.spin}: Bonus` }))
    expect(a.commands()).toContainEqual({ action: 'spin-wheel', pageId: 'a', wheelId: 'w2' })
    act(() => a.show.send({ kind: 'interactive-status', pageId: 'a', text: 'Winner: Red' }))
    expect(screen.getByText('Winner: Red')).toBeInTheDocument()
    act(() => a.show.send({ kind: 'state', state: stateAt({ blackout: true }) }))
    expect(screen.getByRole('button', { name: `${t.wheel.spin}: Prize` })).toBeDisabled()
    act(() => a.show.send({ kind: 'state', state: stateAt({ index: 1 }) }))
    expect(screen.queryByRole('button', { name: `${t.wheel.spin}: Prize` })).toBeNull()
    expect(screen.queryByText('Winner: Red')).toBeNull()
  })

  it('rolls the current page dice one at a time or all together', async () => {
    const a = audience()
    const user = userEvent.setup()
    render(<PresenterView session={SESSION} createChannel={a.hub.create} />)
    act(() => a.show.send({
      kind: 'init', title: 'Deck', theme: null,
      pages: [{ ...pages[0], actions: [], dice: [{ id: 'd1', label: 'Red' }, { id: 'd2', label: 'Blue' }] }, { ...pages[1], dice: [{ id: 'd3', label: 'Solo' }] }],
      state: stateAt(),
    }))
    await user.click(await screen.findByRole('button', { name: `${t.dice.roll}: Blue` }))
    await user.click(screen.getByRole('button', { name: t.dice.rollAll }))
    expect(a.commands().slice(-2)).toEqual([
      { action: 'roll-dice', pageId: 'a', dieIds: ['d2'] },
      { action: 'roll-dice', pageId: 'a', dieIds: ['d1', 'd2'] },
    ])
    act(() => a.show.send({ kind: 'interactive-status', pageId: 'a', text: 'Result: 2, 5 (Total: 7)' }))
    expect(screen.getByText('Result: 2, 5 (Total: 7)')).toBeInTheDocument()
    act(() => a.show.send({ kind: 'state', state: stateAt({ index: 1 }) }))
    expect(screen.getByRole('button', { name: `${t.dice.roll}: Solo` })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: t.dice.rollAll })).toBeNull()
  })

  it('outlines the dice a button points at, and the dice last rolled', async () => {
    const a = audience()
    const user = userEvent.setup()
    render(<PresenterView session={SESSION} createChannel={a.hub.create} />)
    const dice = [{ id: 'd1', label: 'Red', box: { x: 0.1, y: 0.2, w: 0.25, h: 0.5 } }, { id: 'd2', label: 'Blue', box: { x: 0.6, y: 0.2, w: 0.25, h: 0.5 } }]
    act(() => a.show.send({ kind: 'init', title: 'Deck', theme: null, pages: [{ ...pages[0], actions: [], dice }, pages[1]], state: stateAt() }))
    const marks = () => screen.queryAllByTestId('view-current-mark')
    await screen.findByTestId('view-root')
    expect(marks()).toHaveLength(0)
    await user.hover(screen.getByRole('button', { name: t.dice.rollAll }))
    expect(marks()).toHaveLength(2)
    await user.hover(screen.getByRole('button', { name: `${t.dice.roll}: Blue` }))
    expect(marks()).toHaveLength(1)
    expect(marks()[0]).toHaveStyle({ left: '60%', top: '20%', width: '25%', height: '50%' })
    await user.click(screen.getByRole('button', { name: `${t.dice.roll}: Blue` }))
    await user.unhover(screen.getByRole('button', { name: `${t.dice.roll}: Blue` }))
    expect(marks()).toHaveLength(1)
    act(() => a.show.send({ kind: 'state', state: stateAt({ index: 1 }) }))
    expect(marks()).toHaveLength(0)
  })

  it('changes the notes text size and remembers it', async () => {
    const a = audience()
    const user = userEvent.setup()
    const { unmount } = render(<PresenterView session={SESSION} createChannel={a.hub.create} />)
    act(() => a.init())
    await screen.findByTestId('view-root')
    expect(screen.getByTestId('view-notes')).toHaveStyle({ fontSize: '28px' })
    await user.click(screen.getByTestId('view-larger'))
    expect(screen.getByTestId('view-notes')).toHaveStyle({ fontSize: '36px' })
    fireEvent.keyDown(document, { key: '-' })
    fireEvent.keyDown(document, { key: '-' })
    expect(screen.getByTestId('view-notes')).toHaveStyle({ fontSize: '22px' })
    unmount()
    render(<PresenterView session={SESSION} createChannel={a.hub.create} />)
    act(() => a.init())
    await screen.findByTestId('view-root')
    expect(screen.getByTestId('view-notes')).toHaveStyle({ fontSize: '22px' })
  })

  it('says the presentation ended when it leaves, and says goodbye when it closes', async () => {
    const a = audience()
    const { unmount } = render(<PresenterView session={SESSION} createChannel={a.hub.create} />)
    act(() => a.init())
    await screen.findByTestId('view-root')
    act(() => a.show.send({ kind: 'bye' }))
    expect(screen.getByTestId('view-ended')).toHaveTextContent(t.presenterView.ended)
    expect(screen.getByTestId('view-exit')).toBeDisabled()
    unmount()
    expect(a.received.at(-1)).toMatchObject({ kind: 'bye', from: 'view' })
  })

  it('warns when the presentation goes quiet', async () => {
    const a = audience()
    vi.useFakeTimers({ shouldAdvanceTime: false })
    try {
      render(<PresenterView session={SESSION} createChannel={a.hub.create} />)
      act(() => a.init())
      expect(screen.queryByTestId('view-lost')).toBeNull()
      await act(async () => {
        await vi.advanceTimersByTimeAsync(6000)
      })
      expect(screen.getByTestId('view-lost')).toHaveTextContent(t.presenterView.lost)
      act(() => a.show.send({ kind: 'state', state: stateAt() }))
      expect(screen.queryByTestId('view-lost')).toBeNull()
    } finally {
      vi.useRealTimers()
    }
  })

  it('toggles the flow map in place of the notes, without opening a window', async () => {
    const a = audience()
    const open = vi.spyOn(window, 'open')
    render(<PresenterView session={SESSION} createChannel={a.hub.create} />)
    await waitFor(() => expect(a.received.some((m) => m.kind === 'hello')).toBe(true))
    act(() => a.init())
    const toggle = await screen.findByTestId('view-flow-map')
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    const size = screen.getByTestId('view-size').textContent

    await userEvent.click(toggle)
    expect(open).not.toHaveBeenCalled()
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByTestId('map-root')).toBeInTheDocument()
    expect(screen.queryByTestId('view-notes')).toBeNull()
    // The map's zoom keys don't also change the notes size.
    screen.getByTestId('map-scroll').focus()
    await userEvent.keyboard('+')
    expect(screen.getByTestId('map-zoom')).toHaveTextContent('125%')

    await userEvent.click(toggle)
    expect(screen.queryByTestId('map-root')).toBeNull()
    expect(screen.getByTestId('view-size')).toHaveTextContent(size ?? '')
    open.mockRestore()
  })

  it('replaces panels with the flow map using the existing connection, and keeps its zoom separate from notes', async () => {
    const a = audience()
    const { unmount } = render(<PresenterView session={SESSION} createChannel={a.hub.create} />)
    act(() => a.init())
    const next = within(await screen.findByTestId('view-panel-next'))
    fireEvent.change(next.getByRole('combobox', { name: t.presenterView.panelComponent }), { target: { value: 'flow' } })
    expect(screen.queryByTestId('view-next')).toBeNull()
    expect(screen.getByTestId('map-root')).toBeInTheDocument()
    expect(document.title).toBe(t.presenterView.pageTitle('Launch deck'))
    expect(a.received.filter((m) => m.kind === 'hello')).toHaveLength(1)
    fireEvent.click(screen.getByTestId('map-card-2'))
    expect(a.commands()).toEqual([{ action: 'follow', index: 2 }])
    fireEvent.keyDown(screen.getByTestId('map-scroll'), { key: '+' })
    expect(screen.getByTestId('map-zoom')).toHaveTextContent('125%')
    expect(screen.getByTestId('view-size')).toHaveTextContent('28')
    fireEvent.keyDown(screen.getByTestId('map-scroll'), { key: 'ArrowRight' })
    expect(a.commands()).toHaveLength(1)
    for (let i = 0; i < 10; i++) fireEvent.click(next.getByRole('button', { name: t.workspace.zoomOut }))
    expect(screen.getByTestId('map-zoom')).toHaveTextContent('20%')
    unmount()

    render(<PresenterView session={SESSION} createChannel={a.hub.create} />)
    act(() => a.init())
    expect(await screen.findByTestId('map-zoom')).toHaveTextContent('20%')
  })

  it('adds, removes and resets panels, retaining an intentionally empty layout', async () => {
    const a = audience()
    const { unmount } = render(<PresenterView session={SESSION} createChannel={a.hub.create} />)
    act(() => a.init())
    await screen.findByTestId('view-root')
    fireEvent.click(screen.getByRole('button', { name: t.presenterView.addPanel }))
    expect(screen.getAllByRole('combobox', { name: t.presenterView.panelComponent })).toHaveLength(4)
    expect(screen.getByTestId('map-root')).toBeInTheDocument()
    screen.getAllByRole('button', { name: t.presenterView.removePanel }).forEach((button) => fireEvent.click(button))
    expect(screen.getByText(t.presenterView.emptyLayout)).toBeInTheDocument()
    unmount()
    render(<PresenterView session={SESSION} createChannel={a.hub.create} />)
    act(() => a.init())
    expect(await screen.findByText(t.presenterView.emptyLayout)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: t.presenterView.resetLayout }))
    expect(screen.getAllByRole('combobox', { name: t.presenterView.panelComponent })).toHaveLength(3)
    expect(screen.getByTestId('view-current')).toBeInTheDocument()
    expect(screen.getByTestId('view-next')).toBeInTheDocument()
    expect(screen.getByTestId('view-notes')).toBeInTheDocument()
  })

  it('moves and resizes panels with pointers and keys without driving the show, and saves their geometry', async () => {
    const a = audience()
    const { unmount } = render(<PresenterView session={SESSION} createChannel={a.hub.create} />)
    act(() => a.init())
    const panel = await screen.findByTestId('view-panel-next')
    vi.spyOn(screen.getByTestId('view-dashboard'), 'getBoundingClientRect').mockReturnValue({ width: 1000, height: 500 } as DOMRect)
    const move = within(panel).getByRole('button', { name: t.presenterView.movePanel })
    pointer(move, 'pointerdown', 600, 0)
    pointer(move, 'pointermove', 400, 100)
    pointer(move, 'pointerup', 400, 100)
    expect(panel).toHaveStyle({ left: '40%', top: '20%', width: '40%', height: '36%' })
    const resize = within(panel).getByTestId('view-resize-se')
    pointer(resize, 'pointerdown', 800, 280)
    pointer(resize, 'pointermove', 900, 330)
    pointer(resize, 'pointerup', 900, 330)
    expect(panel).toHaveStyle({ width: '50%', height: '46%' })
    fireEvent.keyDown(move, { key: 'ArrowRight', shiftKey: true })
    fireEvent.keyDown(resize, { key: 'ArrowDown' })
    expect(panel).toHaveStyle({ left: '45%', height: '47%' })
    fireEvent.keyDown(resize, { key: 'ArrowRight', shiftKey: true })
    expect(panel).toHaveStyle({ width: '55%' })
    fireEvent.keyDown(move, { key: 'ArrowRight', shiftKey: true })
    expect(panel).toHaveStyle({ left: '45%' })
    expect(a.commands()).toEqual([])
    unmount()
    render(<PresenterView session={SESSION} createChannel={a.hub.create} />)
    act(() => a.init())
    expect(await screen.findByTestId('view-panel-next')).toHaveStyle({ left: '45%', top: '20%', width: '55%', height: '47%' })
  })

  it.each([
    { edge: 'n', x: 40, y: 30, width: 40, height: 26 },
    { edge: 'ne', x: 40, y: 30, width: 50, height: 26 },
    { edge: 'e', x: 40, y: 20, width: 50, height: 36 },
    { edge: 'se', x: 40, y: 20, width: 50, height: 46 },
    { edge: 's', x: 40, y: 20, width: 40, height: 46 },
    { edge: 'sw', x: 50, y: 20, width: 30, height: 46 },
    { edge: 'w', x: 50, y: 20, width: 30, height: 36 },
    { edge: 'nw', x: 50, y: 30, width: 30, height: 26 },
  ])('resizes from the $edge edge without moving the opposite edges', async ({ edge, x, y, width, height }) => {
    const a = audience()
    render(<PresenterView session={SESSION} createChannel={a.hub.create} />)
    act(() => a.init())
    const panel = await screen.findByTestId('view-panel-next')
    vi.spyOn(screen.getByTestId('view-dashboard'), 'getBoundingClientRect').mockReturnValue({ width: 1000, height: 500 } as DOMRect)
    const move = within(panel).getByRole('button', { name: t.presenterView.movePanel })
    pointer(move, 'pointerdown', 0, 0)
    pointer(move, 'pointermove', -200, 100)
    pointer(move, 'pointerup', -200, 100)
    const resize = within(panel).getByTestId(`view-resize-${edge}`)
    pointer(resize, 'pointerdown', 0, 0)
    pointer(resize, 'pointermove', 100, 50)
    pointer(resize, 'pointerup', 100, 50)
    expect(panel).toHaveStyle({ left: `${x}%`, top: `${y}%`, width: `${width}%`, height: `${height}%` })
    if (edge === 'nw') {
      pointer(resize, 'pointerdown', 0, 0)
      pointer(resize, 'pointermove', 1000, 500)
      pointer(resize, 'pointerup', 1000, 500)
      expect(panel).toHaveStyle({ left: '60%', top: '36%', width: '20%', height: '20%' })
      pointer(resize, 'pointerdown', 0, 0)
      pointer(resize, 'pointermove', -1000, -500)
      pointer(resize, 'pointerup', -1000, -500)
      expect(panel).toHaveStyle({ left: '0%', top: '0%', width: '80%', height: '56%' })
    }
    expect(a.commands()).toEqual([])
  })

  it('scales previews and notes independently and restores their scales', async () => {
    const a = audience()
    const { unmount } = render(<PresenterView session={SESSION} createChannel={a.hub.create} />)
    act(() => a.init())
    const current = within(await screen.findByTestId('view-panel-current'))
    const notes = within(screen.getByTestId('view-panel-notes'))
    fireEvent.click(current.getByRole('button', { name: t.workspace.zoomIn }))
    expect(screen.getByTestId('view-current-picture')).toHaveStyle({ width: '800px', height: '450px' })
    expect(screen.getByTestId('view-next-picture')).toHaveStyle({ width: '360px', height: '360px' })
    expect(screen.getByTestId('view-notes')).toHaveStyle({ fontSize: '28px' })
    fireEvent.click(notes.getByRole('button', { name: t.workspace.zoomIn }))
    expect(screen.getByTestId('view-notes')).toHaveStyle({ fontSize: '35px' })
    unmount()
    render(<PresenterView session={SESSION} createChannel={a.hub.create} />)
    act(() => a.init())
    expect(await screen.findByTestId('view-notes')).toHaveStyle({ fontSize: '35px' })
    expect(screen.getByTestId('view-current-picture')).toHaveStyle({ width: '800px' })
  })

  it.each(['{broken', '[{"kind":"flow","x":-1}]', '[null]'])('falls back to the default layout for invalid stored configuration: %s', async (stored) => {
    localStorage.setItem('doory.presenterView.layout.v1', stored)
    const a = audience()
    render(<PresenterView session={SESSION} createChannel={a.hub.create} />)
    act(() => a.init())
    expect(await screen.findByTestId('view-current')).toBeInTheDocument()
    expect(screen.getByTestId('view-next')).toBeInTheDocument()
    expect(screen.getByTestId('view-notes')).toBeInTheDocument()
  })
})
