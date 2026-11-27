import type { EditorEngine } from '../../../engine/editor'
import { findLive } from '../../../engine/api/arrange'
import { asDory } from '../../../engine/objects/dory'
import { t } from '../../../strings'
import { DoryDie } from './DoryDie'
import { defaultDie, readDie, type DieSpec } from './model'

export class DiceApi {
  constructor(private readonly engine: EditorEngine) {}

  async insert(): Promise<void> {
    if (this.engine.readOnly) return
    const size = this.engine.pageSizeOf(this.engine.state.activePageId)
    const diameter = Math.min(size.width, size.height) * 0.3
    const center = this.engine.insert.center()
    const die = new DoryDie({ left: center.x, top: center.y, originX: 'center', originY: 'center', width: diameter, height: diameter, die: defaultDie() })
    asDory(die).name = t.dice.name
    await this.engine.insert.add([die], t.dice.add)
  }

  set(spec: DieSpec): boolean {
    if (this.engine.readOnly) return false
    const view = this.engine.activeView()
    const object = view?.selectedObjects()[0]
    const die = readDie(spec)
    if (!view || !(object instanceof DoryDie) || !die) return false
    object.resetRoll()
    object.set('die', die)
    view.canvas.requestRenderAll()
    this.engine.commit(this.engine.state.activePageId, { label: t.dice.edit })
    return true
  }

  roll(pageId = this.engine.state.activePageId, id = this.engine.state.selection.ids[0]): void {
    const objects = this.engine.viewOf(pageId)?.canvas.getObjects() ?? []
    const object = findLive(objects, id)
    if (!(object instanceof DoryDie)) return
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    object.roll(reduced, (text) => {
      this.engine.announce(`${t.dice.result}: ${text}`)
      this.engine.toast(`${t.dice.result}: ${text}`)
    })
  }
}
