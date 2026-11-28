import { createBlankDocument } from '@/lib/document'
import { serializeObject } from '../../engine/serialization'
import { t } from '../../strings'
import { DoryRansomNote } from './DoryRansomNote'
import { noteLayout, readRansomNote, type RansomNoteSpec } from './model'

const PREFIX = '#ransom-note='

export function noteLink(spec: RansomNoteSpec, origin: string): string {
  return `${origin}/create${PREFIX}${encodeURIComponent(JSON.stringify(spec))}`
}

export function readNoteLink(hash: string): RansomNoteSpec | null {
  if (!hash.startsWith(PREFIX) || hash.length > 10_000) return null
  try {
    return readRansomNote(JSON.parse(decodeURIComponent(hash.slice(PREFIX.length))))
  } catch {
    return null
  }
}

export function noteDesign(spec: RansomNoteSpec) {
  const layout = noteLayout(spec)
  const document = createBlankDocument(Math.max(800, Math.ceil(layout.width + 120)), Math.max(400, Math.ceil(layout.height + 120)))
  const scale = Math.min(1, (document.width - 80) / layout.width, (document.height - 80) / layout.height)
  const note = new DoryRansomNote({
    left: document.width / 2, top: document.height / 2,
    originX: 'center', originY: 'center',
    width: layout.width, height: layout.height,
    scaleX: scale, scaleY: scale,
    ransomNote: spec, name: t.ransomNote.name,
  })
  document.pages[0].objects = [serializeObject(note)]
  note.dispose()
  return { title: t.ransomNote.name, document }
}
