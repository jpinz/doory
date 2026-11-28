import { Group } from 'fabric'
import { afterEach, describe, expect, it } from 'vitest'
import { setupEditor } from '../../animation/testing'
import type { EditorEngine } from '../../engine/editor'
import { deserializeObjects, serializeObject } from '../../engine/serialization'
import { DoryScoreCard } from './DoryScoreCard'

let engine: EditorEngine | null = null
afterEach(() => { engine?.dispose(); engine = null })

describe('score cards', () => {
  it('round-trips grouped cards, escapes labels and leaves runtime scores out of serialization', async () => {
    const card = new DoryScoreCard({ scoreCard: { entryId: 'team', name: '<Team &>' }, angle: 25 })
    const group = new Group([card])
    const json = serializeObject(group)
    card.setDisplay({ name: '<Team &>', score: 42, visible: true })
    expect(card.toSVG()).toContain('&lt;Team &amp;&gt;')
    expect(card.toSVG()).toContain('>42</text>')
    expect(serializeObject(group)).toEqual(json)
    const [restored] = await deserializeObjects([json], { resolveSrc: async (src) => src, ensureFonts: async () => undefined })
    expect((restored as Group).getObjects()[0]).toBeInstanceOf(DoryScoreCard)
    expect(restored.toSVG()).toContain('>0</text>')
    group.dispose()
    restored.dispose()
  })

  it('inserts uniquely named cards and names them with undo and duplication while denying read-only edits', async () => {
    ;({ engine } = await setupEditor())
    await engine.scoreCards.insert()
    expect(engine.state.selection.kinds).toEqual(['score-card'])
    expect((engine.state.doc.pages[0].objects[0].scoreCard as { name: string }).name).toBe('Player 1')
    await engine.scoreCards.insert()
    expect((engine.state.doc.pages[0].objects[1].scoreCard as { name: string }).name).toBe('Player 2')
    expect(engine.scoreCards.rename(' ')).toBe(false)
    expect(engine.scoreCards.rename('Team A')).toBe(true)
    const spec = engine.state.doc.pages[0].objects[1].scoreCard
    expect(spec).toMatchObject({ name: 'Team A' })
    expect(engine.state.doc.scoreboard?.entries.map((entry) => entry.name)).toEqual(['Player 1', 'Team A'])
    await engine.undo()
    expect((engine.state.doc.pages[0].objects[1].scoreCard as { name: string }).name).toBe('Player 2')
    await engine.redo()
    await engine.arrange.duplicate()
    expect(engine.state.doc.pages[0].objects[2].scoreCard).toEqual(spec)
    engine.dispose()
    ;({ engine } = await setupEditor({ mode: 'shared-view' }))
    await engine.scoreCards.insert()
    expect(engine.state.doc.pages[0].objects).toHaveLength(0)
    expect(engine.scoreCards.rename('Team A')).toBe(false)
  })
})
