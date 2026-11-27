import { classRegistry, FabricObject, Point, util } from 'fabric'
import { interactiveTextColor } from '../color'
import { type WheelSpec, readWheel, sliceGeometry, wheelOutcome, wheelRandom, WHEEL_RADIUS, WHEEL_SIZE } from './model'

export class DoryWheel extends FabricObject {
  static override type = 'DoryWheel'
  declare wheel: WheelSpec
  private rotation = 0
  private raf = 0
  private spinning = false
  private versionValue = 0

  constructor(options: Record<string, unknown> = {}) {
    super()
    this.setOptions({ width: WHEEL_SIZE, height: WHEEL_SIZE, strokeWidth: 0, objectCaching: false, ...options })
  }

  get spinVersion(): number {
    return this.versionValue
  }

  get isSpinning(): boolean {
    return this.spinning
  }

  spin(reduced: boolean, done: (text: string) => void): boolean {
    const spec = readWheel(this.wheel)
    if (!spec || this.spinning) return false
    this.spinning = true
    const outcome = wheelOutcome(spec, wheelRandom())
    const from = this.rotation
    const distance = 360 * 5 + ((outcome.rotation - from % 360 + 360) % 360)
    const began = performance.now()
    const paint = (rotation: number): void => {
      this.rotation = rotation
      this.versionValue++
      this.set('dirty', true)
      this.canvas?.requestRenderAll()
    }
    const finish = (): void => {
      paint(outcome.rotation)
      this.spinning = false
      this.raf = 0
      done(outcome.slice.text)
    }
    if (reduced) finish()
    else {
      const tick = (now: number): void => {
        const progress = Math.min(1, (now - began) / 4200)
        paint(from + distance * (1 - (1 - progress) ** 4))
        if (progress < 1) this.raf = requestAnimationFrame(tick)
        else finish()
      }
      this.raf = requestAnimationFrame(tick)
    }
    return true
  }

  resetSpin(): void {
    cancelAnimationFrame(this.raf)
    this.raf = 0
    this.spinning = false
    this.rotation = 0
    this.versionValue++
    this.set('dirty', true)
    this.canvas?.requestRenderAll()
  }

  override containsPoint(point: Point): boolean {
    const local = point.transform(util.invertTransform(this.calcTransformMatrix()))
    return Math.hypot(local.x / this.width, local.y / this.height) <= 0.5
  }

  override _render(ctx: CanvasRenderingContext2D): void {
    const spec = readWheel(this.wheel)
    if (!spec) return
    ctx.save()
    ctx.scale(this.width / WHEEL_SIZE, this.height / WHEEL_SIZE)
    ctx.save()
    ctx.rotate(this.rotation * Math.PI / 180)
    let start = 0
    for (const slice of spec.slices) {
      if (slice.percentage <= 0) continue
      const a = (start * 3.6 - 90) * Math.PI / 180
      const b = ((start + slice.percentage) * 3.6 - 90) * Math.PI / 180
      ctx.beginPath()
      ctx.moveTo(0, 0)
      ctx.arc(0, 0, WHEEL_RADIUS, a, b)
      ctx.closePath()
      ctx.fillStyle = slice.color
      ctx.fill()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 2
      ctx.stroke()
      if (slice.percentage >= 3) {
        ctx.save()
        ctx.rotate((a + b) / 2)
        ctx.fillStyle = interactiveTextColor(slice.color)
        ctx.font = '600 16px sans-serif'
        ctx.textAlign = 'right'
        ctx.textBaseline = 'middle'
        ctx.fillText(slice.text, WHEEL_RADIUS - 16, 0, 122)
        ctx.restore()
      }
      start += slice.percentage
    }
    ctx.restore()
    ctx.beginPath()
    ctx.arc(0, 0, WHEEL_RADIUS + 2, 0, Math.PI * 2)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 4
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(0, 0, 24, 0, Math.PI * 2)
    ctx.fillStyle = '#ffffff'
    ctx.fill()
    ctx.beginPath()
    ctx.moveTo(-12, -198)
    ctx.lineTo(12, -198)
    ctx.lineTo(0, -166)
    ctx.closePath()
    ctx.fillStyle = '#2b1c17'
    ctx.fill()
    ctx.restore()
  }

  override _toSVG(): string[] {
    const spec = readWheel(this.wheel)
    if (!spec) return ['<g ', 'COMMON_PARTS', ' />']
    let start = 0
    const slices = spec.slices.map((slice) => {
      if (slice.percentage <= 0) return ''
      const { path, angle } = sliceGeometry(start, slice.percentage)
      start += slice.percentage
      const text = slice.percentage >= 3 ? `<text transform="rotate(${angle})" x="168" y="0" text-anchor="end" dominant-baseline="central" fill="${interactiveTextColor(slice.color)}" font-family="sans-serif" font-size="16" font-weight="600" textLength="${Math.min(122, [...slice.text].length * 9)}" lengthAdjust="spacingAndGlyphs">${util.string.escapeXml(slice.text)}</text>` : ''
      return `<path d="${path}" fill="${slice.color}" stroke="#ffffff" stroke-width="2" />${text}`
    }).join('')
    return ['<g ', 'COMMON_PARTS', `><g transform="scale(${this.width / WHEEL_SIZE} ${this.height / WHEEL_SIZE})">${slices}<circle r="186" fill="none" stroke="#ffffff" stroke-width="4" /><circle r="24" fill="#ffffff" /><path d="M -12 -198 L 12 -198 L 0 -166 Z" fill="#2b1c17" /></g></g>`]
  }

  override dispose(): void {
    cancelAnimationFrame(this.raf)
    super.dispose()
  }
}

classRegistry.setClass(DoryWheel)
