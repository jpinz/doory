import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { useLocale } from '@/i18n/useLocale'
import { type DocPage, MAX_PAGES } from '@/types/document'
import { useDocument, useEditor, useEditorState } from '../context'
import { objectCenter } from '../engine/magicResize'
import { readSections, sectionGroups } from '../engine/sections'
import { useInView } from '../hooks/useInView'
import { resolveNextIndices } from '../presenter/navigation'
import { t } from '../strings'
import { usePageSnapshot } from '../workspace/useSnapshot'
import { bounded, CARD_HEIGHT, CARD_TOP, CARD_WIDTH, clamp, edgePath, LANE, type Position, positionOf, type Slot, slotsOf, STEP, thumbPoint } from './layout'
import styles from './FlowBoard.module.css'

const END = '__end__'
const GROUPING_KEY = 'doory.flowGrouping'
type Grouping = 'frames' | 'lanes'
type GroupShift = { kind: 'frame' | 'lane'; id: string; delta: Position }
type GroupDrag = GroupShift & { pointerId: number; client: Position; scroll: Position }
type Drag = { id: string; pointerId: number; client: Position; start: Position; scroll: Position; latest: Position }

function readGrouping(): Grouping {
  try { return localStorage.getItem(GROUPING_KEY) === 'lanes' ? 'lanes' : 'frames' } catch { return 'frames' }
}

function labelOf(page: DocPage, index: number): string {
  return typeof page.name === 'string' && page.name.trim() ? page.name.trim() : `${t.flowBoard.slide} ${index + 1}`
}

function SlidePicture({ page }: { page: DocPage }) {
  const editor = useEditor()
  const [ref, seen] = useInView<HTMLSpanElement>()
  const url = usePageSnapshot(page, editor.pageSizeOf(page.id), seen)
  return <span ref={ref} className={styles.picture}>{url ? <img src={url} alt="" draggable={false} /> : null}</span>
}

export function FlowBoard({ onEdit }: { onEdit: (pageId: string) => void }) {
  useLocale()
  const editor = useEditor()
  const doc = useDocument()
  const activePageId = useEditorState((s) => s.activePageId)
  const readOnly = useEditorState((s) => s.readOnly)
  const scrollRef = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const [preview, setPreview] = useState<(Position & { id: string }) | null>(null)
  const [connecting, setConnecting] = useState<string | null>(null)
  const [grouping, setGrouping] = useState<Grouping>(readGrouping)
  const groupDrag = useRef<GroupDrag | null>(null)
  const [shift, setShift] = useState<GroupShift | null>(null)
  const marker = useId().replace(/:/g, '')
  const lanes = grouping === 'lanes'
  const groups = sectionGroups(doc)
  const sections = readSections(doc)
  const slots: Map<string, Slot> = slotsOf(doc)
  // Lanes lay cards out in deck order, like the timeline's tracks; frames keep the free arrangement.
  const home = (page: DocPage, index: number): Position => {
    const slot = slots.get(page.id) ?? { group: 0, offset: index }
    if (lanes) return { x: 60 + slot.offset * STEP, y: CARD_TOP + slot.group * LANE }
    return positionOf(page, index, sections.length > 0 ? slot : undefined)
  }
  const selected = doc.pages.find((page) => page.id === activePageId) ?? doc.pages[0]
  const source = doc.pages.find((page) => page.id === connecting)
  // A section being dragged moves all of its cards: the frame in any direction, a lane only vertically.
  const shifted = (page: DocPage, position: Position): Position => {
    if (shift?.kind === 'frame' && page.sectionId === shift.id) return bounded({ x: position.x + shift.delta.x, y: position.y + shift.delta.y })
    if (shift?.kind === 'lane' && groups[slots.get(page.id)?.group ?? -1]?.key === shift.id) return { x: position.x, y: Math.max(0, position.y + shift.delta.y) }
    return position
  }
  const positions = doc.pages.map((page, index) => preview?.id === page.id ? preview : shifted(page, home(page, index)))
  const nextIndices = resolveNextIndices(doc.pages)
  const width = Math.max(1300, ...positions.map((position) => position.x + CARD_WIDTH + 120))
  const height = Math.max(800, lanes ? groups.length * LANE : 0, ...positions.map((position) => position.y + CARD_HEIGHT + 120))
  const frames = lanes ? [] : sections.flatMap((section) => {
    const members = positions.filter((_, index) => doc.pages[index].sectionId === section.id)
    if (members.length === 0) return []
    const left = Math.max(0, Math.min(...members.map((position) => position.x)) - 20)
    const top = Math.max(0, Math.min(...members.map((position) => position.y)) - 44)
    return [{
      section, left, top,
      width: Math.max(...members.map((position) => position.x)) + CARD_WIDTH + 20 - left,
      height: Math.max(...members.map((position) => position.y)) + CARD_HEIGHT + 20 - top,
    }]
  })
  const laneName = (groupIndex: number): string => groups[groupIndex].section?.name ?? (sections.length > 0 ? t.sections.ungrouped : t.sections.allSlides)

  /** Moves a slide to `slot` within lane `groupIndex`, taking that lane's section. */
  const placeInLane = (pageId: string, groupIndex: number, slot: number): void => {
    const group = groups[groupIndex]
    const lane = group.pages.filter((page) => page.id !== pageId)
    if (lane.length === 0) return
    const rest = doc.pages.filter((page) => page.id !== pageId)
    const to = slot < lane.length ? rest.indexOf(lane[slot]) : rest.indexOf(lane[lane.length - 1]) + 1
    editor.pages.move(pageId, to, group.section?.id ?? null)
  }
  const selectedNext = selected?.presentationNext
  const targetValue = selectedNext === null ? END : typeof selectedNext === 'string' && doc.pages.some((page) => page.id === selectedNext) ? `slide:${selectedNext}` : ''
  const edges: { id: string; source: number; target: number; kind: 'next' | 'order' | 'branch'; from?: Position }[] = []
  doc.pages.forEach((page, index) => {
    const next = nextIndices[index]
    if (next !== null) edges.push({ id: `next:${page.id}`, source: index, target: next, kind: page.presentationNext === doc.pages[next].id ? 'next' : 'order' })
    const size = editor.pageSizeOf(page.id)
    for (const object of page.objects) {
      if (object.visible === false) continue
      const pageId = object.presentationLink?.pageId
      const target = pageId ? doc.pages.findIndex((candidate) => candidate.id === pageId) : -1
      if (target < 0 || target === index) continue
      // Each linked element gets its own arrow, starting where it sits on the card's thumbnail.
      const center = objectCenter(object)
      const from = thumbPoint(positions[index], size, { x: center.x / size.width, y: center.y / size.height })
      edges.push({ id: `${page.id}:${object.id}`, source: index, target, kind: 'branch', from })
    }
  })

  const moveFrame = (sectionId: string, delta: Position): void => {
    const moved = new Map<string, Position>()
    doc.pages.forEach((page, index) => {
      if (page.sectionId !== sectionId) return
      const position = home(page, index)
      moved.set(page.id, bounded({ x: position.x + delta.x, y: position.y + delta.y }))
    })
    editor.pages.setFlowPositions(moved)
  }

  const moveLane = (from: number, to: number): void => {
    if (from === to || to < 0 || to >= groups.length) return
    const group = groups[from]
    editor.pages.moveRun(group.key, group.pages.length, to < from ? groups[to].key : groups[to + 1]?.key ?? null)
  }

  const groupHandle = (kind: GroupShift['kind'], id: string, name: string) => ({
    type: 'button' as const,
    className: styles.groupLabel,
    title: t.flowBoard.moveSectionHint,
    'aria-label': `${t.flowBoard.moveSection}: ${name}`,
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      if (readOnly || source || event.button !== 0) return
      groupDrag.current = {
        kind, id, delta: { x: 0, y: 0 }, pointerId: event.pointerId, client: { x: event.clientX, y: event.clientY },
        scroll: { x: scrollRef.current?.scrollLeft ?? 0, y: scrollRef.current?.scrollTop ?? 0 },
      }
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    onPointerMove: (event: PointerEvent<HTMLButtonElement>) => {
      const current = groupDrag.current
      if (!current || current.pointerId !== event.pointerId) return
      current.delta = {
        x: kind === 'lane' ? 0 : event.clientX - current.client.x + (scrollRef.current?.scrollLeft ?? 0) - current.scroll.x,
        y: event.clientY - current.client.y + (scrollRef.current?.scrollTop ?? 0) - current.scroll.y,
      }
      setShift({ kind, id, delta: current.delta })
    },
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
      const current = groupDrag.current
      if (!current || current.pointerId !== event.pointerId) return
      groupDrag.current = null
      setShift(null)
      event.currentTarget.releasePointerCapture(event.pointerId)
      if (current.delta.x === 0 && current.delta.y === 0) return
      if (kind === 'frame') moveFrame(id, current.delta)
      else {
        const from = groups.findIndex((group) => group.key === id)
        moveLane(from, clamp(from + Math.round(current.delta.y / LANE), 0, groups.length - 1))
      }
    },
    onPointerCancel: () => { groupDrag.current = null; setShift(null) },
    onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => {
      if (readOnly || source || !event.key.startsWith('Arrow')) return
      event.preventDefault()
      const vertical = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
      if (kind === 'lane') {
        const from = groups.findIndex((group) => group.key === id)
        if (vertical !== 0) moveLane(from, from + vertical)
        return
      }
      const step = event.shiftKey ? 50 : 10
      moveFrame(id, { x: vertical === 0 ? (event.key === 'ArrowLeft' ? -step : step) : 0, y: vertical * step })
    },
  })

  const renderEdge = (edge: (typeof edges)[number]) => (
    <path key={edge.id} className={styles[edge.kind]} d={edgePath(positions[edge.source], positions[edge.target], edge.from)} markerEnd={`url(#${marker}-${edge.kind === 'order' ? 'order' : 'link'})`}>
      <title>{`${labelOf(doc.pages[edge.source], edge.source)} -> ${labelOf(doc.pages[edge.target], edge.target)} (${edge.kind === 'branch' ? t.flowBoard.objectLink : edge.kind === 'order' ? t.flowBoard.slideOrder : t.flowBoard.next})`}</title>
    </path>
  )

  const choose = (pageId: string): void => {
    if (source && !readOnly && source.id !== pageId) {
      editor.pages.setPresentationNext(source.id, pageId)
      setConnecting(null)
    } else if (!source) editor.pages.activate(pageId, false)
  }

  const startDrag = (event: PointerEvent<HTMLButtonElement>, page: DocPage, index: number): void => {
    if (readOnly || source || event.button !== 0) return
    editor.pages.activate(page.id, false)
    const start = home(page, index)
    drag.current = {
      id: page.id, pointerId: event.pointerId, client: { x: event.clientX, y: event.clientY }, start, latest: start,
      scroll: { x: scrollRef.current?.scrollLeft ?? 0, y: scrollRef.current?.scrollTop ?? 0 },
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveDrag = (event: PointerEvent<HTMLButtonElement>): void => {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    current.latest = bounded({
      x: current.start.x + event.clientX - current.client.x + (scrollRef.current?.scrollLeft ?? 0) - current.scroll.x,
      y: current.start.y + event.clientY - current.client.y + (scrollRef.current?.scrollTop ?? 0) - current.scroll.y,
    })
    setPreview({ id: current.id, ...current.latest })
  }

  const endDrag = (event: PointerEvent<HTMLButtonElement>): void => {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    if (current.latest.x !== current.start.x || current.latest.y !== current.start.y) {
      if (lanes) {
        const groupIndex = clamp(Math.floor((current.latest.y + CARD_HEIGHT / 2) / LANE), 0, groups.length - 1)
        const others = groups[groupIndex].pages.filter((page) => page.id !== current.id).length
        placeInLane(current.id, groupIndex, clamp(Math.round((current.latest.x - 60) / STEP), 0, others))
      } else editor.pages.setFlowPosition(current.id, current.latest)
    }
    drag.current = null
    setPreview(null)
    event.currentTarget.releasePointerCapture(event.pointerId)
  }

  return (
    <section className={styles.root} aria-label={t.flowBoard.flow} onKeyDown={(event) => {
      if (event.key === 'Escape') {
        setConnecting(null)
        return
      }
      if (!event.ctrlKey && !event.metaKey) return
      if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"]')) return
      const key = event.key.toLowerCase()
      if (key === 'z' || key === 'y') {
        event.preventDefault()
        if (key === 'y' || event.shiftKey) void editor.redo()
        else void editor.undo()
      } else if (key === 's') {
        event.preventDefault()
        void editor.persistence.saveNow()
      }
    }}>
      <div className={styles.toolbar}>
        {selected ? <>
          <strong className={styles.selected}>{labelOf(selected, doc.pages.indexOf(selected))}</strong>
          <button type="button" onClick={() => onEdit(selected.id)}>{t.flowBoard.editSlide}</button>
          <label>{t.flowBoard.next}
            <select disabled={readOnly} value={targetValue} onChange={(event) => {
              const value = event.target.value
              editor.pages.setPresentationNext(selected.id, value === '' ? undefined : value === END ? null : value.slice(6))
              setConnecting(null)
            }}>
              <option value="">{t.flowBoard.slideOrder}</option>
              <option value={END}>{t.flowBoard.end}</option>
              {doc.pages.filter((page) => page.id !== selected.id).map((page) => <option key={page.id} value={`slide:${page.id}`}>{labelOf(page, doc.pages.indexOf(page))}</option>)}
            </select>
          </label>
        </> : null}
        <button type="button" disabled={readOnly || doc.pages.length >= MAX_PAGES} onClick={() => editor.pages.add(doc.pages.length)}>{t.flowBoard.addSlide}</button>
        <div className={styles.grouping} role="group" aria-label={t.flowBoard.grouping}>
          {(['frames', 'lanes'] as const).map((mode) => <button key={mode} type="button" aria-pressed={grouping === mode} onClick={() => {
            setGrouping(mode)
            try { localStorage.setItem(GROUPING_KEY, mode) } catch { /* Storage may be disabled. */ }
          }}>{t.flowBoard[mode]}</button>)}
        </div>
      </div>
      <div className={styles.legend}>
        <span className={styles.nextKey}>{t.flowBoard.next}</span>
        <span className={styles.orderKey}>{t.flowBoard.slideOrder}</span>
        <span className={styles.branchKey}>{t.flowBoard.objectLink}</span>
      </div>
      <div className={styles.hint} role="status">
        {source ? `${t.flowBoard.chooseDestination} ${labelOf(source, doc.pages.indexOf(source))}` : lanes ? t.flowBoard.lanesHint : t.flowBoard.hint}
        {source ? <button type="button" onClick={() => setConnecting(null)}>{t.flowBoard.cancel}</button> : null}
      </div>
      <div ref={scrollRef} className={styles.scroll} tabIndex={0}>
        <div className={styles.board} style={{ width, height }}>
          {lanes ? groups.map((group, groupIndex) => (
            <div key={group.key} className={`${styles.lane} ${shift?.id === group.key ? styles.dragging : ''}`} style={{ top: groupIndex * LANE + (shift?.kind === 'lane' && shift.id === group.key ? shift.delta.y : 0), height: LANE }}>
              <button {...groupHandle('lane', group.key, laneName(groupIndex))}>{laneName(groupIndex)} · {t.sections.count(group.pages.length)}</button>
            </div>
          )) : frames.map((frame) => (
            <div key={frame.section.id} className={`${styles.frame} ${shift?.id === frame.section.id ? styles.dragging : ''}`} style={{ left: frame.left, top: frame.top, width: frame.width, height: frame.height }}>
              <button {...groupHandle('frame', frame.section.id, frame.section.name)}>{frame.section.name}</button>
            </div>
          ))}
          <svg className={styles.edges} width={width} height={height} aria-label={t.flowBoard.connections} role="img">
            <defs>{(['order', 'link'] as const).map((kind) => <marker key={kind} id={`${marker}-${kind}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M 0 0 L 8 4 L 0 8 z" fill={kind === 'order' ? 'var(--ed-text-dim)' : 'var(--ed-accent)'} />
            </marker>)}</defs>
            {edges.filter((edge) => edge.kind !== 'branch').map(renderEdge)}
          </svg>
          {doc.pages.map((page, index) => {
            const label = labelOf(page, index)
            return (
              <article key={page.id} className={`${styles.card} ${page.id === selected?.id ? styles.active : ''} ${source && page.id !== source.id ? styles.destination : ''}`} style={{ left: positions[index].x, top: positions[index].y }} aria-label={label}>
                <button type="button" className={styles.handle} title={t.flowBoard.moveHint} onClick={() => choose(page.id)}
                  onPointerDown={(event) => startDrag(event, page, index)} onPointerMove={moveDrag} onPointerUp={endDrag}
                  onPointerCancel={() => { drag.current = null; setPreview(null) }}
                  onKeyDown={(event) => {
                    if (readOnly || source || !event.key.startsWith('Arrow')) return
                    event.preventDefault()
                    editor.pages.activate(page.id, false)
                    if (lanes) {
                      const slot = slots.get(page.id)
                      if (!slot) return
                      const vertical = event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0
                      if (vertical !== 0) {
                        const target = slot.group + vertical
                        if (target >= 0 && target < groups.length) placeInLane(page.id, target, Math.min(slot.offset, groups[target].pages.length))
                      } else {
                        const offset = slot.offset + (event.key === 'ArrowLeft' ? -1 : 1)
                        if (offset >= 0 && offset < groups[slot.group].pages.length) placeInLane(page.id, slot.group, offset)
                      }
                      return
                    }
                    const position = home(page, index)
                    const step = event.shiftKey ? 50 : 10
                    editor.pages.setFlowPosition(page.id, {
                      x: position.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0),
                      y: position.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0),
                    })
                  }}>{label}</button>
                <button type="button" className={styles.thumbnail} aria-label={`${source ? t.flowBoard.chooseDestination : t.flowBoard.selectSlide} ${label}`}
                  onClick={() => choose(page.id)} onDoubleClick={() => { if (!source) onEdit(page.id) }}>
                  <SlidePicture page={page} />
                </button>
                <button type="button" className={styles.connect} disabled={readOnly} aria-pressed={connecting === page.id}
                  aria-label={`${t.flowBoard.connect}: ${label}`} onClick={() => { editor.pages.activate(page.id, false); setConnecting(connecting === page.id ? null : page.id) }}>{t.flowBoard.connect}</button>
              </article>
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
    </section>
  )
}
