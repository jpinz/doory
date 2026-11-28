import type { DocObject, DocScoreboard } from '@/types/document'

export interface ScoreCardSpec {
  entryId: string
  name: string
}

export const SCORE_LIMIT = 1_000_000
export const MAX_SCORE_ENTRIES = 100
export const MAX_SAVED_SCORE_CARDS = 1_000

export function readScoreCard(value: unknown): ScoreCardSpec | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const spec = value as Record<string, unknown>
  if (typeof spec.entryId !== 'string' || !spec.entryId || spec.entryId.length > 64) return null
  if (typeof spec.name !== 'string' || !spec.name.trim() || spec.name.length > 80) return null
  return { entryId: spec.entryId, name: spec.name.trim() }
}

export function scoreCardDocuments(objects: readonly DocObject[]): DocObject[] {
  return objects.flatMap((object) => {
    if (object.type.toLowerCase() === 'doryscorecard' && readScoreCard(object.scoreCard)) return [object]
    return Array.isArray(object.objects) ? scoreCardDocuments(object.objects as DocObject[]) : []
  })
}

const isText = (value: unknown, max: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= max

/** The usable part of a saved scoreboard: bad, repeated and surplus entries and cards are left out. */
export function readSavedScoreboard(value: unknown): DocScoreboard | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  const entries: DocScoreboard['entries'] = []
  const ids = new Set<string>()
  for (const item of Array.isArray(raw.entries) ? raw.entries : []) {
    if (entries.length >= MAX_SCORE_ENTRIES) break
    if (!item || typeof item !== 'object') continue
    const { id, name, score } = item as Record<string, unknown>
    if (!isText(id, 64) || ids.has(id) || typeof name !== 'string' || !name.trim() || name.length > 80) continue
    if (typeof score !== 'number' || !Number.isInteger(score) || Math.abs(score) > SCORE_LIMIT) continue
    ids.add(id)
    entries.push({ id, name: name.trim(), score })
  }
  const cards: DocScoreboard['cards'] = []
  const keys = new Set<string>()
  for (const item of Array.isArray(raw.cards) ? raw.cards : []) {
    if (cards.length >= MAX_SAVED_SCORE_CARDS) break
    if (!item || typeof item !== 'object') continue
    const { pageId, id, entryId, visible } = item as Record<string, unknown>
    if (!isText(pageId, 64) || !isText(id, 64) || keys.has(`${pageId}:${id}`) || typeof visible !== 'boolean') continue
    if (entryId !== null && !isText(entryId, 64)) continue
    keys.add(`${pageId}:${id}`)
    cards.push({ pageId, id, entryId, visible })
  }
  return { entries, cards }
}

