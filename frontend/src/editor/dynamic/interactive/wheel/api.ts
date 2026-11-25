import type { EditorEngine } from '../../../engine/editor'
import { DoryWheel } from './DoryWheel'
import { asDory } from '../../../engine/objects/dory'
import { findLive } from '../../../engine/api/arrange'
import { defaultWheel, readWheel, type WheelSpec } from './model'
import { t } from '../../../strings'

export class WheelsApi {
  constructor(private readonly engine: EditorEngine) {}

  async insert(): Promise<void> {
    if (this.engine.readOnly) return
    const size = this.engine.pageSizeOf(this.engine.state.activePageId)
    const diameter = Math.min(size.width, size.height) * 0.7
    const center = this.engine.insert.center()
    const wheel = new DoryWheel({ left: center.x, top: center.y, originX: 'center', originY: 'center', width: diameter, height: diameter, wheel: defaultWheel() })
    asDory(wheel).name = t.wheel.name
    await this.engine.insert.add([wheel], t.wheel.add)
  }

  set(spec: WheelSpec): boolean {
    if (this.engine.readOnly) return false
    const view = this.engine.activeView()
    const object = view?.selectedObjects()[0]
    const wheel = readWheel(spec)
    if (!view || !(object instanceof DoryWheel) || !wheel) return false
    object.resetSpin()
    object.set('wheel', wheel)
    view.canvas.requestRenderAll()
    this.engine.commit(this.engine.state.activePageId, { label: t.wheel.edit })
    return true
  }

  spin(pageId = this.engine.state.activePageId, id = this.engine.state.selection.ids[0]): void {
    const objects = this.engine.viewOf(pageId)?.canvas.getObjects() ?? []
    const object = findLive(objects, id)
    if (!(object instanceof DoryWheel)) return
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
    object.spin(reduced, (text) => {
      this.engine.announce(`${t.wheel.winner}: ${text}`)
      this.engine.toast(`${t.wheel.winner}: ${text}`)
    })
  }
}
