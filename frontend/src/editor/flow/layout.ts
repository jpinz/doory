/**
 * Where slides sit on the flow board and how its arrows are drawn. Shared by the editor's Flow tab and the presenter
 * view's flow map, which holds no document and gets these positions over the presenter channel.
 */
import type { DocPage, DoryDocument } from '@/types/document'
import { readSections, sectionGroups } from '../engine/sections'

export const CARD_WIDTH = 220
export const CARD_HEIGHT = 200
/** The card's thumbnail box (border + padding + title row + gap), fixed in CSS so arrows can start at an element. */
export const THUMB = { x: 12, y: 44, width: 196, height: 108 }
/** Height of a section row: lanes, and the default layout of grouped decks. */
export const LANE = 300
export const CARD_TOP = 60
export const STEP = 320

export type Position = { x: number; y: number }
export type Slot = { group: number; offset: number }
type Size = { width: number; height: number }

export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value))

export function bounded(position: Position): Position {
  return { x: clamp(position.x, 0, 10_000), y: clamp(position.y, 0, 10_000) }
}

/** A card's saved spot, else one row per section run (`slot`), else a four-column grid. */
export function positionOf(page: DocPage, index: number, slot?: Slot): Position {
  const position = page.flowPosition
  if (position && Number.isFinite(position.x) && Number.isFinite(position.y)) return bounded(position)
  if (slot) return { x: 60 + slot.offset * STEP, y: CARD_TOP + slot.group * LANE }
  return { x: 60 + (index % 4) * STEP, y: 80 + Math.floor(index / 4) * LANE }
}

/** Each slide's place in the runs of `sectionGroups`. */
export function slotsOf(doc: DoryDocument): Map<string, Slot> {
  const slots = new Map<string, Slot>()
  sectionGroups(doc).forEach((group, groupIndex) => group.pages.forEach((page, offset) => slots.set(page.id, { group: groupIndex, offset })))
  return slots
}

/** Every card's position in the free (frames) arrangement. */
export function framePositions(doc: DoryDocument): Position[] {
  const grouped = readSections(doc).length > 0
  const slots = slotsOf(doc)
  return doc.pages.map((page, index) => positionOf(page, index, grouped ? slots.get(page.id) ?? { group: 0, offset: index } : undefined))
}

/** The board point of `fraction` (0–1 of the page's width and height) on the thumbnail of a card at `card`. */
export function thumbPoint(card: Position, size: Size, fraction: Position): Position {
  const scale = Math.min(THUMB.width / size.width, THUMB.height / size.height)
  return {
    x: card.x + THUMB.x + (THUMB.width - size.width * scale) / 2 + clamp(fraction.x, 0, 1) * size.width * scale,
    y: card.y + THUMB.y + (THUMB.height - size.height * scale) / 2 + clamp(fraction.y, 0, 1) * size.height * scale,
  }
}

export function edgePath(source: Position, target: Position, from?: Position): string {
  const sx = from?.x ?? source.x + CARD_WIDTH
  const sy = from?.y ?? source.y + CARD_HEIGHT / 2
  const tx = target.x
  const ty = target.y + CARD_HEIGHT / 2
  const bend = Math.max(70, Math.abs(tx - sx) / 2)
  return `M ${sx} ${sy} C ${sx + bend} ${sy}, ${tx - bend} ${ty}, ${tx} ${ty}`
}
