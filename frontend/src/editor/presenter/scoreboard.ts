import { uuid } from '@/lib/uuid'
import type { DocObject, DocScoreboard, DoryDocument } from '@/types/document'
import { MAX_SAVED_SCORE_CARDS, MAX_SCORE_ENTRIES, readSavedScoreboard, readScoreCard, SCORE_LIMIT, type ScoreCardSpec, scoreCardDocuments } from '../dynamic/scorecard/model'
import { jsonEqual } from '../engine/json'
import type { ScoreCardDisplay } from '../dynamic/scorecard/DoryScoreCard'
import { t } from '../strings'

export interface ScoreEntry {
  id: string
  name: string
  score: number
}

export interface ScoreCardState {
  pageId: string
  id: string
  label: string
  entryId: string
  visible: boolean
}

export interface Scoreboard {
  entries: ScoreEntry[]
  cards: ScoreCardState[]
}

export type ScoreCommand =
  | { action: 'score-set'; entryId: string; value: number }
  | { action: 'score-adjust'; entryId: string; value: number }
  | { action: 'score-card'; pageId: string; cardId: string; visible: boolean }

/** Cards whose names match apart from case and outer spaces share one player. */
export const playerKey = (name: string): string => name.trim().toLocaleLowerCase()

/**
 * The scoreboard a presentation starts with: one player for each name used on score cards, with the score saved with
 * the design (0 for a new name), and each card's saved show/hide state. A player no card names any more is dropped.
 */
export function initialScoreboard(doc: DoryDocument): Scoreboard {
  const saved = readSavedScoreboard(doc.scoreboard)
  const savedById = new Map((saved?.entries ?? []).map((entry) => [entry.id, entry]))
  const savedByName = new Map<string, ScoreEntry>()
  for (const entry of saved?.entries ?? []) if (!savedByName.has(playerKey(entry.name))) savedByName.set(playerKey(entry.name), entry)
  const changed = new Map((saved?.cards ?? []).map((card) => [`${card.pageId}:${card.id}`, card]))
  const found = doc.pages.flatMap((page) => scoreCardDocuments(page.objects).slice(0, MAX_SCORE_ENTRIES).map((object) => ({ page, object, spec: readScoreCard(object.scoreCard)! })))
  const named = new Set(found.map(({ spec }) => playerKey(spec.name)))
  const entries = new Map<string, ScoreEntry>()
  const usedIds = new Set<string>()
  const cards: ScoreCardState[] = []
  for (const { page, object, spec } of found) {
    const key = playerKey(spec.name)
    let entry = entries.get(key)
    if (!entry) {
      if (entries.size >= MAX_SCORE_ENTRIES) continue
      // A renamed card keeps its old player's score unless another card still uses the old name.
      const byId = savedById.get(spec.entryId)
      const from = savedByName.get(key) ?? (byId && !named.has(playerKey(byId.name)) ? byId : undefined)
      const id = from && !usedIds.has(from.id) ? from.id : usedIds.has(spec.entryId) ? uuid() : spec.entryId
      entry = { id, name: spec.name.trim(), score: from?.score ?? 0 }
      entries.set(key, entry)
      usedIds.add(id)
    }
    const label = (object.name || t.scoreboard.card).slice(0, 80)
    const change = changed.get(`${page.id}:${object.id}`)
    cards.push({ pageId: page.id, id: object.id, label, entryId: entry.id, visible: change ? change.visible : object.visible !== false })
  }
  return { entries: [...entries.values()], cards }
}

/** What is kept with the design: every player and score, and only the cards shown or hidden unlike in the editor. */
export function savedScoreboard(doc: DoryDocument, board: Scoreboard): DocScoreboard {
  const defaults = new Map<string, boolean>()
  for (const page of doc.pages) {
    for (const object of scoreCardDocuments(page.objects)) defaults.set(`${page.id}:${object.id}`, object.visible !== false)
  }
  const cards = board.cards
    .filter((card) => defaults.get(`${card.pageId}:${card.id}`) !== card.visible)
    .slice(0, MAX_SAVED_SCORE_CARDS)
    .map(({ pageId, id, entryId, visible }) => ({ pageId, id, entryId, visible }))
  return { entries: board.entries.map((entry) => ({ ...entry })), cards }
}

/** The design with each score card's player replaced by `change`; unchanged pages and objects keep their references. */
function withCardSpecs(doc: DoryDocument, change: (pageId: string, object: DocObject, spec: ScoreCardSpec) => ScoreCardSpec): DoryDocument {
  const update = (pageId: string, objects: DocObject[]): DocObject[] => {
    let changed = false
    const next = objects.map((object) => {
      const spec = object.type.toLowerCase() === 'doryscorecard' ? readScoreCard(object.scoreCard) : null
      let out = object
      if (spec) {
        const value = change(pageId, object, spec)
        if (!jsonEqual(value, spec)) out = { ...object, scoreCard: value }
      } else if (Array.isArray(object.objects)) {
        const children = update(pageId, object.objects as DocObject[])
        if (children !== object.objects) out = { ...object, objects: children }
      }
      if (out !== object) changed = true
      return out
    })
    return changed ? next : objects
  }
  let changed = false
  const pages = doc.pages.map((page) => {
    const objects = update(page.id, page.objects)
    if (objects === page.objects) return page
    changed = true
    return { ...page, objects }
  })
  return changed ? { ...doc, pages } : doc
}

const specOf = (entry: ScoreEntry): ScoreCardSpec => ({ entryId: entry.id, name: entry.name })

/** Gives cards that share a name the same player, then saves the scoreboard with the design. */
function withBoard(doc: DoryDocument, board: Scoreboard): DoryDocument {
  const entries = new Map(board.entries.map((entry) => [playerKey(entry.name), entry]))
  const next = withCardSpecs(doc, (_pageId, _object, spec) => {
    const entry = entries.get(playerKey(spec.name))
    return entry ? specOf(entry) : spec
  })
  return { ...next, scoreboard: savedScoreboard(next, board) }
}

/** The design after a score or a card's show/hide state is changed in the editor's Scoreboard tab. */
export function editScoreboard(doc: DoryDocument, command: ScoreCommand): DoryDocument {
  const board = initialScoreboard(doc)
  const next = updateScoreboard(board, command)
  return next === board ? doc : withBoard(doc, next)
}

/**
 * The design with one card given the player `name`, typed in the card's settings. A name another card uses joins
 * that player and its score; otherwise the card's player is renamed, keeping its score, or a new player starts at 0
 * when other cards still use the old name.
 */
export function nameScoreCard(doc: DoryDocument, pageId: string, cardId: string, name: string): DoryDocument {
  const trimmed = name.trim()
  if (!trimmed || trimmed.length > 80) return doc
  const board = initialScoreboard(doc)
  const card = board.cards.find((item) => item.pageId === pageId && item.id === cardId)
  if (!card) return doc
  const current = board.entries.find((entry) => entry.id === card.entryId)!
  if (current.name === trimmed) return doc
  const shared = board.entries.find((entry) => playerKey(entry.name) === playerKey(trimmed) && entry.id !== current.id)
  const alone = board.cards.every((item) => item === card || item.entryId !== current.id)
  const spec: ScoreCardSpec = shared ? specOf(shared) : { entryId: alone ? current.id : uuid(), name: trimmed }
  const recase = playerKey(trimmed) === playerKey(current.name)
  const named = withCardSpecs(doc, (page, object, value) => {
    if (page === pageId && object.id === cardId) return recase ? { entryId: current.id, name: trimmed } : spec
    return recase && playerKey(value.name) === playerKey(current.name) ? { entryId: current.id, name: trimmed } : value
  })
  const scores: DoryDocument = (alone || recase) && !shared ? { ...named, scoreboard: savedScoreboard(named, { ...board, entries: board.entries.map((entry) => entry.id === current.id ? { ...entry, name: trimmed } : entry) }) } : named
  return withBoard(scores, initialScoreboard(scores))
}

export function updateScoreboard(board: Scoreboard, command: ScoreCommand): Scoreboard {
  if (command.action === 'score-card') {
    const card = board.cards.find((item) => item.pageId === command.pageId && item.id === command.cardId)
    if (!card || card.visible === command.visible) return board
    return { ...board, cards: board.cards.map((item) => item === card ? { ...item, visible: command.visible } : item) }
  }
  const entry = board.entries.find((item) => item.id === command.entryId)
  if (!entry) return board
  const value = command.action === 'score-set' ? command.value : entry.score + command.value
  if (!Number.isInteger(value) || Math.abs(value) > SCORE_LIMIT || value === entry.score) return board
  return { ...board, entries: board.entries.map((item) => item.id === entry.id ? { ...item, score: value } : item) }
}

export function scoreDisplays(board: Scoreboard, pageId: string): ReadonlyMap<string, ScoreCardDisplay> {
  const entries = new Map(board.entries.map((entry) => [entry.id, entry]))
  return new Map(board.cards.filter((card) => card.pageId === pageId).map((card) => {
    const entry = entries.get(card.entryId)
    return [card.id, { name: entry?.name ?? '', score: entry?.score ?? 0, visible: card.visible && !!entry }]
  }))
}

/** The slides with their score cards as the scoreboard shows them: only the presentation draws this copy. */
export function scoreboardDocument(doc: DoryDocument, board: Scoreboard): DoryDocument {
  return {
    ...doc,
    pages: doc.pages.map((page) => {
      const displays = scoreDisplays(board, page.id)
      const update = (objects: DocObject[]): DocObject[] => objects.map((object) => {
        const display = displays.get(object.id)
        if (display && readScoreCard(object.scoreCard)) {
          return { ...object, visible: display.visible, scoreCardValue: display.score, scoreCard: { ...readScoreCard(object.scoreCard)!, name: display.name || t.scoreboard.player } }
        }
        return Array.isArray(object.objects) ? { ...object, objects: update(object.objects as DocObject[]) } : object
      })
      return displays.size ? { ...page, objects: update(page.objects) } : page
    }),
  }
}

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
const text = (value: unknown, max = 64): value is string => typeof value === 'string' && value.length > 0 && value.length <= max
const score = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && Math.abs(value) <= SCORE_LIMIT

export function parseScoreCommand(value: unknown): ScoreCommand | null {
  if (!record(value)) return null
  if (value.action === 'score-set' || value.action === 'score-adjust') {
    return text(value.entryId) && score(value.value) ? { action: value.action, entryId: value.entryId, value: value.value } : null
  }
  if (value.action === 'score-card') {
    return text(value.pageId) && text(value.cardId) && typeof value.visible === 'boolean'
      ? { action: value.action, pageId: value.pageId, cardId: value.cardId, visible: value.visible } : null
  }
  return null
}

export function parseScoreboard(value: unknown): Scoreboard | null {
  if (!record(value) || !Array.isArray(value.entries) || !Array.isArray(value.cards)) return null
  if (value.entries.length > MAX_SCORE_ENTRIES || value.cards.length > MAX_SCORE_ENTRIES * 100) return null
  const entries: ScoreEntry[] = []
  for (const entry of value.entries) {
    if (!record(entry) || !text(entry.id) || !text(entry.name, 80) || !entry.name.trim() || !score(entry.score)) return null
    entries.push({ id: entry.id, name: entry.name, score: entry.score })
  }
  if (new Set(entries.map((entry) => entry.id)).size !== entries.length) return null
  const cards: ScoreCardState[] = []
  for (const card of value.cards) {
    if (!record(card) || !text(card.pageId) || !text(card.id) || !text(card.label, 80) || typeof card.visible !== 'boolean') return null
    if (!text(card.entryId) || !entries.some((entry) => entry.id === card.entryId)) return null
    cards.push({ pageId: card.pageId, id: card.id, label: card.label, entryId: card.entryId, visible: card.visible })
  }
  if (new Set(cards.map((card) => `${card.pageId}:${card.id}`)).size !== cards.length) return null
  return { entries, cards }
}
