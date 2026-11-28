import { useId, useMemo, useState } from 'react'
import { useEditor } from '../../context'
import { copyText } from '../../dialogs/copyText'
import { t } from '../../strings'
import ed from '../../chrome/ed.module.css'
import { notePreviewSvg } from './DoryRansomNote'
import { noteLink } from './link'
import { defaultRansomNote, MAX_NOTE_LENGTH, NOTE_CASES, NOTE_COLORS, NOTE_EDGES, NOTE_FONTS, NOTE_LIMITS, noteOptions, PAPER_COLORS, readRansomNote, type RansomNoteSpec } from './model'
import styles from './RansomNote.module.css'

const FONT_PREVIEWS = { serif: 'Georgia, serif', sans: 'Arial, sans-serif', slab: '"Courier New", monospace', display: 'cursive', mono: 'monospace' }

export function RansomNoteEditor({ spec, close }: { spec: RansomNoteSpec; close: () => void }) {
  const editor = useEditor()
  const id = useId()
  const [draft, setDraft] = useState(() => ({ ...spec, ...noteOptions(spec) }))
  const [seed, setSeed] = useState(String(spec.seed))
  const [copied, setCopied] = useState(false)
  const [manualLink, setManualLink] = useState('')
  const valid = seed.trim() !== '' && readRansomNote(draft) !== null
  const preview = useMemo(() => readRansomNote(draft) ? `data:image/svg+xml;charset=utf-8,${encodeURIComponent(notePreviewSvg(draft))}` : '', [draft])
  const update = (patch: Partial<RansomNoteSpec>): void => {
    setDraft((current) => ({ ...current, ...patch }))
    setCopied(false)
    setManualLink('')
  }
  const sliders = [
    { key: 'chaos', label: t.ransomNote.chaos, unit: '' },
    { key: 'letterSize', label: t.ransomNote.letterSize, unit: ' px' },
    { key: 'gap', label: t.ransomNote.gap, unit: ' px' },
    { key: 'shadow', label: t.ransomNote.shadow, unit: '' },
  ] as const

  return (
    <form className={styles.editor} onSubmit={(event) => {
      event.preventDefault()
      if (valid && editor.ransomNotes.set(draft)) close()
    }}>
      <div className={styles.columns}>
        <section className={styles.section}>
          <h3>{t.ransomNote.yourNote}</h3>
          <label className={styles.field}>
            <span className={styles.label}><span id={`${id}-message-label`}>{t.ransomNote.message}</span><span aria-hidden="true">{draft.text.length} / {MAX_NOTE_LENGTH}</span></span>
            <textarea aria-labelledby={`${id}-message-label`} className={ed.propInput} value={draft.text} maxLength={MAX_NOTE_LENGTH} rows={5} onChange={(event) => update({ text: event.target.value })} />
          </label>
          <label className={styles.field}>
            <span>{t.ransomNote.seed}</span>
            <input className={ed.propInput} type="number" min={0} max={0xffffffff} step={1} value={seed} onChange={(event) => {
              setSeed(event.target.value)
              update({ seed: Number(event.target.value) })
            }} />
          </label>
          <div className={styles.actions}>
            <button type="button" className={`${ed.btn} ${ed.ghost}`} disabled={!valid} onClick={() => {
              const link = noteLink(draft, window.location.origin)
              void copyText(link).then((ok) => {
                setCopied(ok)
                setManualLink(ok ? '' : link)
              })
            }}>{copied ? t.ransomNote.copied : t.ransomNote.copyLink}</button>
            <button type="button" className={`${ed.btn} ${ed.ghost}`} onClick={() => {
              const defaults = defaultRansomNote(t.ransomNote.sample)
              setSeed(String(defaults.seed))
              update(defaults)
            }}>{t.ransomNote.reset}</button>
          </div>
          <p className={styles.hint}>{t.ransomNote.seedHint}</p>
          {manualLink ? (
            <label className={styles.field}>
              <span>{t.ransomNote.copyManually}</span>
              <input className={ed.propInput} readOnly value={manualLink} onFocus={(event) => event.target.select()} />
            </label>
          ) : null}
        </section>
        <section className={styles.section}>
          <h3>{t.ransomNote.look}</h3>
          {sliders.map(({ key, label, unit }) => (
            <label key={key} className={styles.field} htmlFor={`${id}-${key}`}>
              <span className={styles.label}><span id={`${id}-${key}-label`}>{label}</span><span aria-hidden="true">{draft[key]}{unit}</span></span>
              <input id={`${id}-${key}`} aria-labelledby={`${id}-${key}-label`} type="range" {...NOTE_LIMITS[key]} value={draft[key]} onChange={(event) => update({ [key]: Number(event.target.value) })} />
            </label>
          ))}
          <fieldset className={styles.options}>
            <legend>{t.ransomNote.letterCase}</legend>
            <div className={styles.segmented}>
              {NOTE_CASES.map((choice) => (
                <label key={choice} className={draft.letterCase === choice ? styles.selected : ''}>
                  <input type="radio" name={`${id}-case`} value={choice} checked={draft.letterCase === choice} onChange={() => update({ letterCase: choice })} />
                  <span>{t.ransomNote.cases[choice]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className={styles.options}>
            <legend>{t.ransomNote.paperEdge}</legend>
            <div className={styles.segmented}>
              {NOTE_EDGES.map((choice) => (
                <label key={choice} className={draft.edge === choice ? styles.selected : ''}>
                  <input type="radio" name={`${id}-edge`} value={choice} checked={draft.edge === choice} onChange={() => update({ edge: choice })} />
                  <span>{t.ransomNote.edges[choice]}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </section>
        <section className={styles.section}>
          <h3>{t.ransomNote.paperAndFonts}</h3>
          <fieldset className={styles.options}>
            <legend>{t.ransomNote.paperColors}</legend>
            <div className={styles.swatches}>
              {NOTE_COLORS.map((color) => {
                const selected = draft.colors.includes(color)
                return (
                  <button key={color} type="button" aria-label={t.ransomNote.colorNames[color]} aria-pressed={selected} className={`${styles.swatch} ${selected ? styles.selected : ''}`} style={{ backgroundColor: PAPER_COLORS[color] }} disabled={selected && draft.colors.length === 1} onClick={() => update({ colors: selected ? draft.colors.filter((item) => item !== color) : [...draft.colors, color] })} />
                )
              })}
            </div>
          </fieldset>
          <fieldset className={styles.options}>
            <legend>{t.ransomNote.fontFamilies}</legend>
            <div className={styles.fonts}>
              {NOTE_FONTS.map((font) => {
                const selected = draft.fonts.includes(font)
                return (
                  <button key={font} type="button" aria-label={t.ransomNote.fontNames[font]} aria-pressed={selected} className={selected ? styles.selected : ''} disabled={selected && draft.fonts.length === 1} onClick={() => update({ fonts: selected ? draft.fonts.filter((item) => item !== font) : [...draft.fonts, font] })}>
                    <span aria-hidden="true" style={{ fontFamily: FONT_PREVIEWS[font] }}>Aa</span>
                    {t.ransomNote.fontNames[font]}
                  </button>
                )
              })}
            </div>
          </fieldset>
          <p className={styles.hint}>{t.ransomNote.fontHint}</p>
        </section>
      </div>
      {preview ? <img className={styles.preview} src={preview} alt={t.ransomNote.preview} /> : null}
      <button type="submit" className={ed.btn} disabled={!valid}>{t.ransomNote.apply}</button>
    </form>
  )
}
