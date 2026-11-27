import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DoryDocument } from '@/types/document'
import { EditorProvider } from '../EditorProvider'
import { createMemoryAdapter } from '../dev/memoryAdapter'
import { EditorEngine } from '../engine/editor'
import { t } from '../strings'
import { PageStrip } from './PageStrip'

vi.mock('./useSnapshot', () => ({ usePageSnapshot: () => null }))
const engines: EditorEngine[] = []
function setup(readOnly = false) {
  const doc: DoryDocument = {
    schemaVersion: 1, width: 1920, height: 1080, unit: 'px',
    meta: { sections: [{ id: 'r1', name: 'Round 1' }, { id: 'r2', name: 'Round 2' }] },
    pages: ['A', 'B', 'C', 'D'].map((name, index) => ({ id: name, name, sectionId: index < 2 ? 'r1' : 'r2', background: { type: 'solid', color: '#fff' }, objects: [] })),
  }
  const engine = new EditorEngine({ document: doc, adapter: createMemoryAdapter().adapter, meta: { id: 'sections', title: 'Game', mode: readOnly ? 'shared-view' : 'guest' }, ephemeral: true })
  engines.push(engine)
  render(<EditorProvider engine={engine} portalRoot={null}><PageStrip /></EditorProvider>)
  return engine
}

afterEach(() => { cleanup(); engines.splice(0).forEach((engine) => engine.dispose()) })

describe('slide timeline', () => {
  it('starts a named section at the selected slide without changing deck order', () => {
    const engine = setup()
    fireEvent.click(screen.getByRole('button', { name: 'B' }))
    fireEvent.click(screen.getByRole('button', { name: t.sections.add }))
    fireEvent.change(screen.getByLabelText(t.sections.name), { target: { value: 'Questions' } })
    fireEvent.click(screen.getByRole('button', { name: t.sections.save }))
    const section = engine.getDocument().meta?.sections?.find((candidate) => candidate.name === 'Questions')
    expect(section).toBeDefined()
    expect(engine.getPage('B')?.sectionId).toBe(section?.id)
    expect(engine.getPage('A')?.sectionId).toBe('r1')
    expect(engine.getDocument().pages.map((page) => page.id)).toEqual(['A', 'B', 'C', 'D'])
    expect(screen.getByRole('button', { name: /Questions/, expanded: true })).toBeInTheDocument()
  })

  it('collapses a section into a preview without changing playback order and expands it again', () => {
    const engine = setup()
    fireEvent.click(screen.getByRole('button', { name: /Round 2/, expanded: true }))
    expect(screen.queryByRole('button', { name: 'C' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'B' })).toBeInTheDocument()
    expect(engine.getDocument().pages.map((page) => page.id)).toEqual(['A', 'B', 'C', 'D'])
    fireEvent.click(screen.getByRole('button', { name: /Round 2/, expanded: false }))
    expect(screen.getByRole('button', { name: 'C' })).toBeInTheDocument()
  })

  it('appends a slide dropped on empty space in another track', () => {
    const engine = setup()
    const lane = screen.getByRole('button', { name: 'D' }).closest('ol')!
    const dataTransfer = { types: ['text/x-doory-page'], getData: () => 'A' }
    fireEvent.dragOver(lane, { dataTransfer })
    fireEvent.drop(lane, { dataTransfer })
    expect(engine.getPage('A')?.sectionId).toBe('r2')
    expect(engine.getDocument().pages.map((page) => page.id)).toEqual(['B', 'C', 'D', 'A'])
  })

  it('renames sections and moves the selected slide into them', () => {
    const engine = setup()
    fireEvent.click(screen.getByRole('button', { name: `${t.sections.rename}: Round 2` }))
    fireEvent.change(screen.getByLabelText(t.sections.name), { target: { value: 'Final round' } })
    fireEvent.click(screen.getByRole('button', { name: t.sections.save }))
    expect(engine.getDocument().meta?.sections?.[1].name).toBe('Final round')
    fireEvent.change(screen.getByLabelText(t.sections.move), { target: { value: 'r2' } })
    expect(engine.getPage('A')?.sectionId).toBe('r2')
    expect(engine.getDocument().pages.map((page) => page.id)).toEqual(['B', 'C', 'D', 'A'])
  })

  it('allows collapsing the active section and reveals it on navigation to another slide', () => {
    const engine = setup()
    fireEvent.click(screen.getByRole('button', { name: /Round 1/, expanded: true }))
    expect(screen.queryByRole('button', { name: 'B' })).not.toBeInTheDocument()
    act(() => engine.pages.activate('B'))
    expect(screen.getByRole('button', { name: /^B,/ })).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: /Round 1/, expanded: true })).toBeInTheDocument()
  })

  it('allows read-only viewers to collapse sections but not edit them', () => {
    setup(true)
    expect(screen.queryByRole('button', { name: t.sections.add })).not.toBeInTheDocument()
    expect(screen.queryByLabelText(t.sections.move)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /Round 2/, expanded: true }))
    expect(screen.getByRole('button', { name: /Round 2/, expanded: false })).toBeInTheDocument()
  })
})
