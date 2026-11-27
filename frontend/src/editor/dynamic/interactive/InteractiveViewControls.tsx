import { t } from '../../strings'
import type { InteractiveControl } from './model'
import ed from '../../chrome/ed.module.css'
import styles from './Interactive.module.css'

interface InteractiveViewControlsProps {
  controls: readonly InteractiveControl[]
  onActivate: (control: InteractiveControl) => void
  stopPointerPropagation?: boolean
}

/** Canvas hit testing handles pointing; these controls also make interactive objects keyboard-accessible. */
export function InteractiveViewControls({ controls, onActivate, stopPointerPropagation = false }: InteractiveViewControlsProps) {
  return (
    <div
      className={styles.viewControls}
      onPointerDown={(event) => { if (stopPointerPropagation) event.stopPropagation() }}
      onPointerUp={(event) => { if (stopPointerPropagation) event.stopPropagation() }}
    >
      {controls.map((control) => (
        <button key={control.id} type="button" className={ed.btn} onClick={() => onActivate(control)}>
          {control.kind === 'wheel' ? t.wheel.spin : t.dice.roll}: {control.label}
        </button>
      ))}
    </div>
  )
}
