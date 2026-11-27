import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { newId } from '@/lib/document'
import { useEditor } from '../../../context'
import { t } from '../../../strings'
import { ColorButton } from '../../../ui/ColorButton'
import { equalizeSlices, MAX_WHEEL_SLICES, readWheel, type WheelSlice, type WheelSpec, WHEEL_COLORS, wheelTotal } from './model'
import ed from '../../../chrome/ed.module.css'
import styles from './Wheel.module.css'

export function WheelEditor({ spec, close }: { spec: WheelSpec; close: () => void }) {
  const editor = useEditor()
  const [slices, setSlices] = useState(() => spec.slices.map((slice) => ({ ...slice })))
  const valid = readWheel({ slices }) !== null
  const update = (id: string, change: Partial<WheelSlice>): void => {
    setSlices((current) => current.map((slice) => slice.id === id ? { ...slice, ...change } : slice))
  }
  return (
    <form className={styles.form} onSubmit={(event) => {
      event.preventDefault()
      if (valid && editor.wheels.set({ slices })) close()
    }}>
      <p className={styles.hint}>{t.wheel.hint}</p>
      <div className={styles.slices}>
        {slices.map((slice, index) => (
          <fieldset key={slice.id} className={styles.slice}>
            <legend>{t.wheel.slice} {index + 1}</legend>
            <label>
              <span className={ed.propLabel}>{t.wheel.content}</span>
              <input className={ed.propInput} value={slice.text} maxLength={120} required onChange={(event) => update(slice.id, { text: event.target.value })} />
            </label>
            <div className={styles.properties}>
              <div className={styles.color}>
                <span className={ed.propLabel}>{t.wheel.color}</span>
                <ColorButton label={t.wheel.color} value={{ type: 'solid', color: slice.color }} solidOnly allowAlpha={false} onChange={(fill) => {
                  if (fill.type === 'solid') update(slice.id, { color: fill.color })
                }} />
              </div>
              <label>
                <span className={ed.propLabel}>{t.wheel.percentage} (%)</span>
                <input type="number" className={ed.propInput} value={Number.isNaN(slice.percentage) ? '' : slice.percentage} min="0" max="100" step="any" required onChange={(event) => update(slice.id, { percentage: event.target.valueAsNumber })} />
              </label>
              <button type="button" className={`${ed.btn} ${ed.ghost}`} disabled={slices.length <= 2} aria-label={`${t.wheel.removeSlice} ${index + 1}`} onClick={() => setSlices((current) => current.filter((entry) => entry.id !== slice.id))}>
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </div>
          </fieldset>
        ))}
      </div>
      <div className={styles.actions}>
        <button type="button" className={`${ed.btn} ${ed.ghost}`} disabled={slices.length >= MAX_WHEEL_SLICES} onClick={() => setSlices((current) => [...current, { id: newId(), text: `${t.wheel.slice} ${current.length + 1}`, color: WHEEL_COLORS[current.length % WHEEL_COLORS.length], percentage: 0 }])}>
          <Plus size={14} aria-hidden="true" />{t.wheel.addSlice}
        </button>
        <button type="button" className={`${ed.btn} ${ed.ghost}`} onClick={() => setSlices(equalizeSlices)}>{t.wheel.equalize}</button>
      </div>
      <output className={styles.total} aria-live="polite">{t.wheel.total}: {Number.isFinite(wheelTotal(slices)) ? Number(wheelTotal(slices).toFixed(4)) : 0}%</output>
      {!valid ? <p className={styles.error} role="status">{t.wheel.invalid}</p> : null}
      <button type="submit" className={ed.btn} disabled={!valid}>{t.wheel.apply}</button>
    </form>
  )
}
