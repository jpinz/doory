import { t } from '../../../strings'
import type { DocObject } from '@/types/document'
import { newId } from '@/lib/document'
import { findInteractiveDocuments } from '../model'

export interface WheelSlice {
  id: string
  text: string
  color: string
  percentage: number
}

export interface WheelSpec {
  slices: WheelSlice[]
}

export const MAX_WHEEL_SLICES = 48
export const WHEEL_COLORS = ['#6a52d9', '#ec5f98', '#258379', '#e7ac32']
export const WHEEL_SIZE = 400
export const WHEEL_RADIUS = 184

export function wheelDocuments(objects: readonly DocObject[]): DocObject[] {
  return findInteractiveDocuments(objects, (object) => object.type.toLowerCase() === 'dorywheel' && readWheel(object.wheel) !== null)
}

export function defaultWheel(): WheelSpec {
  return {
    slices: WHEEL_COLORS.map((color, i) => ({ id: newId(), text: `${t.wheel.slice} ${i + 1}`, color, percentage: 25 })),
  }
}

export function wheelTotal(slices: readonly WheelSlice[]): number {
  return slices.reduce((sum, slice) => sum + slice.percentage, 0)
}

export function readWheel(value: unknown): WheelSpec | null {
  if (!value || typeof value !== 'object') return null
  const slices = (value as WheelSpec).slices
  if (!Array.isArray(slices) || slices.length < 2 || slices.length > MAX_WHEEL_SLICES) return null
  const ids = new Set<string>()
  for (const slice of slices) {
    if (!slice || typeof slice !== 'object' || typeof slice.id !== 'string' || !slice.id || ids.has(slice.id)) return null
    if (typeof slice.text !== 'string' || !slice.text.trim() || slice.text.length > 120) return null
    if (typeof slice.color !== 'string' || !/^#[\da-f]{6}$/i.test(slice.color)) return null
    if (typeof slice.percentage !== 'number' || !Number.isFinite(slice.percentage) || slice.percentage < 0 || slice.percentage > 100) return null
    ids.add(slice.id)
  }
  if (Math.abs(wheelTotal(slices) - 100) > 0.000001) return null
  return { slices: slices.map((slice) => ({ id: slice.id, text: slice.text, color: slice.color, percentage: slice.percentage })) }
}

export function equalizeSlices(slices: readonly WheelSlice[]): WheelSlice[] {
  const percentage = Math.floor(10000 / slices.length) / 100
  return slices.map((slice, i) => ({ ...slice, percentage: i === slices.length - 1 ? Math.round((100 - percentage * i) * 100) / 100 : percentage }))
}

/** One uniform draw determines both the winning slice and the resting angle beneath the fixed pointer. */
export function wheelOutcome(spec: WheelSpec, random: number): { slice: WheelSlice; rotation: number } {
  const position = Math.max(0, Math.min(1 - Number.EPSILON, random)) * 100
  let start = 0
  for (const slice of spec.slices) {
    const end = start + slice.percentage
    if (slice.percentage > 0 && position < end) {
      // Land away from a boundary without changing which weighted interval won.
      const inside = Math.max(slice.percentage * 0.02, Math.min(slice.percentage * 0.98, position - start))
      return { slice, rotation: (360 - (start + inside) * 3.6) % 360 }
    }
    start = end
  }
  const slice = [...spec.slices].reverse().find((entry) => entry.percentage > 0)!
  return { slice, rotation: (360 - (100 - slice.percentage / 2) * 3.6) % 360 }
}

export function wheelRandom(): number {
  const value = new Uint32Array(1)
  crypto.getRandomValues(value)
  return value[0] / 0x100000000
}

export function sliceGeometry(start: number, percentage: number): { path: string; angle: number } {
  const a = (start * 3.6 - 90) * Math.PI / 180
  const b = ((start + percentage) * 3.6 - 90) * Math.PI / 180
  const point = (angle: number): string => `${Math.cos(angle) * WHEEL_RADIUS} ${Math.sin(angle) * WHEEL_RADIUS}`
  const path = percentage >= 100
    ? `M 0 -${WHEEL_RADIUS} A ${WHEEL_RADIUS} ${WHEEL_RADIUS} 0 1 1 0 ${WHEEL_RADIUS} A ${WHEEL_RADIUS} ${WHEEL_RADIUS} 0 1 1 0 -${WHEEL_RADIUS} Z`
    : `M 0 0 L ${point(a)} A ${WHEEL_RADIUS} ${WHEEL_RADIUS} 0 ${percentage > 50 ? 1 : 0} 1 ${point(b)} Z`
  return { path, angle: (start + percentage / 2) * 3.6 - 90 }
}
