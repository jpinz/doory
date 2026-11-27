import { Dices, SlidersHorizontal } from 'lucide-react'
import { useEditor, useSelection } from '../../../context'
import { t } from '../../../strings'
import { PopoverTool, ToolButton } from '../../../toolbar/parts'
import { DieEditor } from './DieEditor'
import { readDie } from './model'

export function DieSection() {
  const editor = useEditor()
  const selection = useSelection()
  const spec = readDie(selection.objects[0]?.die)
  if (!spec) return null
  return (
    <>
      <PopoverTool label={t.dice.edit} trigger={<SlidersHorizontal size={18} aria-hidden="true" />} width="min(360px, calc(100vw - 24px))">
        {(close) => <DieEditor key={selection.ids[0]} spec={spec} close={close} />}
      </PopoverTool>
      <ToolButton label={t.dice.roll} onClick={() => editor.dice.roll()}>
        <Dices size={18} aria-hidden="true" />
      </ToolButton>
    </>
  )
}
