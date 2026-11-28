import { Pencil, Shuffle } from 'lucide-react'
import { useEditor, useSelection } from '../../context'
import { t } from '../../strings'
import { PopoverTool, ToolButton } from '../../toolbar/parts'
import { readRansomNote } from './model'
import { RansomNoteEditor } from './RansomNoteEditor'

export function RansomNoteSection() {
  const editor = useEditor()
  const selection = useSelection()
  const spec = readRansomNote(selection.objects[0]?.ransomNote)
  if (!spec) return null
  return (
    <>
      <PopoverTool label={t.ransomNote.edit} trigger={<Pencil size={18} aria-hidden="true" />} width="min(900px, calc(100vw - 24px))">
        {(close) => <RansomNoteEditor key={selection.ids[0]} spec={spec} close={close} />}
      </PopoverTool>
      <ToolButton label={t.ransomNote.shuffle} onClick={() => editor.ransomNotes.shuffle()}>
        <Shuffle size={18} aria-hidden="true" />
      </ToolButton>
    </>
  )
}
