import type { DocPage } from '@/types/document'
import { useEditor } from '../../../context'
import { t } from '../../../strings'
import { wheelDocuments } from './model'
import ed from '../../../chrome/ed.module.css'
import styles from './Wheel.module.css'

/** Canvas hit testing handles pointing; these controls also make the wheels keyboard-accessible. */
export function WheelViewControls({ page }: { page: DocPage }) {
  const editor = useEditor()
  return (
    <div className={styles.viewControls}>
      {wheelDocuments(page.objects).map((object) => (
        <button key={object.id} type="button" className={ed.btn} onClick={() => editor.wheels.spin(page.id, object.id)}>
          {t.wheel.spin}: {object.name || t.wheel.name}
        </button>
      ))}
    </div>
  )
}
