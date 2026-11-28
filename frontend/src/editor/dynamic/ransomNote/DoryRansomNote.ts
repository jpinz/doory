import { classRegistry, FabricObject, util } from 'fabric'
import { noteLayout, noteOptions, paperPath, readRansomNote, tileFont, type NoteLayout, type NoteTile, type RansomNoteSpec } from './model'

function drawPaper(ctx: CanvasRenderingContext2D, tile: NoteTile): void {
  ctx.beginPath()
  if (tile.radius) {
    const w = tile.width / 2, h = tile.height / 2, r = tile.radius
    ctx.moveTo(-w + r, -h)
    ctx.lineTo(w - r, -h)
    ctx.quadraticCurveTo(w, -h, w, -h + r)
    ctx.lineTo(w, h - r)
    ctx.quadraticCurveTo(w, h, w - r, h)
    ctx.lineTo(-w + r, h)
    ctx.quadraticCurveTo(-w, h, -w, h - r)
    ctx.lineTo(-w, -h + r)
    ctx.quadraticCurveTo(-w, -h, -w + r, -h)
  } else {
    tile.points.forEach((point, i) => {
      if (i === 0) ctx.moveTo(point.x, point.y)
      else ctx.lineTo(point.x, point.y)
    })
  }
  ctx.closePath()
}

export function noteSvgContent(spec: RansomNoteSpec, layout: NoteLayout): string {
  const options = noteOptions(spec)
  const strength = options.shadow / 100
  const filterId = `note-shadow-${options.shadow}-${options.letterSize}`
  const shadow = strength ? `<defs><filter id="${filterId}" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="${options.letterSize * 0.035 * strength}" stdDeviation="${options.letterSize * 0.035 * strength}" flood-opacity="${0.4 * strength}" /></filter></defs>` : ''
  return shadow + layout.tiles.map((tile) =>
    `<g transform="translate(${tile.x} ${tile.y}) rotate(${tile.angle})"><path d="${paperPath(tile)}" fill="${tile.paper}" stroke="#000000" stroke-opacity="0.08" stroke-width="0.7"${strength ? ` filter="url(#${filterId})"` : ''} /><text transform="scale(${tile.stretch} 1)" x="${tile.textX}" y="${tile.textY}" fill="${tile.ink}" font-family="${util.string.escapeXml(tile.font)}" font-size="${tile.size}" font-weight="${tile.weight}" font-style="${tile.italic ? 'italic' : 'normal'}">${util.string.escapeXml(tile.text)}</text></g>`,
  ).join('')
}

export function notePreviewSvg(spec: RansomNoteSpec): string {
  const layout = noteLayout(spec)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-layout.width / 2} ${-layout.height / 2} ${layout.width} ${layout.height}">${noteSvgContent(spec, layout)}</svg>`
}

export class DoryRansomNote extends FabricObject {
  static override type = 'DoryRansomNote'
  declare ransomNote: RansomNoteSpec
  private layoutKey = ''
  private cachedLayout: NoteLayout | null = null

  constructor(options: Record<string, unknown> = {}) {
    super()
    this.setOptions({ width: 200, height: 72, strokeWidth: 0, objectCaching: false, ...options })
  }

  private layout(spec: RansomNoteSpec): NoteLayout {
    const key = JSON.stringify(spec)
    if (key !== this.layoutKey || !this.cachedLayout) {
      this.cachedLayout = noteLayout(spec)
      this.layoutKey = key
    }
    return this.cachedLayout
  }

  override _render(ctx: CanvasRenderingContext2D): void {
    const spec = readRansomNote(this.ransomNote)
    if (!spec) return
    const layout = this.layout(spec)
    const options = noteOptions(spec)
    const strength = options.shadow / 100
    ctx.save()
    ctx.scale(this.width / layout.width, this.height / layout.height)
    for (const tile of layout.tiles) {
      ctx.save()
      ctx.translate(tile.x, tile.y)
      ctx.rotate(tile.angle * Math.PI / 180)
      ctx.fillStyle = tile.paper
      ctx.shadowColor = `rgba(0, 0, 0, ${0.4 * strength})`
      ctx.shadowBlur = options.letterSize * 0.07 * strength
      ctx.shadowOffsetY = options.letterSize * 0.035 * strength
      drawPaper(ctx, tile)
      ctx.fill()
      ctx.shadowColor = 'transparent'
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.08)'
      ctx.lineWidth = 0.7
      ctx.stroke()
      ctx.fillStyle = tile.ink
      ctx.font = tileFont(tile)
      ctx.textAlign = 'left'
      ctx.textBaseline = 'alphabetic'
      ctx.scale(tile.stretch, 1)
      ctx.fillText(tile.text, tile.textX, tile.textY)
      ctx.restore()
    }
    ctx.restore()
  }

  override _toSVG(): string[] {
    const spec = readRansomNote(this.ransomNote)
    if (!spec) return ['<g ', 'COMMON_PARTS', ' />']
    const layout = this.layout(spec)
    return ['<g ', 'COMMON_PARTS', `><g transform="scale(${this.width / layout.width} ${this.height / layout.height})">${noteSvgContent(spec, layout)}</g></g>`]
  }
}

classRegistry.setClass(DoryRansomNote)
