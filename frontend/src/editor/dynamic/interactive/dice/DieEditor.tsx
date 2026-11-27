import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { newId } from '@/lib/document'
import { useEditor } from '../../../context'
import { t } from '../../../strings'
import { ColorButton } from '../../../ui/ColorButton'
import { Switch } from '../../../ui/Switch'
import { defaultFaces, DIE_COLORS, DIE_SIDES, MAX_DIE_FACES, NUMBER_DIE_COLOR, readDie, type DieFace, type DieSpec } from './model'
import ed from '../../../chrome/ed.module.css'
import styles from '../Interactive.module.css'

export function DieEditor({ spec, close }: { spec: DieSpec; close: () => void }) {
  const editor = useEditor()
  const [kind, setKind] = useState(spec.kind)
  const [sides, setSides] = useState(spec.kind === 'number' ? spec.sides : 6)
  const [pips, setPips] = useState(spec.kind === 'number' && spec.pips === true)
  const [color, setColor] = useState(spec.kind === 'number' ? spec.color ?? NUMBER_DIE_COLOR : NUMBER_DIE_COLOR)
  const [faces, setFaces] = useState<(DieFace & { id: string })[]>(() => (spec.kind === 'symbol' ? spec.faces : defaultFaces()).map((face) => ({ ...face, id: newId() })))
  const draft: DieSpec = kind === 'number' ? { kind, sides, ...(pips && sides === 6 ? { pips: true } : {}), color } : { kind, faces: faces.map(({ text, color }) => ({ text, color })) }
  const valid = readDie(draft) !== null
  const update = (index: number, change: Partial<DieFace>): void => {
    setFaces((current) => current.map((face, i) => i === index ? { ...face, ...change } : face))
  }
  return (
    <form className={styles.form} onSubmit={(event) => {
      event.preventDefault()
      if (valid && editor.dice.set(draft)) close()
    }}>
      <label>
        <span className={ed.propLabel}>{t.dice.type}</span>
        <select className={ed.propInput} value={kind} onChange={(event) => setKind(event.target.value as DieSpec['kind'])}>
          <option value="number">{t.dice.numbered}</option>
          <option value="symbol">{t.dice.symbolic}</option>
        </select>
      </label>
      {kind === 'number' ? (
        <label>
          <span className={ed.propLabel}>{t.dice.sides}</span>
          <select className={ed.propInput} value={sides} onChange={(event) => setSides(Number(event.target.value))}>
            {DIE_SIDES.map((count) => <option key={count} value={count}>D{count}</option>)}
          </select>
        </label>
      ) : null}
      {kind === 'number' ? (
        <div className={styles.color}>
          <span className={ed.propLabel}>{t.dice.dieColor}</span>
          <ColorButton label={t.dice.dieColor} value={{ type: 'solid', color }} solidOnly allowAlpha={false} onChange={(fill) => {
            if (fill.type === 'solid') setColor(fill.color)
          }} />
        </div>
      ) : null}
      {kind === 'number' && sides === 6 ? <Switch label={t.dice.pips} checked={pips} onChange={setPips} /> : null}
      {kind === 'symbol' ? (
        <>
          <p className={styles.hint}>{t.dice.hint}</p>
          <div className={styles.entries}>
            {faces.map((face, index) => (
              <fieldset key={face.id} className={styles.entry}>
                <legend>{t.dice.face} {index + 1}</legend>
                <label>
                  <span className={ed.propLabel}>{t.dice.symbol}</span>
                  <input className={ed.propInput} value={face.text} maxLength={12} onChange={(event) => update(index, { text: event.target.value })} />
                </label>
                <label>
                  <span className={ed.propLabel}>{t.dice.shape}</span>
                  <select className={ed.propInput} value="" onChange={(event) => update(index, { text: event.target.value })}>
                    <option value="">{t.dice.chooseShape}</option>
                    <option value="●">{t.dice.circle}</option>
                    <option value="■">{t.dice.square}</option>
                    <option value="▲">{t.dice.triangle}</option>
                    <option value="★">{t.dice.star}</option>
                    <option value="♥">{t.dice.heart}</option>
                    <option value="◆">{t.dice.diamond}</option>
                  </select>
                </label>
                <div className={styles.properties}>
                  <div className={styles.color}>
                    <span className={ed.propLabel}>{t.dice.color}</span>
                    <ColorButton label={`${t.dice.color} ${index + 1}`} value={{ type: 'solid', color: face.color }} solidOnly allowAlpha={false} onChange={(fill) => {
                      if (fill.type === 'solid') update(index, { color: fill.color })
                    }} />
                  </div>
                  <span />
                  <button type="button" className={`${ed.btn} ${ed.ghost}`} disabled={faces.length <= 2} aria-label={`${t.dice.removeFace} ${index + 1}`} onClick={() => setFaces((current) => current.filter((_, i) => i !== index))}>
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </div>
              </fieldset>
            ))}
          </div>
          <div className={styles.actions}>
            <button type="button" className={`${ed.btn} ${ed.ghost}`} disabled={faces.length >= MAX_DIE_FACES} onClick={() => setFaces((current) => [...current, { id: newId(), text: '', color: DIE_COLORS[current.length % DIE_COLORS.length] }])}>
              <Plus size={14} aria-hidden="true" />{t.dice.addFace}
            </button>
          </div>
        </>
      ) : null}
      <button type="submit" className={ed.btn} disabled={!valid}>{t.dice.apply}</button>
    </form>
  )
}
