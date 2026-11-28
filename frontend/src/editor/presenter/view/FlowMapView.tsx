/**
 * The flow map: a panel the presenter view toggles in place of its notes. It draws the deck as the Flow tab lays it
 * out (section frames, Next arrows, an arrow from every linked element), follows the slide on screen, and shows any
 * slide the presenter clicks, as a followed link so Back returns. It shares the presenter view's link to the show:
 * the layout and the pictures come over the channel.
 */
import { Minus, Plus } from 'lucide-react'
import { type PointerEvent, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { t } from '../../strings'
import type { PagePreview } from '../channel'
import { fitContain } from '../fit'
import { CARD_HEIGHT, CARD_WIDTH, edgePath, LANE, type Position, STEP, THUMB, thumbPoint } from '../../flow/layout'
import { useInView } from '../../hooks/useInView'
import { bestFrame, configOf, frameWidthFor } from './model'
import type { Show } from './useShow'
import styles from './FlowMapView.module.css'

/** Enough pictures for every card of the largest deck, at one size each. */
export const MAP_FRAMES = 120
const ZOOM_MIN = 0.2
const ZOOM_MAX = 2.5
const ZOOM_STEP = 1.25

const clampZoom = (zoom: number): number => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom))
type Pan = { pointerId: number; x: number; y: number; left: number; top: number }

function labelOf(page: PagePreview, index: number): string {
  return page.name.trim() || `${t.flowBoard.slide} ${index + 1}`
}

function Thumb({ page, frames, request }: { page: PagePreview; frames: Show['frames']; request: Show['request'] }) {
  const [ref, seen] = useInView<HTMLSpanElement>()
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1
  const fit = fitContain({ width: THUMB.width, height: THUMB.height }, page)
  const wanted = frameWidthFor(fit.width, dpr)
  useEffect(() => {
    if (seen) request(page.id, wanted)
  }, [seen, page.id, wanted, request])
  const frame = bestFrame(frames.get(page.id) ?? [], wanted)
  return (
    <span ref={ref} className={styles.thumb}>
      {frame ? <img src={frame.url} alt="" draggable={false} style={{ left: fit.x, top: fit.y, width: fit.width, height: fit.height }} /> : null}
    </span>
  )
}

interface FlowMapProps {
  /** The presenter view's link to the show; give it room for `MAP_FRAMES` pictures while the map is shown. */
  link: Show
  embedded?: boolean
  initialZoom?: number
  onZoomChange?: (zoom: number) => void
}

export function FlowMap({ link, embedded = false, initialZoom = 1, onZoomChange }: FlowMapProps) {
  const { phase, show, frames, send, request } = link
  const cards = useRef(new Map<number, HTMLButtonElement>())
  const config = useMemo(() => (show ? configOf(show.pages) : null), [show])
  const marker = `map${useId().replace(/:/g, '')}`
  const current = show && !show.state.ended ? Math.min(show.state.index, show.pages.length - 1) : -1
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const attach = useCallback((el: HTMLDivElement | null): void => {
    scrollRef.current = el
    setScroller(el)
  }, [])
  const [zoom, setZoom] = useState(() => clampZoom(initialZoom))
  const zoomRef = useRef(zoom)
  // The board point to keep under the pointer (or the view's middle) once a new zoom has been laid out.
  const anchor = useRef<{ board: Position; view: Position } | null>(null)
  const pan = useRef<Pan | null>(null)
  const [panning, setPanning] = useState(false)

  const zoomTo = (next: number, view?: Position): void => {
    const el = scrollRef.current
    const target = clampZoom(next)
    if (!el || target === zoomRef.current) return
    const at = view ?? { x: el.clientWidth / 2, y: el.clientHeight / 2 }
    anchor.current = { board: { x: (el.scrollLeft + at.x) / zoomRef.current, y: (el.scrollTop + at.y) / zoomRef.current }, view: at }
    zoomRef.current = target
    setZoom(target)
    onZoomChange?.(target)
  }
  const zoomToRef = useRef(zoomTo)
  useEffect(() => {
    zoomToRef.current = zoomTo
  })

  useLayoutEffect(() => {
    const el = scrollRef.current
    const point = anchor.current
    if (!el || !point) return
    anchor.current = null
    el.scrollLeft = point.board.x * zoom - point.view.x
    el.scrollTop = point.board.y * zoom - point.view.y
  }, [zoom])

  // React's wheel listener is passive, so the page would scroll as well: listen directly.
  useEffect(() => {
    if (!scroller) return
    const onWheel = (event: WheelEvent): void => {
      event.preventDefault()
      const lines = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 400 : 1
      const rect = scroller.getBoundingClientRect()
      zoomToRef.current(zoomRef.current * Math.exp(-event.deltaY * lines * 0.0015), { x: event.clientX - rect.left, y: event.clientY - rect.top })
    }
    scroller.addEventListener('wheel', onWheel, { passive: false })
    return () => scroller.removeEventListener('wheel', onWheel)
  }, [scroller])

  const startPan = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || (event.target instanceof Element && event.target.closest('button'))) return
    pan.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop }
    event.currentTarget.setPointerCapture?.(event.pointerId)
    setPanning(true)
  }
  const movePan = (event: PointerEvent<HTMLDivElement>): void => {
    const current = pan.current
    if (!current || current.pointerId !== event.pointerId) return
    event.currentTarget.scrollLeft = current.left - (event.clientX - current.x)
    event.currentTarget.scrollTop = current.top - (event.clientY - current.y)
  }
  const endPan = (event: PointerEvent<HTMLDivElement>): void => {
    if (pan.current?.pointerId !== event.pointerId) return
    pan.current = null
    setPanning(false)
  }

  useEffect(() => {
    cards.current.get(current)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest', behavior: 'smooth' })
  }, [current])

  if (!show || !config) return null

  const pages = show.pages
  const positions: Position[] = pages.map((page, index) => page.flow ?? { x: 60 + (index % 4) * STEP, y: 80 + Math.floor(index / 4) * LANE })
  const indexOf = new Map(pages.map((page, index) => [page.id, index]))
  const edges: { id: string; source: number; target: number; kind: 'next' | 'order' | 'branch'; from?: Position }[] = []
  pages.forEach((page, index) => {
    const next = config.nextIndices?.[index] ?? null
    if (next !== null) edges.push({ id: `next:${page.id}`, source: index, target: next, kind: page.nextPageId ? 'next' : 'order' })
    page.links?.forEach((link, linkIndex) => {
      const target = indexOf.get(link.pageId)
      if (target === undefined || target === index) return
      edges.push({ id: `${page.id}:${linkIndex}`, source: index, target, kind: 'branch', from: thumbPoint(positions[index], page, link) })
    })
  })
  const frameBoxes: { id: string; name: string; left: number; top: number; width: number; height: number }[] = []
  const members = new Map<string, { name: string; at: Position[] }>()
  pages.forEach((page, index) => {
    if (!page.section) return
    const group = members.get(page.section.id) ?? { name: page.section.name, at: [] }
    group.at.push(positions[index])
    members.set(page.section.id, group)
  })
  members.forEach(({ name, at }, id) => {
    const left = Math.max(0, Math.min(...at.map((p) => p.x)) - 20)
    const top = Math.max(0, Math.min(...at.map((p) => p.y)) - 44)
    frameBoxes.push({ id, name, left, top, width: Math.max(...at.map((p) => p.x)) + CARD_WIDTH + 20 - left, height: Math.max(...at.map((p) => p.y)) + CARD_HEIGHT + 20 - top })
  })
  const width = Math.max(1000, ...positions.map((p) => p.x + CARD_WIDTH + 120))
  const height = Math.max(600, ...positions.map((p) => p.y + CARD_HEIGHT + 120))
  const live = phase === 'live' && !show.state.ended

  const renderEdge = (edge: (typeof edges)[number]) => (
    <path key={edge.id} className={styles[edge.kind]} d={edgePath(positions[edge.source], positions[edge.target], edge.from)} markerEnd={`url(#${marker}-${edge.kind === 'order' ? 'order' : 'link'})`} />
  )

  return (
    <div className={`${styles.root} ${embedded ? styles.embedded : ''}`} data-testid="map-root">
      <header className={styles.header}>
        {!embedded ? <span className={styles.hint}>{t.presenterView.flowMapHint}</span> : null}
        {!embedded ? <span className={styles.legend}>
          <span className={styles.nextKey}>{t.flowBoard.next}</span>
          <span className={styles.orderKey}>{t.flowBoard.slideOrder}</span>
          <span className={styles.branchKey}>{t.flowBoard.objectLink}</span>
        </span> : null}
        <span className={styles.zoom} role="group" aria-label={t.workspace.zoomControls}>
          <button type="button" aria-label={t.workspace.zoomOut} disabled={zoom <= ZOOM_MIN} onClick={() => zoomTo(zoom / ZOOM_STEP)}><Minus size={14} aria-hidden="true" /></button>
          <button type="button" className={styles.zoomLevel} aria-label={`${t.workspace.zoomLevel} ${Math.round(zoom * 100)}%`} data-testid="map-zoom" onClick={() => zoomTo(1)}>{Math.round(zoom * 100)}%</button>
          <button type="button" aria-label={t.workspace.zoomIn} disabled={zoom >= ZOOM_MAX} onClick={() => zoomTo(zoom * ZOOM_STEP)}><Plus size={14} aria-hidden="true" /></button>
        </span>
      </header>
      <div
        ref={attach}
        className={`${styles.scroll} ${panning ? styles.panning : ''}`}
        tabIndex={0}
        aria-label={t.presenterView.flowMap}
        data-testid="map-scroll"
        onPointerDown={startPan}
        onPointerMove={movePan}
        onPointerUp={endPan}
        onPointerCancel={endPan}
        onKeyDown={(event) => {
          if (event.ctrlKey || event.metaKey || event.altKey) return
          if (embedded && event.key.startsWith('Arrow')) {
            event.stopPropagation()
            return
          }
          if (event.key === '+' || event.key === '=') zoomTo(zoom * ZOOM_STEP)
          else if (event.key === '-') zoomTo(zoom / ZOOM_STEP)
          else if (event.key === '0') zoomTo(1)
          else return
          event.preventDefault()
          event.stopPropagation()
        }}
      >
        <div className={styles.space} style={{ width: width * zoom, height: height * zoom }}>
        <div className={styles.board} style={{ width, height, transform: `scale(${zoom})` }}>
          {frameBoxes.map((frame) => (
            <div key={frame.id} className={styles.frame} style={{ left: frame.left, top: frame.top, width: frame.width, height: frame.height }}>
              <span className={styles.frameLabel}>{frame.name}</span>
            </div>
          ))}
          <svg className={styles.edges} width={width} height={height} aria-hidden="true">
            <defs>{(['order', 'link'] as const).map((kind) => <marker key={kind} id={`${marker}-${kind}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M 0 0 L 8 4 L 0 8 z" fill={kind === 'order' ? 'var(--color-text-muted)' : 'var(--color-brand)'} />
            </marker>)}</defs>
            {edges.filter((edge) => edge.kind !== 'branch').map(renderEdge)}
          </svg>
          {pages.map((page, index) => {
            const label = labelOf(page, index)
            const isCurrent = index === current
            return (
              <button
                key={page.id}
                ref={(el) => { if (el) cards.current.set(index, el); else cards.current.delete(index) }}
                type="button"
                className={`${styles.card} ${isCurrent ? styles.current : ''}`}
                style={{ left: positions[index].x, top: positions[index].y }}
                aria-current={isCurrent ? 'true' : undefined}
                aria-label={isCurrent ? `${label}, ${t.presenterView.showingNow}` : `${t.presenterView.showSlide} ${label}`}
                disabled={!live}
                data-testid={`map-card-${index}`}
                onClick={() => { if (!isCurrent) send({ action: 'follow', index }) }}
              >
                <span className={styles.name}>{label}</span>
                <Thumb page={page} frames={frames} request={request} />
              </button>
            )
          })}
          <svg className={`${styles.edges} ${styles.overlay}`} width={width} height={height} aria-hidden="true">
            {edges.filter((edge) => edge.kind === 'branch').map((edge) => <g key={edge.id}>
              {renderEdge(edge)}
              {edge.from ? <circle className={styles.anchor} cx={edge.from.x} cy={edge.from.y} r={4} /> : null}
            </g>)}
          </svg>
        </div>
        </div>
      </div>
    </div>
  )
}
