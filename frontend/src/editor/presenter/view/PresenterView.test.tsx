import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { t } from '../../strings'
import { type Envelope, openLink, type PagePreview, type PresenterLink } from '../channel'
import { initialState, type SlideshowState } from '../machine'
import { createChannelHub } from '../testing'
import { PresenterView } from './PresenterView'

const SESSION = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'
const pages: PagePreview[] = [
  { id: 'a', name: 'Intro', notes: 'Welcome everyone.\nSay hello.', durationSec: 10, width: 1920, height: 1080 },
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
      pages: [{ ...pages[0], wheels: [{ id: 'w1', label: 'Prize' }, { id: 'w2', label: 'Bonus' }] }, pages[1]],
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
      pages: [{ ...pages[0], dice: [{ id: 'd1', label: 'Red' }, { id: 'd2', label: 'Blue' }] }, { ...pages[1], dice: [{ id: 'd3', label: 'Solo' }] }],
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
    act(() => a.show.send({ kind: 'init', title: 'Deck', theme: null, pages: [{ ...pages[0], dice }, pages[1]], state: stateAt() }))
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
})
