import { classRegistry, FabricObject, util } from 'fabric'
import { t } from '../../../strings'
import { interactiveTextColor } from '../color'
import { dieFaceCount, NUMBER_DIE_COLOR, PIP_LAYOUTS, randomFace, readDie, type DieSpec } from './model'

const SIZE = 200
const PIP_RADIUS = 17
const DIE_PATH = 'M -80 -92 L 80 -92 Q 92 -92 92 -80 L 92 80 Q 92 92 80 92 L -80 92 Q -92 92 -92 80 L -92 -80 Q -92 -92 -80 -92 Z'

export class DoryDie extends FabricObject {
  static override type = 'DoryDie'
  declare die: DieSpec
  private face = 0
  private raf = 0
  private rolling = false
  private versionValue = 0

  constructor(options: Record<string, unknown> = {}) {
    super()
    this.setOptions({ width: SIZE, height: SIZE, strokeWidth: 0, objectCaching: false, ...options })
  }

  get rollVersion(): number { return this.versionValue }
  get isRolling(): boolean { return this.rolling }

  /** `value` is the number rolled on a numbered die. */
  roll(reduced: boolean, done: (text: string, value?: number) => void): boolean {
    const spec = readDie(this.die)
    if (!spec || this.rolling) return false
    const count = dieFaceCount(spec)
    const outcome = randomFace(count)
    this.rolling = true
    const paint = (face: number): void => {
      this.face = face
      this.versionValue++
      this.set('dirty', true)
      this.canvas?.requestRenderAll()
    }
    const finish = (): void => {
      paint(outcome)
      this.rolling = false
      this.raf = 0
      if (spec.kind === 'number') done(String(outcome + 1), outcome + 1)
      else done(spec.faces[outcome].text.trim() || `${t.dice.face} ${outcome + 1}`)
    }
    if (reduced) finish()
    else {
      const began = performance.now()
      const tick = (now: number): void => {
        const elapsed = now - began
        if (elapsed >= 800) finish()
        else {
          paint(Math.floor(elapsed / 80) % count)
          this.raf = requestAnimationFrame(tick)
        }
      }
      this.raf = requestAnimationFrame(tick)
    }
    return true
  }

  resetRoll(): void {
    cancelAnimationFrame(this.raf)
    this.raf = 0
    this.rolling = false
    this.face = 0
    this.versionValue++
    this.set('dirty', true)
    this.canvas?.requestRenderAll()
  }

  private appearance(index: number): { text: string; color: string; pips?: readonly [number, number][] } | null {
    const spec = readDie(this.die)
    if (!spec) return null
    if (spec.kind === 'number') {
      const value = index % spec.sides
      return { text: String(value + 1), color: spec.color ?? NUMBER_DIE_COLOR, pips: spec.pips ? PIP_LAYOUTS[value] : undefined }
    }
    return spec.faces[index % spec.faces.length]
  }

  override _render(ctx: CanvasRenderingContext2D): void {
    const face = this.appearance(this.face)
    if (!face) return
    ctx.save()
    ctx.scale(this.width / SIZE, this.height / SIZE)
    ctx.beginPath()
    ctx.moveTo(-80, -92)
    ctx.lineTo(80, -92)
    ctx.quadraticCurveTo(92, -92, 92, -80)
    ctx.lineTo(92, 80)
    ctx.quadraticCurveTo(92, 92, 80, 92)
    ctx.lineTo(-80, 92)
    ctx.quadraticCurveTo(-92, 92, -92, 80)
    ctx.lineTo(-92, -80)
    ctx.quadraticCurveTo(-92, -92, -80, -92)
    ctx.closePath()
    ctx.fillStyle = face.color
    ctx.fill()
    ctx.lineWidth = 5
    ctx.strokeStyle = '#2b1c17'
    ctx.stroke()
    ctx.fillStyle = interactiveTextColor(face.color)
    if (face.pips) {
      for (const [x, y] of face.pips) {
        ctx.beginPath()
        ctx.arc(x, y, PIP_RADIUS, 0, Math.PI * 2)
        ctx.fill()
      }
    } else {
      ctx.font = '600 80px sans-serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(face.text, 0, 0, 145)
    }
    ctx.restore()
  }

  override _toSVG(): string[] {
    const face = this.appearance(0)
    if (!face) return ['<g ', 'COMMON_PARTS', ' />']
    const ink = interactiveTextColor(face.color)
    let content: string
    if (face.pips) content = face.pips.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${PIP_RADIUS}" fill="${ink}" />`).join('')
    else {
      const text = util.string.escapeXml(face.text)
      const fit = [...face.text].length > 3 ? ' textLength="145" lengthAdjust="spacingAndGlyphs"' : ''
      content = `<text x="0" y="0" text-anchor="middle" dominant-baseline="central" fill="${ink}" font-family="sans-serif" font-size="80" font-weight="600"${fit}>${text}</text>`
    }
    return ['<g ', 'COMMON_PARTS', `><g transform="scale(${this.width / SIZE} ${this.height / SIZE})"><path d="${DIE_PATH}" fill="${face.color}" stroke="#2b1c17" stroke-width="5" />${content}</g></g>`]
  }

  override dispose(): void {
    cancelAnimationFrame(this.raf)
    super.dispose()
  }
}

classRegistry.setClass(DoryDie)
