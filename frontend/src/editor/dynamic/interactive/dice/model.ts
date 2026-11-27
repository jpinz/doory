import type { DocObject } from '@/types/document'
import { findInteractiveDocuments } from '../model'

export const DIE_SIDES = [4, 6, 8, 10, 12, 20, 100] as const
export const MAX_DIE_FACES = 20
export const DIE_COLORS = ['#6a52d9', '#ec5f98', '#258379', '#e7ac32', '#3569b5', '#be5b35']

export interface DieFace {
  text: string
  color: string
}

export type DieSpec =
  | { kind: 'number'; sides: number; pips?: true; color?: string }
  | { kind: 'symbol'; faces: DieFace[] }

const C = 0, L = -48, R = 48
// Standard D6 layouts, as [x, y] positions in the die's 200-unit box.
export const PIP_LAYOUTS: readonly (readonly [number, number][])[] = [
  [[C, C]],
  [[L, L], [R, R]],
  [[L, L], [C, C], [R, R]],
  [[L, L], [R, L], [L, R], [R, R]],
  [[L, L], [R, L], [C, C], [L, R], [R, R]],
  [[L, L], [R, L], [L, C], [R, C], [L, R], [R, R]],
]

const HEX = /^#[\da-f]{6}$/i
export const NUMBER_DIE_COLOR = '#ffffff'

export function defaultDie(): DieSpec {
  return { kind: 'number', sides: 6 }
}

export function defaultFaces(): DieFace[] {
  return DIE_COLORS.map((color, i) => ({ text: ['●', '■', '▲', '★', '♥', '◆'][i], color }))
}

export function readDie(value: unknown): DieSpec | null {
  if (!value || typeof value !== 'object') return null
  const die = value as Record<string, unknown>
  if (die.kind === 'number' && typeof die.sides === 'number' && DIE_SIDES.some((sides) => sides === die.sides)) {
    const spec: DieSpec = { kind: 'number', sides: die.sides }
    if (die.pips === true && die.sides === 6) spec.pips = true
    if (typeof die.color === 'string' && HEX.test(die.color)) spec.color = die.color
    return spec
  }
  if (die.kind !== 'symbol' || !Array.isArray(die.faces) || die.faces.length < 2 || die.faces.length > MAX_DIE_FACES) return null
  const faces: DieFace[] = []
  for (const face of die.faces) {
    if (!face || typeof face !== 'object' || typeof face.text !== 'string' || face.text.length > 12) return null
    if (typeof face.color !== 'string' || !HEX.test(face.color)) return null
    faces.push({ text: face.text, color: face.color })
  }
  return { kind: 'symbol', faces }
}

export function dieDocuments(objects: readonly DocObject[]): DocObject[] {
  return findInteractiveDocuments(objects, (object) => object.type.toLowerCase() === 'dorydie' && readDie(object.die) !== null)
}

export function dieFaceCount(spec: DieSpec): number {
  return spec.kind === 'number' ? spec.sides : spec.faces.length
}

export function randomFace(count: number): number {
  const limit = Math.floor(0x100000000 / count) * count
  const value = new Uint32Array(1)
  do crypto.getRandomValues(value)
  while (value[0] >= limit)
  return value[0] % count
}
