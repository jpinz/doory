import { classRegistry, FabricObject, Group, util } from 'fabric'
import { readScoreCard, type ScoreCardSpec } from './model'

export interface ScoreCardDisplay {
  name: string
  score: number
  visible: boolean
}

/** Per editor canvas: the player's saved name and score that a card there shows. */
export const SCORE_CARD_BACKGROUND = '#6a52d9'
export const SCORE_CARD_TEXT = '#ffffff'

export type ScoreCardStyle = Partial<Pick<DoryScoreCard, 'scoreOnly' | 'scoreNamePosition' | 'scoreBackground' | 'scoreColor'>>

/** Per editor canvas: the player's saved name and score that a card there shows. */
export const editorScores = new WeakMap<object, (id: string) => { name: string; score: number } | undefined>()

export class DoryScoreCard extends FabricObject {
  static override type = 'DoryScoreCard'
  declare scoreCard: ScoreCardSpec
  /** Shows only the score, without the player's name. */
  declare scoreOnly?: boolean
  /** Puts the name under the score instead of above it. */
  declare scoreNamePosition?: 'above' | 'below'
  declare scoreBackground?: string
  declare scoreColor?: string
  private display: ScoreCardDisplay | null = null

  constructor(options: Record<string, unknown> = {}) {
    super()
    this.setOptions({ width: 320, height: 180, strokeWidth: 0, objectCaching: false, ...options })
    if (typeof options.scoreCardValue === 'number') {
      this.display = { name: readScoreCard(this.scoreCard)?.name ?? '', score: options.scoreCardValue, visible: this.visible }
    }
  }

  setDisplay(display: ScoreCardDisplay): void {
    this.display = display
    this.set({ visible: display.visible, dirty: true })
    let parent = this.group
    while (parent) {
      parent.set('dirty', true)
      parent = parent.group
    }
  }

  private content(): { name: string; score: number } {
    if (this.display) return this.display
    let canvas = this.canvas
    for (let parent = this.group; !canvas && parent; parent = parent.group) canvas = parent.canvas
    const saved = canvas ? editorScores.get(canvas)?.((this as { id?: string }).id ?? '') : undefined
    return saved ?? { name: readScoreCard(this.scoreCard)?.name ?? '', score: 0 }
  }

  /** Where each line goes on the 320×180 card: the name (if shown) and the score, as [y, font size]. */
  private layout(): { name: [number, number] | null; score: [number, number] } {
    if (this.scoreOnly) return { name: null, score: [0, 96] }
    return this.scoreNamePosition === 'below' ? { name: [56, 24], score: [-16, 72] } : { name: [-48, 24], score: [24, 72] }
  }

  private colors(): { background: string; text: string } {
    return { background: this.scoreBackground || SCORE_CARD_BACKGROUND, text: this.scoreColor || SCORE_CARD_TEXT }
  }

  override _render(ctx: CanvasRenderingContext2D): void {
    const { name, score } = this.content()
    const layout = this.layout()
    const colors = this.colors()
    ctx.save()
    ctx.scale(this.width / 320, this.height / 180)
    ctx.fillStyle = colors.background
    ctx.fillRect(-160, -90, 320, 180)
    ctx.fillStyle = colors.text
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    if (layout.name) {
      ctx.font = `600 ${layout.name[1]}px sans-serif`
      ctx.fillText(name, 0, layout.name[0], 288)
    }
    ctx.font = `700 ${layout.score[1]}px sans-serif`
    ctx.fillText(String(score), 0, layout.score[0], 288)
    ctx.restore()
  }

  override _toSVG(): string[] {
    const { name, score } = this.content()
    const layout = this.layout()
    const colors = this.colors()
    const fill = util.string.escapeXml(colors.text)
    const fit = [...name].length > 20 ? ' textLength="288" lengthAdjust="spacingAndGlyphs"' : ''
    const scale = `transform="scale(${this.width / 320} ${this.height / 180})"`
    const box = `<rect x="-160" y="-90" width="320" height="180" fill="${util.string.escapeXml(colors.background)}" />`
    const text = ([y, size]: [number, number], weight: number, value: string, extra = ''): string =>
      `<text x="0" y="${y}" text-anchor="middle" dominant-baseline="central" fill="${fill}" font-family="sans-serif" font-size="${size}" font-weight="${weight}"${extra}>${value}</text>`
    const content = (layout.name ? text(layout.name, 600, util.string.escapeXml(name), fit) : '') + text(layout.score, 700, String(score))
    return ['<g ', 'COMMON_PARTS', `><g ${scale}>${box}${content}</g></g>`]
  }
}

export function liveScoreCards(objects: readonly FabricObject[]): DoryScoreCard[] {
  return objects.flatMap((object) => object instanceof DoryScoreCard ? [object] : object instanceof Group ? liveScoreCards(object.getObjects()) : [])
}

classRegistry.setClass(DoryScoreCard)
