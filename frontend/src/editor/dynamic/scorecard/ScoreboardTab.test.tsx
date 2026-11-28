import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { DoryDocument } from '@/types/document'
import { EditorProvider } from '../../EditorProvider'
import { createMemoryAdapter } from '../../dev/memoryAdapter'
import { EditorEngine } from '../../engine/editor'
import { initialScoreboard } from '../../presenter/scoreboard'
import { t } from '../../strings'
import { ScoreboardTab } from './ScoreboardTab'

let engine: EditorEngine | null = null
afterEach(() => { cleanup(); engine?.dispose(); engine = null })

const card = { type: 'doryscorecard', width: 160, height: 90, left: 0, top: 0 }
const names = (doc: DoryDocument) => doc.pages.flatMap((page) => page.objects.map((object) => (object.scoreCard as { name: string }).name))

function setup(mode: 'guest' | 'shared-view' = 'guest') {
  const document: DoryDocument = {
    schemaVersion: 1, width: 800, height: 600, unit: 'px',
    pages: ['p1', 'p2'].map((id) => ({ id, name: id, background: { type: 'solid', color: '#ffffff' }, objects: [{ ...card, id: `${id}-card`, name: 'Card', scoreCard: { entryId: 'team', name: 'Team' } }] })),
    scoreboard: { entries: [{ id: 'team', name: 'Team', score: 3 }, { id: 'reds', name: 'Reds', score: 1 }], cards: [] },
  }
  engine = new EditorEngine({ adapter: createMemoryAdapter().adapter, document, meta: { id: 'd', title: 'Game', mode }, ephemeral: true })
  render(<EditorProvider engine={engine} portalRoot={null}><ScoreboardTab /></EditorProvider>)
  return engine
}

describe('Scoreboard tab', () => {
  it('only changes scores and card show/hide states; players come from the names on the cards', async () => {
    const engine = setup()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByText('Reds')).toBeNull()
    act(() => screen.getByRole('button', { name: `${t.scoreboard.increase}: Team` }).click())
    expect(engine.state.doc.scoreboard?.entries).toEqual([{ id: 'team', name: 'Team', score: 4 }])
    act(() => screen.getByRole('button', { name: '25×' }).click())
    act(() => screen.getByRole('button', { name: `${t.scoreboard.decrease}: Team` }).click())
    expect(engine.state.doc.scoreboard?.entries[0].score).toBe(-21)
    const reset = screen.getByRole('button', { name: `${t.scoreboard.reset}: Team` })
    act(() => reset.click())
    expect(engine.state.doc.scoreboard?.entries[0].score).toBe(-21)
    fireEvent.doubleClick(reset)
    expect(engine.state.doc.scoreboard?.entries).toEqual([{ id: 'team', name: 'Team', score: 0 }])
    expect(screen.getByRole('button', { name: `${t.scoreboard.reset}: Team` })).toBeDisabled()
    act(() => screen.getByRole('button', { name: `${t.scoreboard.hide}: p2: Team` }).click())
    expect(engine.state.doc.scoreboard?.cards).toEqual([{ pageId: 'p2', id: 'p2-card', entryId: 'team', visible: false }])
    expect(names(engine.state.doc)).toEqual(['Team', 'Team'])
    await act(() => engine.undo())
    expect(initialScoreboard(engine.state.doc).cards.every((card) => card.visible)).toBe(true)
  })

  it('shows a read-only design’s scoreboard without letting it change', () => {
    setup('shared-view')
    expect(screen.getByTestId('editor-scoreboard').querySelector('fieldset')).toBeDisabled()
  })
})
