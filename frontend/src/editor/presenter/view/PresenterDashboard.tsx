import { Grip, Minus, Plus, RotateCcw, X } from 'lucide-react'
import { type KeyboardEvent, type PointerEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { t } from '../../strings'
import { newSessionId } from '../channel'
import styles from './PresenterView.module.css'

export type PanelKind = 'current' | 'next' | 'notes' | 'flow'
export interface PresenterPanel {
  id: string
  kind: PanelKind
  x: number
  y: number
  width: number
  height: number
  scale: number
}

const LAYOUT_KEY = 'doory.presenterView.layout.v1'
const KINDS: PanelKind[] = ['current', 'next', 'notes', 'flow']
const RESIZE_EDGES = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const
type ResizeEdge = (typeof RESIZE_EDGES)[number]
const MIN_WIDTH = 20
const MIN_HEIGHT = 20
const defaults = (): PresenterPanel[] => [
  { id: 'current', kind: 'current', x: 0, y: 0, width: 60, height: 100, scale: 1 },
  { id: 'next', kind: 'next', x: 60, y: 0, width: 40, height: 36, scale: 1 },
  { id: 'notes', kind: 'notes', x: 60, y: 36, width: 40, height: 64, scale: 1 },
]
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

function storedLayout(): PresenterPanel[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(LAYOUT_KEY) ?? 'null')
    if (!Array.isArray(value)) return defaults()
    const ids = new Set<string>()
    for (const panel of value) {
      if (!panel || typeof panel !== 'object'
        || typeof panel.id !== 'string' || !panel.id || ids.has(panel.id)
        || !KINDS.includes(panel.kind)
        || ![panel.x, panel.y, panel.width, panel.height, panel.scale].every((n) => typeof n === 'number' && Number.isFinite(n))
        || panel.x < 0 || panel.y < 0 || panel.width < MIN_WIDTH || panel.height < MIN_HEIGHT
        || panel.x + panel.width > 100 || panel.y + panel.height > 100
        || panel.scale < (panel.kind === 'flow' ? 0.2 : 0.25) || panel.scale > 3) return defaults()
      ids.add(panel.id)
    }
    return value
  } catch {
    return defaults()
  }
}

function shifted(panel: PresenterPanel, dx: number, dy: number, edge: ResizeEdge | null): PresenterPanel {
  if (!edge) return { ...panel, x: clamp(panel.x + dx, 0, 100 - panel.width), y: clamp(panel.y + dy, 0, 100 - panel.height) }
  const left = edge.includes('w') ? clamp(panel.x + dx, 0, panel.x + panel.width - MIN_WIDTH) : panel.x
  const top = edge.includes('n') ? clamp(panel.y + dy, 0, panel.y + panel.height - MIN_HEIGHT) : panel.y
  const right = edge.includes('e') ? clamp(panel.x + panel.width + dx, panel.x + MIN_WIDTH, 100) : panel.x + panel.width
  const bottom = edge.includes('s') ? clamp(panel.y + panel.height + dy, panel.y + MIN_HEIGHT, 100) : panel.y + panel.height
  return { ...panel, x: left, y: top, width: right - left, height: bottom - top }
}

interface Drag {
  id: number
  panel: PresenterPanel
  x: number
  y: number
  width: number
  height: number
  edge: ResizeEdge | null
}

export function PresenterDashboard({ renderPanel }: { renderPanel: (panel: PresenterPanel, setScale: (scale: number) => void) => ReactNode }) {
  const [panels, setPanels] = useState(storedLayout)
  const [newKind, setNewKind] = useState<PanelKind>('flow')
  const board = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const labels: Record<PanelKind, string> = { current: t.presenterView.current, next: t.presenterView.next, notes: t.presenterView.notes, flow: t.presenterView.flowMap }

  useEffect(() => {
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(panels))
    } catch {
      /* The layout still works when browser storage is unavailable. */
    }
  }, [panels])

  const update = (id: string, patch: Partial<PresenterPanel>): void => {
    setPanels((current) => current.map((panel) => panel.id === id ? { ...panel, ...patch } : panel))
  }
  const start = (event: PointerEvent<HTMLButtonElement>, panel: PresenterPanel, edge: ResizeEdge | null): void => {
    if (event.button !== 0 || !board.current) return
    event.preventDefault()
    event.currentTarget.focus()
    const rect = board.current.getBoundingClientRect()
    if (!rect.width || !rect.height) return
    drag.current = { id: event.pointerId, panel, x: event.clientX, y: event.clientY, width: rect.width, height: rect.height, edge }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const move = (event: PointerEvent<HTMLButtonElement>): void => {
    const at = drag.current
    if (!at || at.id !== event.pointerId) return
    update(at.panel.id, shifted(at.panel, (event.clientX - at.x) / at.width * 100, (event.clientY - at.y) / at.height * 100, at.edge))
  }
  const end = (event: PointerEvent<HTMLButtonElement>): void => {
    const at = drag.current
    if (!at || at.id !== event.pointerId) return
    drag.current = null
    // Moving a captured element in the DOM can lose pointer capture, so save its stacking order after the drag.
    setPanels((current) => {
      const panel = current.find((item) => item.id === at.panel.id)
      return panel ? [...current.filter((item) => item.id !== panel.id), panel] : current
    })
  }
  const key = (event: KeyboardEvent<HTMLButtonElement>, panel: PresenterPanel, edge: ResizeEdge | null): void => {
    if (event.ctrlKey || event.metaKey || event.altKey) return
    const step = event.shiftKey ? 5 : 1
    const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
    const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
    if (!dx && !dy) return
    event.preventDefault()
    event.stopPropagation()
    update(panel.id, shifted(panel, dx, dy, edge))
  }
  const handles = (panel: PresenterPanel, edge: ResizeEdge | null) => ({
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => start(event, panel, edge),
    onPointerMove: move,
    onPointerUp: end,
    onPointerCancel: end,
    onLostPointerCapture: end,
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => key(event, panel, edge),
  })

  return (
    <main className={styles.dashboard}>
      <div className={styles.layoutTools} role="toolbar" aria-label={t.presenterView.layout}>
        <select className={styles.panelSelect} aria-label={t.presenterView.newPanel} value={newKind} onChange={(event) => setNewKind(event.target.value as PanelKind)}>
          {KINDS.map((kind) => <option key={kind} value={kind}>{labels[kind]}</option>)}
        </select>
        <button type="button" className={styles.ctl} onClick={() => {
          setPanels((current) => [...current, { id: newSessionId(), kind: newKind, x: 10, y: 10, width: 50, height: 60, scale: 1 }])
        }}>
          <Plus size={16} aria-hidden="true" /> {t.presenterView.addPanel}
        </button>
        <button type="button" className={styles.ctl} onClick={() => setPanels(defaults())}>
          <RotateCcw size={16} aria-hidden="true" /> {t.presenterView.resetLayout}
        </button>
        <span className={styles.layoutHint}>{t.presenterView.layoutHint}</span>
      </div>
      <div className={styles.dashboardViewport}>
        <div ref={board} className={styles.dashboardBoard} data-testid="view-dashboard">
          {panels.map((panel) => (
            <section key={panel.id} className={styles.panel} aria-label={labels[panel.kind]} data-testid={`view-panel-${panel.id}`} style={{ left: `${panel.x}%`, top: `${panel.y}%`, width: `${panel.width}%`, height: `${panel.height}%` }}>
              <header className={styles.panelHead}>
                <button type="button" className={`${styles.mini} ${styles.dragHandle}`} aria-label={t.presenterView.movePanel} title={t.presenterView.movePanel} {...handles(panel, null)}>
                  <Grip size={16} aria-hidden="true" />
                </button>
                <select className={styles.panelSelect} aria-label={t.presenterView.panelComponent} value={panel.kind} onChange={(event) => update(panel.id, { kind: event.target.value as PanelKind, scale: 1 })}>
                  {KINDS.map((kind) => <option key={kind} value={kind}>{labels[kind]}</option>)}
                </select>
                {panel.kind !== 'flow' ? (
                  <span className={styles.sizer} role="group" aria-label={t.workspace.zoomControls}>
                    <button type="button" className={styles.mini} aria-label={t.workspace.zoomOut} disabled={panel.scale <= 0.25} onClick={() => update(panel.id, { scale: clamp(panel.scale / 1.25, 0.25, 3) })}><Minus size={14} aria-hidden="true" /></button>
                    <button type="button" className={styles.scaleValue} aria-label={t.workspace.zoomLevel} onClick={() => update(panel.id, { scale: 1 })}>{Math.round(panel.scale * 100)}%</button>
                    <button type="button" className={styles.mini} aria-label={t.workspace.zoomIn} disabled={panel.scale >= 3} onClick={() => update(panel.id, { scale: clamp(panel.scale * 1.25, 0.25, 3) })}><Plus size={14} aria-hidden="true" /></button>
                  </span>
                ) : null}
                <button type="button" className={styles.mini} aria-label={t.presenterView.removePanel} onClick={() => setPanels((current) => current.filter((item) => item.id !== panel.id))}><X size={14} aria-hidden="true" /></button>
              </header>
              <div className={styles.panelContent}>{renderPanel(panel, (scale) => update(panel.id, { scale }))}</div>
              {RESIZE_EDGES.map((edge) => (
                <button key={edge} type="button" className={styles.resizeHandle} data-edge={edge} data-testid={`view-resize-${edge}`} aria-label={`${t.presenterView.resizePanel}: ${t.presenterView.resizeEdges[edge]}`} {...handles(panel, edge)} />
              ))}
            </section>
          ))}
          {panels.length === 0 ? <p className={styles.emptyDashboard}>{t.presenterView.emptyLayout}</p> : null}
        </div>
      </div>
    </main>
  )
}
