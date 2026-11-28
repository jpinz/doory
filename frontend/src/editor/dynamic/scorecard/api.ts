import { uuid } from '@/lib/uuid'
import type { DocScoreboard, DoryDocument } from '@/types/document'
import type { EditorEngine } from '../../engine/editor'
import { jsonEqual } from '../../engine/json'
import { asDory } from '../../engine/objects/dory'
import { t } from '../../strings'
import { DoryScoreCard, liveScoreCards, type ScoreCardStyle } from './DoryScoreCard'
import { editScoreboard, initialScoreboard, nameScoreCard, playerKey, type Scoreboard, type ScoreCommand } from '../../presenter/scoreboard'

export class ScoreCardsApi {
  private shown: { doc: DoryDocument; board: Scoreboard } | null = null

  constructor(private readonly engine: EditorEngine) {
    engine.store.subscribe((state, prev) => {
      if (state.doc.scoreboard === prev.doc.scoreboard) return
      for (const view of engine.allViews()) {
        for (const card of liveScoreCards(view.canvas.getObjects())) {
          for (let parent = card.group; parent; parent = parent.group) parent.set('dirty', true)
        }
        view.canvas.requestRenderAll()
      }
    })
  }

  /** What a card shows in the editor: its player's saved name and score. */
  display(pageId: string, cardId: string): { name: string; score: number } | undefined {
    const doc = this.engine.state.doc
    if (this.shown?.doc !== doc) this.shown = { doc, board: initialScoreboard(doc) }
    const { board } = this.shown
    const card = board.cards.find((item) => item.pageId === pageId && item.id === cardId)
    if (!card) return undefined
    const entry = card.entryId ? board.entries.find((item) => item.id === card.entryId) : undefined
    return entry ? { name: entry.name, score: entry.score } : { name: t.scoreboard.player, score: 0 }
  }

  async insert(): Promise<void> {
    if (this.engine.readOnly) return
    const size = this.engine.pageSizeOf(this.engine.state.activePageId)
    const width = Math.min(size.width * 0.4, size.height * 0.6)
    const center = this.engine.insert.center()
    const taken = new Set(initialScoreboard(this.engine.state.doc).entries.map((entry) => playerKey(entry.name)))
    let n = 1
    while (taken.has(playerKey(`${t.scoreboard.player} ${n}`))) n++
    const card = new DoryScoreCard({
      left: center.x, top: center.y, originX: 'center', originY: 'center', width, height: width * 180 / 320,
      scoreCard: { entryId: uuid(), name: `${t.scoreboard.player} ${n}` },
    })
    asDory(card).name = t.scoreboard.card
    await this.engine.insert.add([card], t.scoreboard.addCard)
  }

  /** Names the selected card's player or team. Cards with the same name share a score. */
  rename(name: string): boolean {
    if (this.engine.readOnly) return false
    const card = this.engine.activeView()?.selectedObjects()[0]
    const id = card instanceof DoryScoreCard ? asDory(card).id : undefined
    if (!id) return false
    const doc = this.engine.getDocument()
    const next = nameScoreCard(doc, this.engine.state.activePageId, id, name)
    if (next === doc) return false
    if (!jsonEqual(next, doc)) this.engine.applyDocument(next, { label: t.scoreboard.editCard, selection: [id] })
    return true
  }

  /** Changes how the selected card looks. Dragging a color joins into one undo step. */
  setStyle(style: ScoreCardStyle): boolean {
    if (this.engine.readOnly) return false
    const view = this.engine.activeView()
    const card = view?.selectedObjects()[0]
    if (!view || !(card instanceof DoryScoreCard)) return false
    const next = Object.fromEntries(Object.entries(style).map(([key, value]) => [key, value === false || value === 'above' || value === '' ? undefined : value]))
    card.set({ ...next, dirty: true })
    view.canvas.requestRenderAll()
    const keys = Object.keys(style)
    const color = keys.length === 1 && (keys[0] === 'scoreBackground' || keys[0] === 'scoreColor')
    this.engine.commit(this.engine.state.activePageId, { label: t.scoreboard.editCard, ...(color ? { coalesceKey: `score-style:${keys[0]}` } : {}) })
    return true
  }

  /** Changes a score or a card's show/hide state from the editor's Scoreboard tab. Quick +/- clicks on a player join into one undo step. */
  edit(command: ScoreCommand): void {
    if (this.engine.readOnly) return
    const doc = this.engine.getDocument()
    const next = editScoreboard(doc, command)
    if (next === doc || jsonEqual(next, doc)) return
    const coalesceKey = command.action === 'score-adjust' ? `score:${command.entryId}` : undefined
    this.engine.applyDocument(next, { label: t.scoreboard.update, ...(coalesceKey ? { coalesceKey } : {}) })
  }

  /**
   * Keeps the presentation scoreboard with the design, so it is there after a reload and in the next presentation.
   * The changes of one presentation join into one undo step. A read-only design keeps scores for the presentation only.
   */
  saveScoreboard(scoreboard: DocScoreboard): void {
    if (this.engine.readOnly) return
    const doc = this.engine.getDocument()
    if (jsonEqual(doc.scoreboard, scoreboard)) return
    this.engine.applyDocument({ ...doc, scoreboard }, { label: t.scoreboard.update, coalesceKey: 'scoreboard' })
  }
}
