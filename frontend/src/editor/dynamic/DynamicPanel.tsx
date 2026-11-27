import { useEditor } from '../context'
import type { PanelProps } from '../panels/registry'
import { t } from '../strings'
import { WheelPreview } from './interactive/wheel/WheelPreview'
import { Dices } from 'lucide-react'
import ed from '../chrome/ed.module.css'
import styles from './interactive/Interactive.module.css'

export function DynamicPanel({ close }: PanelProps) {
  const editor = useEditor()
  return (
    <section aria-label={t.interactive.category}>
      <h3 className={ed.sectionTitle}>{t.interactive.category}</h3>
      <button type="button" className={styles.tile} aria-label={t.wheel.add} onClick={() => { void editor.wheels.insert(); close() }}>
        <WheelPreview />
        <span>{t.wheel.name}</span>
      </button>
      <button type="button" className={styles.tile} aria-label={t.dice.add} onClick={() => { void editor.dice.insert(); close() }}>
        <Dices aria-hidden="true" />
        <span>{t.dice.name}</span>
      </button>
    </section>
  )
}
