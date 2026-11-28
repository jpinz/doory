import type { EditorEngine } from '../../engine/editor'
import { asDory } from '../../engine/objects/dory'
import { t } from '../../strings'
import { DoryRansomNote } from './DoryRansomNote'
import { defaultRansomNote, noteLayout, readRansomNote, type RansomNoteSpec } from './model'

export class RansomNoteApi {
  constructor(private readonly engine: EditorEngine) {}

  async insert(): Promise<void> {
    if (this.engine.readOnly) return
    const page = this.engine.pageSizeOf(this.engine.state.activePageId)
    const center = this.engine.insert.center()
    const spec = { ...defaultRansomNote(t.ransomNote.sample), seed: Math.floor(Math.random() * 0x100000000) }
    const layout = noteLayout(spec)
    const scale = Math.min(page.width * 0.75 / layout.width, page.height * 0.4 / layout.height)
    const note = new DoryRansomNote({ left: center.x, top: center.y, originX: 'center', originY: 'center', width: layout.width, height: layout.height, scaleX: scale, scaleY: scale, ransomNote: spec })
    asDory(note).name = t.ransomNote.name
    await this.engine.insert.add([note], t.ransomNote.add)
  }

  set(spec: RansomNoteSpec): boolean {
    if (this.engine.readOnly) return false
    const view = this.engine.activeView()
    const object = view?.selectedObjects()[0]
    const note = readRansomNote(spec)
    if (!view || !(object instanceof DoryRansomNote) || !note) return false
    const previous = readRansomNote(object.ransomNote)
    if (!previous) return false
    const oldLayout = noteLayout(previous)
    const layout = noteLayout(note)
    object.set({
      ransomNote: note,
      width: object.width * layout.width / oldLayout.width,
      height: object.height * layout.height / oldLayout.height,
      dirty: true,
    })
    object.setCoords()
    view.canvas.requestRenderAll()
    this.engine.commit(this.engine.state.activePageId, { label: t.ransomNote.edit })
    return true
  }

  shuffle(): void {
    const object = this.engine.activeView()?.selectedObjects()[0]
    const note = object && readRansomNote(asDory(object).ransomNote)
    if (note) this.set({ ...note, seed: (note.seed + 1) >>> 0 })
  }
}
