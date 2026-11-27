import type { DocPage } from '@/types/document'
import { useEditor } from '../../context'
import { t } from '../../strings'
import { dieDocuments } from './dice/model'
import { wheelDocuments } from './wheel/model'
import { InteractiveViewControls } from './InteractiveViewControls'
import type { InteractiveControl } from './model'

export function PageInteractiveControls({ page }: { page: DocPage }) {
  const editor = useEditor()
  const controls: InteractiveControl[] = [
    ...wheelDocuments(page.objects).map((object): InteractiveControl => ({ id: object.id, kind: 'wheel', label: object.name || t.wheel.name })),
    ...dieDocuments(page.objects).map((object): InteractiveControl => ({ id: object.id, kind: 'die', label: object.name || t.dice.name })),
  ]
  return (
    <InteractiveViewControls controls={controls} onActivate={(control) => editor.onInteractiveActivate(page.id, control.id, control.kind)} />
  )
}
