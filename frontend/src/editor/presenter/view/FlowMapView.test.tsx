import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { t } from '../../strings'
import { type Envelope, openLink, type PagePreview, type PresenterLink } from '../channel'
import { initialState } from '../machine'
import { createChannelHub } from '../testing'
import { FlowMapView } from './FlowMapView'

const SESSION = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'
const pages: PagePreview[] = [
  { id: 'board', name: 'Board', notes: '', durationSec: null, width: 1920, height: 1080, flow: { x: 60, y: 60 }, section: { id: 'r1', name: 'Round 1' }, links: [{ pageId: 'q', x: 0.5, y: 0.5 }] },
  { id: 'q', name: 'Question', notes: '', durationSec: null, width: 1920, height: 1080, flow: { x: 60, y: 360 }, section: { id: 'clues', name: 'Clues' } },
  { id: 'a', name: 'Answer', notes: '', durationSec: null, width: 1920, height: 1080, nextPageId: 'board', flow: { x: 380, y: 360 }, section: { id: 'clues', name: 'Clues' } },
]

function pointer(target: HTMLElement, type: string, pointerId: number, x: number, y: number): void {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y })
  Object.defineProperty(event, 'pointerId', { value: pointerId })
  fireEvent(target, event)
}

function connect() {
  const hub = createChannelHub()
  const received: Envelope[] = []
  const show = openLink(SESSION, 'show', hub.create) as PresenterLink
  show.subscribe((m) => received.push(m))
  const state = initialState({ count: pages.length, durations: pages.map((p) => p.durationSec) })
  return { hub, show, received, init: () => show.send({ kind: 'init', title: 'Jeopardy', theme: null, pages, state }) }
}

describe('FlowMapView', () => {
  it('draws the deck in its section frames, follows the slide on screen and shows a clicked slide', async () => {
    const c = connect()
    const { unmount } = render(<FlowMapView session={SESSION} createChannel={c.hub.create} />)
    await waitFor(() => expect(c.received.some((m) => m.kind === 'hello' && m.viewId)).toBe(true))
    act(() => c.init())
    expect(await screen.findByTestId('map-root')).toBeInTheDocument()
    expect(screen.getByText('Round 1')).toBeInTheDocument()
    expect(screen.getByText('Clues')).toBeInTheDocument()
    expect(screen.getByTestId('map-card-0')).toHaveAttribute('aria-current', 'true')
    // The link arrow starts on its element: the middle of Board's thumbnail.
    expect(document.querySelector('circle')).toHaveAttribute('cx', String(60 + 12 + 98))

    await userEvent.click(screen.getByRole('button', { name: `${t.presenterView.showSlide} Question` }))
    expect(c.received.filter((m) => m.kind === 'command').map((m) => (m as Extract<Envelope, { kind: 'command' }>).command)).toEqual([{ action: 'follow', index: 1 }])

    act(() => c.show.send({ kind: 'state', state: { ...initialState({ count: 3, durations: [null, null, null] }), index: 1, history: [0] } }))
    expect(screen.getByTestId('map-card-1')).toHaveAttribute('aria-current', 'true')

    const hello = c.received.find((m) => m.kind === 'hello') as Extract<Envelope, { kind: 'hello' }>
    unmount()
    expect(c.received.some((m) => m.kind === 'bye' && m.viewId === hello.viewId)).toBe(true)
  })

  it('zooms with the wheel and the buttons, and pans when dragging empty space', async () => {
    const c = connect()
    render(<FlowMapView session={SESSION} createChannel={c.hub.create} />)
    await waitFor(() => expect(c.received.some((m) => m.kind === 'hello')).toBe(true))
    act(() => c.init())
    const scroll = await screen.findByTestId('map-scroll')
    expect(screen.getByTestId('map-zoom')).toHaveTextContent('100%')

    fireEvent.wheel(scroll, { deltaY: -200, clientX: 0, clientY: 0 })
    expect(screen.getByTestId('map-zoom')).toHaveTextContent('135%')
    await userEvent.click(screen.getByRole('button', { name: t.workspace.zoomOut }))
    expect(screen.getByTestId('map-zoom')).toHaveTextContent('108%')
    await userEvent.click(screen.getByTestId('map-zoom'))
    expect(screen.getByTestId('map-zoom')).toHaveTextContent('100%')

    scroll.scrollLeft = 100
    scroll.scrollTop = 100
    pointer(scroll, 'pointerdown', 1, 300, 300)
    pointer(scroll, 'pointermove', 1, 260, 250)
    pointer(scroll, 'pointerup', 1, 260, 250)
    expect(scroll.scrollLeft).toBe(140)
    expect(scroll.scrollTop).toBe(150)

    // Pressing a card is a click on it, never a pan.
    pointer(screen.getByTestId('map-card-1'), 'pointerdown', 2, 0, 0)
    pointer(scroll, 'pointermove', 2, 100, 100)
    expect(scroll.scrollLeft).toBe(140)
  })
})
