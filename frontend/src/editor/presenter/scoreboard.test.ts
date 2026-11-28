import { describe, expect, it, vi } from 'vitest'
import { createBlankDocument } from '@/lib/document'
import { initialScoreboard, nameScoreCard, parseScoreboard, savedScoreboard, scoreboardDocument, updateScoreboard } from './scoreboard'
import { migrateDocument } from '../engine/migrations'
import { parseMessage } from './channel'
import { SCORE_LIMIT } from '../dynamic/scorecard/model'

function setup() {
  const doc = createBlankDocument(400, 300)
  doc.pages[0].objects = [
    { id: 'c1', type: 'doryscorecard', scoreCard: { entryId: 'team', name: 'Team' } },
    { id: 'c2', type: 'doryscorecard', scoreCard: { entryId: 'team', name: 'Team' }, visible: false },
  ]
  const board = initialScoreboard(doc)
  return { doc, board }
}

describe('presentation scoreboard', () => {
  it('gives a card split from a shared player a new id on a plain-http address, where crypto.randomUUID is missing', () => {
    const { doc } = setup()
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) })
    try {
      const next = nameScoreCard(doc, doc.pages[0].id, 'c2', 'Team B')
      expect(next.pages[0].objects[1].scoreCard).toMatchObject({ name: 'Team B', entryId: expect.stringMatching(/^[0-9a-f-]{36}$/) })
      expect(initialScoreboard(next).entries.map(({ name, score }) => ({ name, score }))).toEqual([{ name: 'Team', score: 0 }, { name: 'Team B', score: 0 }])
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('shares scores across cards and draws them only on preview copies', () => {
    const { doc, board } = setup()
    expect(board.entries).toHaveLength(1)
    let next = updateScoreboard(board, { action: 'score-adjust', entryId: 'team', value: 1 })
    next = updateScoreboard(next, { action: 'score-set', entryId: 'team', value: -12 })
    const preview = scoreboardDocument(doc, next)
    expect(preview.pages[0].objects[0].scoreCardValue).toBe(-12)
    expect(preview.pages[0].objects[1].visible).toBe(false)
    expect(doc.pages[0].objects[0].scoreCardValue).toBeUndefined()
    expect(initialScoreboard(doc).entries[0].score).toBe(0)
    expect(updateScoreboard(next, { action: 'score-set', entryId: 'team', value: SCORE_LIMIT + 1 })).toBe(next)
    expect(updateScoreboard(next, { action: 'score-set', entryId: 'team', value: 0.5 })).toBe(next)
  })

  it('starts the next presentation from the saved scores and card show/hide states, through a reload', () => {
    const { doc, board } = setup()
    let next = updateScoreboard(board, { action: 'score-set', entryId: 'team', value: 7 })
    next = updateScoreboard(next, { action: 'score-card', pageId: doc.pages[0].id, cardId: 'c1', visible: false })
    expect(updateScoreboard(next, { action: 'score-card', pageId: doc.pages[0].id, cardId: 'c1', visible: false })).toBe(next)
    const saved = savedScoreboard(doc, next)
    expect(saved).toEqual({ entries: [{ id: 'team', name: 'Team', score: 7 }], cards: [{ pageId: doc.pages[0].id, id: 'c1', entryId: 'team', visible: false }] })
    const reloaded = migrateDocument(JSON.parse(JSON.stringify({ ...doc, scoreboard: saved })))
    expect(initialScoreboard(reloaded)).toEqual(next)
    expect(migrateDocument({ ...doc, scoreboard: { entries: [{ id: 'x', name: 'X', score: 0.5 }], cards: 'bad' } }).scoreboard).toEqual({ entries: [], cards: [] })
  })

  it('names players on cards: same names share a score, a lone card keeps its score when renamed, unused players drop', () => {
    const doc = createBlankDocument(400, 300)
    const pageId = doc.pages[0].id
    doc.pages[0].objects = [
      { id: 'c1', type: 'doryscorecard', scoreCard: { entryId: 'a', name: 'Reds' } },
      { id: 'c2', type: 'doryscorecard', scoreCard: { entryId: 'b', name: ' reds ' } },
      { id: 'c3', type: 'doryscorecard', scoreCard: { entryId: 'c', name: 'Blues' } },
    ]
    doc.scoreboard = { entries: [{ id: 'a', name: 'Reds', score: 4 }, { id: 'c', name: 'Blues', score: 2 }, { id: 'gone', name: 'Gone', score: 9 }], cards: [] }
    const scores = (value: typeof doc) => initialScoreboard(value).entries.map(({ name, score }) => [name, score])
    expect(scores(doc)).toEqual([['Reds', 4], ['Blues', 2]])
    expect(initialScoreboard(doc).cards.map((card) => card.entryId)).toEqual(['a', 'a', 'c'])

    const renamed = nameScoreCard(doc, pageId, 'c3', 'Greens')
    expect(scores(renamed)).toEqual([['Reds', 4], ['Greens', 2]])
    expect(renamed.pages[0].objects[2].scoreCard).toEqual({ entryId: 'c', name: 'Greens' })

    const joined = nameScoreCard(renamed, pageId, 'c3', 'REDS')
    expect(joined.pages[0].objects.map((object) => object.scoreCard)).toEqual([0, 1, 2].map(() => ({ entryId: 'a', name: 'Reds' })))
    expect(joined.scoreboard?.entries).toEqual([{ id: 'a', name: 'Reds', score: 4 }])

    const recased = nameScoreCard(joined, pageId, 'c1', 'REDS')
    expect(scores(recased)).toEqual([['REDS', 4]])
    expect(nameScoreCard(recased, pageId, 'c1', '  ')).toBe(recased)
    expect(nameScoreCard(recased, pageId, 'missing', 'X')).toBe(recased)
  })

  it('checks channel scores, card references, duplicates and message ownership', () => {
    const { board } = setup()
    expect(parseScoreboard(board)).toEqual(board)
    expect(parseScoreboard({ ...board, entries: [...board.entries, board.entries[0]] })).toBeNull()
    expect(parseScoreboard({ ...board, cards: [{ ...board.cards[0], entryId: 'missing' }] })).toBeNull()
    expect(parseMessage({ v: 1, from: 'view', kind: 'scoreboard', scoreboard: board }, 'show')).toBeNull()
    expect(parseMessage({ v: 1, from: 'show', kind: 'scoreboard', scoreboard: board }, 'view')).toMatchObject({ scoreboard: board })
    for (const value of [Number.NaN, Infinity, 0.5, SCORE_LIMIT + 1]) {
      expect(parseMessage({ v: 1, from: 'view', kind: 'command', command: { action: 'score-set', entryId: 'team', value } }, 'show')).toBeNull()
    }
    expect(parseMessage({ v: 1, from: 'view', kind: 'command', command: { action: 'score-set', entryId: 'team', value: -4 } }, 'show')).toMatchObject({ command: { value: -4 } })
  })
})
