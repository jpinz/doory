import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it } from 'vitest'
import { setupEditor } from '../../animation/testing'
import { EditorProvider } from '../../EditorProvider'
import type { EditorEngine } from '../../engine/editor'
import { t } from '../../strings'
import { ScoreCardSection } from './ScoreCardSection'

let engine: EditorEngine | null = null
afterEach(() => { cleanup(); engine?.dispose(); engine = null })

it('names the card’s player, joining the score of cards with the same name', async () => {
  const card = { type: 'doryscorecard', width: 160, height: 90, left: 100, top: 100 }
  ;({ engine } = await setupEditor({ objects: [{ ...card, id: 'c1', scoreCard: { entryId: 'team', name: 'Team' } }, { ...card, id: 'c2', scoreCard: { entryId: 'reds', name: 'Reds' } }] }))
  engine.scoreCards.edit({ action: 'score-set', entryId: 'reds', value: 9 })
  engine.select(['c1'])
  const user = userEvent.setup()
  render(<EditorProvider engine={engine} portalRoot={document.body}><ScoreCardSection /></EditorProvider>)
  await user.click(screen.getByRole('button', { name: t.scoreboard.editCard }))
  const input = screen.getByRole('combobox', { name: t.scoreboard.name })
  await user.clear(input)
  await user.type(input, 'reds{Enter}')
  expect(engine.state.doc.pages[0].objects[0].scoreCard).toEqual({ entryId: 'reds', name: 'Reds' })
  expect(engine.state.doc.scoreboard!.entries).toEqual([{ id: 'reds', name: 'Reds', score: 9 }])
  expect(engine.scoreCards.display(engine.state.activePageId, 'c1')).toEqual({ name: 'Reds', score: 9 })
  const svg = await engine.whenView(engine.state.activePageId).then((view) => view.canvas.getObjects()[0].toSVG())
  expect(svg).toContain('>Reds</text>')
  expect(svg).toContain('>9</text>')
})

it('hides the name on a card set to score only, and undo shows it again', async () => {
  const card = { type: 'doryscorecard', width: 160, height: 90, left: 100, top: 100 }
  ;({ engine } = await setupEditor({ objects: [{ ...card, id: 'c1', scoreCard: { entryId: 'team', name: 'Team' } }] }))
  engine.scoreCards.edit({ action: 'score-set', entryId: 'team', value: 4 })
  engine.select(['c1'])
  const user = userEvent.setup()
  render(<EditorProvider engine={engine} portalRoot={document.body}><ScoreCardSection /></EditorProvider>)
  await user.click(screen.getByRole('button', { name: t.scoreboard.editCard }))
  await user.click(screen.getByRole('switch', { name: t.scoreboard.scoreOnly }))
  expect(engine.state.doc.pages[0].objects[0].scoreOnly).toBe(true)
  const svg = async () => engine!.whenView(engine!.state.activePageId).then((view) => view.canvas.getObjects()[0].toSVG())
  expect(await svg()).not.toContain('>Team</text>')
  expect(await svg()).toContain('>4</text>')
  await engine.undo()
  expect(engine.state.doc.pages[0].objects[0].scoreOnly).toBeUndefined()
  expect(await svg()).toContain('>Team</text>')
})

it('sets a card’s colors and puts the name below the score, saved with the card', async () => {
  const card = { type: 'doryscorecard', width: 160, height: 90, left: 100, top: 100 }
  ;({ engine } = await setupEditor({ objects: [{ ...card, id: 'c1', scoreCard: { entryId: 'team', name: 'Team' } }] }))
  engine.select(['c1'])
  const user = userEvent.setup()
  render(<EditorProvider engine={engine} portalRoot={document.body}><ScoreCardSection /></EditorProvider>)
  await user.click(screen.getByRole('button', { name: t.scoreboard.editCard }))
  await user.selectOptions(screen.getByRole('combobox', { name: t.scoreboard.namePosition }), 'below')
  expect(engine.scoreCards.setStyle({ scoreBackground: '#112233' })).toBe(true)
  expect(engine.scoreCards.setStyle({ scoreColor: '"><x' })).toBe(true)
  expect(engine.state.doc.pages[0].objects[0]).toMatchObject({ scoreNamePosition: 'below', scoreBackground: '#112233', scoreColor: '"><x' })
  const svg = await engine.whenView(engine.state.activePageId).then((view) => view.canvas.getObjects()[0].toSVG())
  expect(svg).toContain('fill="#112233"')
  expect(svg).toContain('fill="&quot;&gt;&lt;x"')
  expect(svg).toMatch(/y="-16"[^>]*>0<\/text>/)
  expect(svg).toMatch(/y="56"[^>]*>Team<\/text>/)
  await user.selectOptions(screen.getByRole('combobox', { name: t.scoreboard.namePosition }), 'above')
  expect(engine.state.doc.pages[0].objects[0].scoreNamePosition).toBeUndefined()
})
