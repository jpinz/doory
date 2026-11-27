import { ChevronDown, ChevronRight, Pencil, Plus, X } from 'lucide-react'
import { useId, useMemo, useState, type DragEvent } from 'react'
import { useLocale } from '@/i18n/useLocale'
import { MAX_PAGES } from '@/types/document'
import { useEditor, useEditorState } from '../context'
import { readSections, sectionGroups, sectionIdOf } from '../engine/sections'
import { t } from '../strings'
import { PageThumb } from './PageThumb'
import { usePageDnd } from './usePageDnd'
import styles from './PageStrip.module.css'

/** The deck's slide timeline: one track row per section, played top to bottom, left to right. */
export function PageStrip() {
  useLocale()
  const editor = useEditor()
  const doc = useEditorState((s) => s.doc)
  const activePageId = useEditorState((s) => s.activePageId)
  const readOnly = useEditorState((s) => s.readOnly)
  const groups = useMemo(() => sectionGroups(doc), [doc])
  const sections = readSections(doc)
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set())
  const [editing, setEditing] = useState<{ id: string | null } | null>(null)
  const [name, setName] = useState('')
  const [previousActive, setPreviousActive] = useState(activePageId)
  const id = useId()
  const activeGroup = groups.find((group) => group.pages.some((page) => page.id === activePageId))
  const activeKey = activeGroup?.key
  const activeSection = sectionIdOf(doc, editor.getPage(activePageId)) ?? ''
  const dnd = usePageDnd((pageId, to, targetId) => editor.pages.move(pageId, to, sectionIdOf(doc, editor.getPage(targetId)) ?? null))
  const order = doc.pages.map((p) => p.id)
  if (previousActive !== activePageId) {
    setPreviousActive(activePageId)
    if (activeKey) setCollapsed((before) => {
      if (!before.has(activeKey)) return before
      const next = new Set(before)
      next.delete(activeKey)
      return next
    })
  }
  const expand = (key: string): void => setCollapsed((before) => {
    const next = new Set(before)
    next.delete(key)
    return next
  })
  const dropInto = (event: DragEvent, sectionId: string | null, key: string): void => {
    // Drops on a thumbnail are positioned by usePageDnd; only empty lane space appends to the track.
    if (readOnly || event.defaultPrevented) return
    const pageId = event.dataTransfer.getData('text/x-doory-page')
    if (!doc.pages.some((page) => page.id === pageId)) return
    event.preventDefault()
    editor.pages.moveToSection(pageId, sectionId)
    expand(key)
  }
  const allowDrop = (event: DragEvent): void => {
    if (!readOnly && event.dataTransfer.types.includes('text/x-doory-page')) event.preventDefault()
  }
  return (
    <nav className={styles.strip} aria-label={t.sections.timeline}>
      <div className={styles.toolbar}>
        <strong>{t.sections.timeline}</strong>
        {readOnly ? null : <>
          <label>{t.sections.move}
            <select value={activeSection} onChange={(event) => editor.pages.moveToSection(activePageId, event.target.value || null)}>
              <option value="">{t.sections.ungrouped}</option>
              {sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
            </select>
          </label>
          <button type="button" title={t.sections.addHint} onClick={() => { setEditing({ id: null }); setName('') }}>{t.sections.add}</button>
        </>}
        {editing && !readOnly ? (
          <form className={styles.form} onSubmit={(event) => {
            event.preventDefault()
            if (!name.trim()) return
            if (editing.id) editor.pages.renameSection(editing.id, name)
            else editor.pages.startSection(activePageId, name)
            setEditing(null)
          }}>
            <input autoFocus aria-label={t.sections.name} value={name} maxLength={200} onChange={(event) => setName(event.target.value)} onKeyDown={(event) => { if (event.key === 'Escape') setEditing(null) }} />
            <button type="submit" disabled={!name.trim()}>{t.sections.save}</button>
            <button type="button" onClick={() => setEditing(null)}>{t.sections.cancel}</button>
          </form>
        ) : null}
      </div>
      <ol className={styles.tracks}>
        {groups.map((group) => {
          const closed = collapsed.has(group.key)
          const sectionName = group.section?.name ?? (sections.length > 0 ? t.sections.ungrouped : t.sections.allSlides)
          const contentId = `${id}-${group.key}`
          const drop = { onDragOver: allowDrop, onDrop: (event: DragEvent) => dropInto(event, group.section?.id ?? null, group.key) }
          return (
            <li key={group.key} className={`${styles.track} ${group.key === activeKey ? styles.active : ''} ${closed ? styles.closed : ''}`}>
              <div className={styles.header} {...drop}>
                <button type="button" className={styles.toggle} aria-expanded={!closed} aria-controls={contentId} onClick={() => setCollapsed((before) => {
                  const next = new Set(before)
                  if (next.has(group.key)) next.delete(group.key)
                  else next.add(group.key)
                  return next
                })}>
                  {closed ? <ChevronRight size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
                  <span>{sectionName}</span>
                </button>
                <small className={styles.count}>{t.sections.count(group.pages.length)}</small>
                {group.section && !readOnly ? <span className={styles.actions}>
                  <button type="button" className={styles.icon} aria-label={`${t.sections.rename}: ${sectionName}`} onClick={() => { setEditing({ id: group.section!.id }); setName(sectionName) }}><Pencil size={12} aria-hidden="true" /></button>
                  <button type="button" className={styles.icon} aria-label={`${t.sections.remove}: ${sectionName}`} onClick={() => editor.pages.removeSection(group.section!.id)}><X size={12} aria-hidden="true" /></button>
                </span> : null}
              </div>
              <ol id={contentId} className={styles.lane} hidden={closed} {...drop}>
                {closed ? null : group.pages.map((page, offset) => {
                  const index = group.start + offset
                  return (
                    <li key={page.id}>
                      <PageThumb page={page} index={index} active={page.id === activePageId} variant="strip" draggable={!readOnly}
                        dragOver={dnd.overFor(page.id)} onSelect={() => editor.pages.activate(page.id)}
                        onMove={(delta) => editor.pages.moveBy(page.id, delta)} {...dnd.handlers(page.id, index, order, true)} />
                    </li>
                  )
                })}
                {closed || readOnly ? null : <li>
                  <button type="button" className={styles.add} disabled={doc.pages.length >= MAX_PAGES} aria-label={`${t.sections.addSlide}: ${sectionName}`} onClick={() => editor.pages.add(group.start + group.pages.length)}>
                    <Plus size={20} aria-hidden="true" />
                  </button>
                </li>}
              </ol>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
