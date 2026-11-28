/**
 * Page background → Fabric. Solid and gradient backgrounds are a non-interactive rect covering the page;
 * pattern backgrounds are a bitmap drawn by `drawPattern`; image backgrounds are a (cover/contain/tile) image over a
 * white base. All of them go into
 * `canvas.backgroundImage`, which renders through the viewport transform so it follows zoom and the live
 * canvas window (plain `backgroundColor` would fill the whole canvas element).
 */
import { FabricImage, type FabricObject, Pattern, Rect, type StaticCanvas } from 'fabric'
import type { PageBackground } from '@/types/document'
import { type FillSpec, buildFill } from './fills'
import { drawPattern, readPattern } from './patterns'

/** A pattern is drawn at twice the page's resolution (sharp in 2× exports), unless that bitmap would be too large. */
const PATTERN_RESOLUTION = 2
const MAX_PATTERN_PIXELS = 16_000_000

const flat = {
  originX: 'left' as const,
  originY: 'top' as const,
  left: 0,
  top: 0,
  selectable: false,
  evented: false,
  objectCaching: false,
}

export function backgroundToFill(bg: PageBackground): FillSpec {
  if (bg.type === 'gradient') return { type: 'gradient', kind: bg.kind, angle: bg.angle ?? 90, stops: bg.stops }
  if (bg.type === 'solid') return { type: 'solid', color: bg.color }
  return { type: 'solid', color: '#ffffff' }
}

export interface BuiltBackground {
  object: FabricObject
  /** Base colour drawn behind the object (image backgrounds sit on white). */
  color: string
}

/**
 * `width` × `height` is the box the background covers; `bleed` is how far that box reaches past the page on every
 * side (so that a pattern keeps its place relative to the page).
 */
export async function buildBackground(
  bg: PageBackground,
  width: number,
  height: number,
  resolveSrc: (src: string) => Promise<string>,
  bleed = 0,
): Promise<BuiltBackground> {
  if (bg.type === 'pattern') {
    const res = Math.min(PATTERN_RESOLUTION, Math.sqrt(MAX_PATTERN_PIXELS / Math.max(1, width * height)))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.ceil(width * res))
    canvas.height = Math.max(1, Math.ceil(height * res))
    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.scale(canvas.width / width, canvas.height / height)
      ctx.translate(bleed, bleed)
      drawPattern(ctx, readPattern(bg), { width: width - 2 * bleed, height: height - 2 * bleed }, { x: -bleed, y: -bleed, w: width, h: height })
    }
    const object = new FabricImage(canvas, { ...flat, scaleX: width / canvas.width, scaleY: height / canvas.height })
    return { object, color: '' }
  }
  if (bg.type !== 'image') {
    return { object: new Rect({ ...flat, width, height, fill: buildFill(backgroundToFill(bg)) }), color: '' }
  }
  const img = await FabricImage.fromURL(await resolveSrc(bg.src), { crossOrigin: 'anonymous' })
  const opacity = bg.opacity ?? 1
  if (bg.fit === 'tile') {
    const pattern = new Pattern({ source: img.getElement() as CanvasImageSource, repeat: 'repeat' })
    return { object: new Rect({ ...flat, width, height, fill: pattern, opacity }), color: '#ffffff' }
  }
  const iw = img.width || 1
  const ih = img.height || 1
  const base = bg.fit === 'cover' ? Math.max(width / iw, height / ih) : Math.min(width / iw, height / ih)
  const scale = base * (bg.scale ?? 1)
  img.set({
    ...flat,
    opacity,
    scaleX: scale,
    scaleY: scale,
    left: (width - iw * scale) / 2 + (bg.offsetX ?? 0),
    top: (height - ih * scale) / 2 + (bg.offsetY ?? 0),
  })
  return { object: img, color: '#ffffff' }
}

/** Installs a built background and the page-sized clip on a canvas (live or static). */
export function installBackground(canvas: StaticCanvas, built: BuiltBackground | null, width: number, height: number): void {
  canvas.backgroundColor = built?.color ?? ''
  canvas.backgroundImage = built?.object
  canvas.clipPath = new Rect({ originX: 'left', originY: 'top', left: 0, top: 0, width, height, absolutePositioned: true, excludeFromExport: true })
}
