import { RotateCw, SlidersHorizontal } from 'lucide-react'
import { useEditor, useSelection } from '../../../context'
import { WheelEditor } from './WheelEditor'
import { readWheel } from './model'
import { t } from '../../../strings'
import { PopoverTool, ToolButton } from '../../../toolbar/parts'

export function WheelSection() {
  const editor = useEditor()
  const selection = useSelection()
  const spec = readWheel(selection.objects[0]?.wheel)
  if (!spec) return null
  return (
    <>
      <PopoverTool label={t.wheel.edit} trigger={<SlidersHorizontal size={18} aria-hidden="true" />} width="min(360px, calc(100vw - 24px))">
        {(close) => <WheelEditor key={selection.ids[0]} spec={spec} close={close} />}
      </PopoverTool>
      <ToolButton label={t.wheel.spin} onClick={() => editor.wheels.spin()}>
        <RotateCw size={18} aria-hidden="true" />
      </ToolButton>
    </>
  )
}
