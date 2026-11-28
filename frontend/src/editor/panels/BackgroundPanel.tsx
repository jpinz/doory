import { Check, ImagePlus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { BackgroundMotion, PageBackground } from '@/types/document'
import { useDocument, useEditor, useEditorState, useEditorStateShallow } from '../context'
import { documentColors } from '../engine/docOps'
import { useCanvasIllustrationColors } from '../hooks/useCanvasIllustrationColors'
import { gradientCss } from '../engine/objects/fills'
import { t } from '../strings'
import { Button } from '../ui/Button'
import { ColorButton } from '../ui/ColorButton'
import { Segmented } from '../ui/Segmented'
import { Slider } from '../ui/Slider'
import { Select } from '../ui/Select'
import { Switch } from '../ui/Switch'
import { GRADIENT_PRESETS, palettes } from '../ui/swatches'
import { loadable } from '../ui/loadable'
import { useResolvedSrc } from '../hooks/useResolvedSrc'
import ed from '../chrome/ed.module.css'
import { backgroundFill, fillToBackground } from './backgroundFill'
import { DEFAULT_PATTERN_COLOR, DEFAULT_PATTERN_PAPER, PATTERN_IDS, type PatternId, patternPreview, tileSize } from '../engine/objects/patterns'
import { MOTION_PERIOD, type MotionKind, backgroundMotion, motionKindsFor, withMotion } from '../engine/objects/backgroundMotion'
import styles from './Panel.module.css'

const StockTab = loadable(() => import('../drawers/StockTab').then((m) => m.StockTab))

const DIRECTIONS = ['right', 'downRight', 'down', 'downLeft', 'left', 'upLeft', 'up', 'upRight'] as const

/** Speed slider position (0 slowest … 100 fastest) for a loop length, on a log scale so each step feels alike. */
const RATIO = Math.log(MOTION_PERIOD.slowest / MOTION_PERIOD.fastest)
function speedOf(periodMs: number): number {
  return Math.round((Math.log(MOTION_PERIOD.slowest / Math.min(MOTION_PERIOD.slowest, Math.max(MOTION_PERIOD.fastest, periodMs))) / RATIO) * 100)
}
/** Loop length for a slider position, rounded to a tenth of a second. */
function periodOf(speed: number): number {
  return Math.round((MOTION_PERIOD.slowest * Math.exp((-speed / 100) * RATIO)) / 100) * 100
}

/** How a pattern or gradient background moves: one motion at a time, with its speed and direction. */
function MotionSection({ bg, onChange }: { bg: PageBackground; onChange: (motion: BackgroundMotion | null, key?: string) => void }) {
  const kinds = motionKindsFor(bg)
  const motion = backgroundMotion(bg)
  const copy = t.backgroundPanel
  if (kinds.length === 0) return null
  const pick = (kind: MotionKind | 'none'): void => onChange(kind === 'none' ? null : { kind, periodMs: motion?.periodMs ?? MOTION_PERIOD.initial })
  return (
    <section className={styles.section} data-testid="bg-motion">
      <p className={ed.sectionTitle}>{copy.motion}</p>
      <span className={styles.hint}>{copy.motionHint}</span>
      <Select aria-label={copy.motion} value={motion?.kind ?? 'none'} onChange={(e) => pick(e.target.value as MotionKind | 'none')} data-testid="bg-motion-kind">
        <option value="none">{copy.motionKinds.none}</option>
        {kinds.map((k) => (
          <option key={k} value={k}>
            {copy.motionKinds[k]}
          </option>
        ))}
      </Select>
      {motion ? (
        <>
          <Slider
            label={copy.speed}
            value={speedOf(motion.periodMs)}
            min={0}
            max={100}
            display={`${(motion.periodMs / 1000).toFixed(1)} ${copy.seconds}`}
            onChange={(speed) => onChange({ ...motion, periodMs: periodOf(speed) }, 'bg-motion-speed')}
          />
          {motion.kind === 'drift' ? (
            <Select aria-label={copy.direction} value={String(motion.angle ?? 0)} onChange={(e) => onChange({ ...motion, angle: Number(e.target.value) })} data-testid="bg-motion-direction">
              {DIRECTIONS.map((d, i) => (
                <option key={d} value={i * 45}>
                  {copy.directions[d]}
                </option>
              ))}
            </Select>
          ) : null}
          {motion.kind === 'zoom' ? (
            <Segmented
              label={copy.motionKinds.zoom}
              value={motion.reverse ? 'out' : 'in'}
              onChange={(v) => onChange({ ...motion, reverse: v === 'out' })}
              options={[
                { value: 'in', label: copy.zoomIn },
                { value: 'out', label: copy.zoomOut },
              ]}
            />
          ) : null}
          {motion.kind === 'rotate' ? <Switch label={copy.counterClockwise} checked={motion.reverse === true} onChange={(reverse) => onChange({ ...motion, reverse })} /> : null}
          {motion.kind === 'shift' ? <Switch label={copy.reverse} checked={motion.reverse === true} onChange={(reverse) => onChange({ ...motion, reverse })} /> : null}
        </>
      ) : null}
    </section>
  )
}

function UploadSwatch({ src, active, onPick }: { src: string; active: boolean; onPick: () => void }) {
  const url = useResolvedSrc(src)
  return (
    <button type="button" className={`${styles.tile} ${active ? styles.chipOn : ''}`} onClick={onPick} aria-label={t.backgroundPanel.useImage} aria-pressed={active}>
      {url ? <img src={url} alt="" draggable={false} /> : null}
    </button>
  )
}

export function BackgroundPanel() {
  const editor = useEditor()
  const doc = useDocument()
  const activeId = useEditorState((s) => s.activePageId)
  const uploads = useEditorStateShallow((s) => s.uploads)
  const page = doc.pages.find((p) => p.id === activeId) ?? doc.pages[0]
  const bg = page.background
  const canvasColors = useCanvasIllustrationColors()
  const docColors = useMemo(() => documentColors(doc, 12), [doc])
  const preset = palettes.get('doory')?.colors ?? []
  const colors = [...new Set([...canvasColors, ...docColors, ...preset, ...(palettes.get('vivid')?.colors ?? [])])].slice(0, 18)

  const set = (b: PageBackground, key?: string): void => editor.pages.setBackground(page.id, b, key)
  const motion = backgroundMotion(bg)
  // Switching between patterns or gradients keeps the motion when the new background can have it.
  const keep = (b: PageBackground, key?: string): void => set(withMotion(b, motion), key)
  const [ink, setInk] = useState(bg.type === 'pattern' ? bg.color : DEFAULT_PATTERN_COLOR)
  const [paper, setPaper] = useState(bg.type === 'pattern' ? bg.paper : DEFAULT_PATTERN_PAPER)
  const previews = useMemo(() => new Map(PATTERN_IDS.map((id) => [id, patternPreview(id, ink, paper)])), [ink, paper])
  const hasStock = editor.adapter.services.stock !== null
  const [stockOpen, setStockOpen] = useState(false)
  const size = editor.pageSizeOf(page.id)
  const tile = tileSize(size.width, size.height)
  const setPattern = (id: PatternId): void => keep({ type: 'pattern', pattern: id, color: ink, paper, size: tile })
  const setPatternColor = (which: 'color' | 'paper', color: string): void => {
    if (which === 'color') setInk(color)
    else setPaper(color)
    if (bg.type === 'pattern') set({ ...bg, [which]: color }, `bg-pattern-${which}`)
  }

  return (
    <div className={styles.panel}>
      <section className={styles.section}>
        <p className={ed.sectionTitle}>{t.panels.pageBackground}</p>
        <div className={styles.fieldRow}>
          <span className={styles.hint}>{t.backgroundPanel.custom}</span>
          <ColorButton label={t.panels.pageBackground} value={backgroundFill(bg)} onChange={(f) => keep(fillToBackground(f), 'bg-fill')} />
        </div>
        <div className={styles.swatchGrid} role="group" aria-label={t.panels.swatches}>
          {colors.map((c) => (
            <button key={c} type="button" className={styles.swatchBtn} style={{ background: c }} aria-label={t.backgroundPanel.set(c)} title={c} onClick={() => set({ type: 'solid', color: c })} />
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <p className={ed.sectionTitle}>{t.panels.gradient}</p>
        <div className={`${styles.grid} ${styles.grid}`}>
          {GRADIENT_PRESETS.map((g) => (
            <button
              key={g.id}
              type="button"
              className={styles.swatchBtn}
              style={{ background: gradientCss({ type: 'gradient', kind: 'linear', angle: g.angle, stops: g.stops }), aspectRatio: '3 / 2' }}
              aria-label={t.backgroundPanel.gradientOf(g.label)}
              title={g.label}
              onClick={() => keep({ type: 'gradient', kind: 'linear', angle: g.angle, stops: g.stops })}
            />
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <p className={ed.sectionTitle}>{t.backgroundPanel.patterns}</p>
        <div className={styles.fieldRow}>
          <span className={styles.hint}>{t.backgroundPanel.patternColor}</span>
          <ColorButton label={t.backgroundPanel.patternColor} value={{ type: 'solid', color: ink }} solidOnly onChange={(f) => f.type === 'solid' && setPatternColor('color', f.color)} />
        </div>
        <div className={styles.fieldRow}>
          <span className={styles.hint}>{t.backgroundPanel.patternBackground}</span>
          <ColorButton label={t.backgroundPanel.patternBackground} value={{ type: 'solid', color: paper }} solidOnly onChange={(f) => f.type === 'solid' && setPatternColor('paper', f.color)} />
        </div>
        <div className={styles.grid}>
          {PATTERN_IDS.map((id) => (
            <button
              key={id}
              type="button"
              className={`${styles.patternBtn} ${bg.type === 'pattern' && bg.pattern === id ? styles.chipOn : ''}`}
              style={{ backgroundImage: `url("${previews.get(id) ?? ''}")` }}
              aria-label={t.backgroundPanel.patternOf(t.backgroundPanel.patternNames[id])}
              aria-pressed={bg.type === 'pattern' && bg.pattern === id}
              title={t.backgroundPanel.patternNames[id]}
              data-testid={`bg-pattern-${id}`}
              onClick={() => setPattern(id)}
            />
          ))}
        </div>
      </section>

      <MotionSection bg={bg} onChange={(next, key) => set(withMotion(bg, next), key)} />

      <section className={styles.section}>
        <p className={ed.sectionTitle}>{t.panels.image}</p>
        <Button icon={<ImagePlus size={18} />} onClick={() => void editor.insert.pickAndUpload()}>
          {t.panels.uploadImage}
        </Button>
        {hasStock ? (
          <Button variant="soft" icon={<Search size={18} />} aria-expanded={stockOpen} data-testid="bg-stock-toggle" onClick={() => setStockOpen((v) => !v)}>
            {t.imageDrawer.stock}
          </Button>
        ) : null}
        {hasStock && stockOpen ? (
          <StockTab close={() => setStockOpen(false)} onPick={(ref) => set({ type: 'image', src: ref.url, fit: bg.type === 'image' ? bg.fit : 'cover' })} />
        ) : null}
        {uploads.length > 0 ? (
          <div className={`${styles.grid} ${styles.grid2}`}>
            {uploads.map((u) => (
              <UploadSwatch key={u.id} src={u.thumbUrl || u.url} active={bg.type === 'image' && bg.src === u.url} onPick={() => set({ type: 'image', src: u.url, fit: bg.type === 'image' ? bg.fit : 'cover' })} />
            ))}
          </div>
        ) : null}
        {bg.type === 'image' ? (
          <>
            <Segmented
              label={t.panels.fit}
              value={bg.fit}
              onChange={(fit) => set({ ...bg, fit })}
              options={[
                { value: 'cover', label: t.panels.cover },
                { value: 'contain', label: t.panels.contain },
                { value: 'tile', label: t.panels.tile },
              ]}
            />
            <Button variant="ghost" onClick={() => set({ type: 'solid', color: '#ffffff' })}>
              {t.panels.removeBackgroundImage}
            </Button>
          </>
        ) : null}
      </section>

      <Button variant="soft" icon={<Check size={18} />} disabled={doc.pages.length < 2} onClick={() => editor.pages.setBackgroundAll(page.background)}>
        {t.panels.applyToAll}
      </Button>
    </div>
  )
}
