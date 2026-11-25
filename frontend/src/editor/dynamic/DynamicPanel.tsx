import { useEditor } from '../context'
import type { PanelProps } from '../panels/registry'
import { t } from '../strings'
import { WheelPreview } from './interactive/wheel/WheelPreview'
import ed from '../chrome/ed.module.css'
import styles from './interactive/wheel/Wheel.module.css'

export function DynamicPanel({ close }: PanelProps) {
  const editor = useEditor()
  return (
    <section aria-label={t.wheel.category}>
      <h3 className={ed.sectionTitle}>{t.wheel.category}</h3>
      <button type="button" className={styles.tile} aria-label={t.wheel.add} onClick={() => { void editor.wheels.insert(); close() }}>
        <WheelPreview />
        <span>{t.wheel.name}</span>
      </button>
    </section>
  )
}
