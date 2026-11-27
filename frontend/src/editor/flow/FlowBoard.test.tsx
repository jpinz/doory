import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DoryDocument } from '@/types/document'
import { EditorProvider } from '../EditorProvider'
import { createMemoryAdapter } from '../dev/memoryAdapter'
import { EditorEngine } from '../engine/editor'
import { t } from '../strings'
import { FlowBoard } from './FlowBoard'

vi.mock('../workspace/useSnapshot', () => ({ usePageSnapshot: () => null }))

const engines: EditorEngine[] = []
function setup(readOnly = false, grouped = false) {
  const document: DoryDocument = {
    schemaVersion: 1, width: 1920, height: 1080, unit: 'px',
    ...(grouped ? { meta: { sections: [{ id: 'r1', name: 'Round 1' }, { id: 'r2', name: 'Clues' }] } } : {}),
    pages: ['Board', 'Question', 'Answer'].map((name, index) => ({
      id: name.toLowerCase(), name, background: { type: 'solid', color: '#ffffff' }, objects: [],
      ...(grouped ? { sectionId: index === 0 ? 'r1' : 'r2' } : {}),
    })),
  }
  const { adapter } = createMemoryAdapter()
  const engine = new EditorEngine({ adapter, document, meta: { id: 'flow', title: 'Game', mode: readOnly ? 'shared-view' : 'guest' }, ephemeral: true })
  engines.push(engine)
  const onEdit = vi.fn()
  render(<EditorProvider engine={engine} portalRoot={null}><FlowBoard onEdit={onEdit} /></EditorProvider>)
  return { engine, onEdit }
}

afterEach(() => {
  cleanup()
  localStorage.clear()
  engines.splice(0).forEach((engine) => engine.dispose())
})

function pointerDrag(target: HTMLElement, from: { x: number; y: number }, to: { x: number; y: number }): void {
  target.setPointerCapture = vi.fn()
  target.releasePointerCapture = vi.fn()
  for (const [type, point] of [['pointerdown', from], ['pointermove', to], ['pointerup', to]] as const) {
    const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: point.x, clientY: point.y })
    Object.defineProperty(event, 'pointerId', { value: 1 })
    fireEvent(target, event)
  }
}

describe('FlowBoard', () => {
  it('connects the actual slides, allows ending or restoring deck order, and opens the selected slide', () => {
    const { engine, onEdit } = setup()
    fireEvent.click(screen.getByRole('button', { name: `${t.flowBoard.connect}: Board` }))
    fireEvent.click(screen.getByRole('button', { name: `${t.flowBoard.chooseDestination} Answer` }))
    expect(engine.getPage('board')?.presentationNext).toBe('answer')
    fireEvent.change(screen.getByRole('combobox', { name: t.flowBoard.next }), { target: { value: '__end__' } })
    expect(engine.getPage('board')?.presentationNext).toBeNull()
    fireEvent.change(screen.getByRole('combobox', { name: t.flowBoard.next }), { target: { value: '' } })
    expect(engine.getPage('board')?.presentationNext).toBeUndefined()
    fireEvent.click(screen.getByRole('button', { name: `${t.flowBoard.selectSlide} Question` }))
    fireEvent.click(screen.getByRole('button', { name: t.flowBoard.editSlide }))
    expect(onEdit).toHaveBeenCalledWith('question')
  })

  it('moves cards with the keyboard without reordering slides', () => {
    const { engine } = setup()
    fireEvent.keyDown(screen.getByRole('button', { name: 'Board' }), { key: 'ArrowRight' })
    expect(engine.getPage('board')?.flowPosition).toEqual({ x: 70, y: 80 })
    expect(engine.getDocument().pages.map((page) => page.id)).toEqual(['board', 'question', 'answer'])
  })

  it('commits a pointer drag only after release', () => {
    const { engine } = setup()
    const handle = screen.getByRole('button', { name: 'Board' })
    handle.setPointerCapture = vi.fn()
    handle.releasePointerCapture = vi.fn()
    const pointer = (type: string, x: number, y: number): void => {
      const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y })
      Object.defineProperty(event, 'pointerId', { value: 1 })
      fireEvent(handle, event)
    }
    pointer('pointerdown', 20, 30)
    pointer('pointermove', 60, 90)
    expect(engine.getPage('board')?.flowPosition).toBeUndefined()
    pointer('pointerup', 60, 90)
    expect(engine.getPage('board')?.flowPosition).toEqual({ x: 100, y: 140 })
    expect(engine.state.history.canUndo).toBe(true)
  })

  it('leaves shared presentations read-only', () => {
    const { engine } = setup(true)
    expect(screen.getByRole('button', { name: `${t.flowBoard.connect}: Board` })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: t.flowBoard.next })).toBeDisabled()
    fireEvent.keyDown(screen.getByRole('button', { name: 'Board' }), { key: 'ArrowRight' })
    expect(engine.getPage('board')?.flowPosition).toBeUndefined()
  })

  it('frames each section around its freely arranged cards', () => {
    setup(false, true)
    expect(screen.getByText('Round 1')).toBeInTheDocument()
    expect(screen.getByText('Clues')).toBeInTheDocument()
    expect(screen.getByRole('article', { name: 'Question' })).toHaveStyle({ left: '60px', top: '360px' })
  })

  it('remembers lane mode and moves slides between and along lanes in deck order', () => {
    const { engine } = setup(false, true)
    fireEvent.click(screen.getByRole('button', { name: t.flowBoard.lanes }))
    expect(localStorage.getItem('doory.flowGrouping')).toBe('lanes')
    expect(screen.getByText(`Clues · ${t.sections.count(2)}`)).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('button', { name: 'Board' }), { key: 'ArrowDown' })
    expect(engine.getPage('board')?.sectionId).toBe('r2')
    fireEvent.keyDown(screen.getByRole('button', { name: 'Board' }), { key: 'ArrowRight' })
    expect(engine.getDocument().pages.map((page) => page.id)).toEqual(['question', 'board', 'answer'])
    expect(engine.getPage('board')?.flowPosition).toBeUndefined()
  })

  it('drops a dragged card into the lane and slot under it', () => {
    localStorage.setItem('doory.flowGrouping', 'lanes')
    const { engine } = setup(false, true)
    pointerDrag(screen.getByRole('button', { name: 'Answer' }), { x: 0, y: 300 }, { x: 0, y: 0 })
    expect(engine.getPage('answer')?.sectionId).toBe('r1')
    expect(engine.getDocument().pages.map((page) => page.id)).toEqual(['board', 'answer', 'question'])
  })

  it('starts each object-click arrow at its linked element on the source thumbnail', () => {
    const { engine } = setup()
    const square = (id: string, left: number, pageId: string) => ({ id, type: 'rect', left, top: 540, width: 100, height: 100, originX: 'left', originY: 'top', presentationLink: { pageId } })
    act(() => engine.applyDocument({ ...engine.getDocument(), pages: engine.getDocument().pages.map((page) => page.id === 'board'
      ? { ...page, objects: [square('q1', 960, 'question'), square('q2', 0, 'answer')] } : page) }, { label: 'Link squares' }))
    // A 1920x1080 slide fills the 196x108 thumbnail at 0.1 scale, centred: 2 px side inset.
    const anchors = [...document.querySelectorAll('circle')].map((circle) => [circle.getAttribute('cx'), circle.getAttribute('cy')])
    expect(anchors).toEqual([['175', '183'], ['79', '183']])
  })

  it('drags a whole section frame as one undo step', async () => {
    const { engine } = setup(false, true)
    pointerDrag(screen.getByRole('button', { name: `${t.flowBoard.moveSection}: Clues` }), { x: 0, y: 0 }, { x: 40, y: 20 })
    expect(engine.getPage('question')?.flowPosition).toEqual({ x: 100, y: 380 })
    expect(engine.getPage('answer')?.flowPosition).toEqual({ x: 420, y: 380 })
    expect(engine.getPage('board')?.flowPosition).toBeUndefined()
    await act(() => engine.undo())
    expect(engine.getPage('question')?.flowPosition).toBeUndefined()
  })

  it('moves a whole lane earlier in the deck', () => {
    localStorage.setItem('doory.flowGrouping', 'lanes')
    const { engine } = setup(false, true)
    fireEvent.keyDown(screen.getByRole('button', { name: `${t.flowBoard.moveSection}: Clues` }), { key: 'ArrowUp' })
    expect(engine.getDocument().pages.map((page) => page.id)).toEqual(['question', 'answer', 'board'])
    expect(engine.getDocument().pages.map((page) => page.sectionId)).toEqual(['r2', 'r2', 'r1'])
  })
})
