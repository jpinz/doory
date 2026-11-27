import { newId } from '@/lib/document'
import { type DocPage, type DoryDocument, MAX_PAGES, type SlideSection } from '@/types/document'
import { sanitizeNotes } from '../presenter/pageProps'

const cleanName = (name: string): string => sanitizeNotes(name.slice(0, 200)).trim()

export function readSections(doc: DoryDocument): SlideSection[] {
  const raw = doc.meta?.sections
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const sections: SlideSection[] = []
  for (const section of raw.slice(0, MAX_PAGES)) {
    if (!section || typeof section.id !== 'string' || !section.id || section.id.length > 64 || seen.has(section.id) || typeof section.name !== 'string') continue
    const name = cleanName(section.name)
    if (!name) continue
    seen.add(section.id)
    sections.push(name === section.name ? section : { id: section.id, name })
  }
  return sections
}

export function sectionIdOf(doc: DoryDocument, page?: Pick<DocPage, 'sectionId'>): string | undefined {
  return readSections(doc).some((section) => section.id === page?.sectionId) ? page?.sectionId : undefined
}

export function withSection(page: DocPage, sectionId: string | undefined): DocPage {
  if (page.sectionId === sectionId) return page
  const next = { ...page }
  if (sectionId === undefined) delete next.sectionId
  else next.sectionId = sectionId
  return next
}

function setSections(doc: DoryDocument, sections: SlideSection[]): DoryDocument {
  const before = doc.meta?.sections
  if (before?.length === sections.length && sections.every((section, index) => section === before[index])) return doc
  if (!before && sections.length === 0) return doc
  const meta = { ...doc.meta }
  if (sections.length > 0) meta.sections = sections
  else delete meta.sections
  const next: DoryDocument = { ...doc, meta }
  if (Object.keys(meta).length === 0) delete next.meta
  return next
}

export function trimSections(doc: DoryDocument): DoryDocument {
  const used = new Set(doc.pages.map((page) => page.sectionId))
  return setSections(doc, readSections(doc).filter((section) => used.has(section.id)))
}

export interface SlideSectionGroup {
  key: string
  section: SlideSection | null
  start: number
  pages: DocPage[]
}

/** Runs follow actual deck order, including when concurrent edits split a section. */
export function sectionGroups(doc: DoryDocument): SlideSectionGroup[] {
  const sections = new Map(readSections(doc).map((section) => [section.id, section]))
  const groups: SlideSectionGroup[] = []
  doc.pages.forEach((page, index) => {
    const section = sections.get(page.sectionId ?? '') ?? null
    const previous = groups.at(-1)
    if (previous && previous.section?.id === section?.id) previous.pages.push(page)
    else groups.push({ key: page.id, section, start: index, pages: [page] })
  })
  return groups
}

/** Starts a section at the chosen slide, taking the remainder of its current section. */
export function startSection(doc: DoryDocument, pageId: string, name: string): DoryDocument {
  const clean = cleanName(name)
  const group = sectionGroups(doc).find((candidate) => candidate.pages.some((page) => page.id === pageId))
  const index = doc.pages.findIndex((page) => page.id === pageId)
  if (!clean || !group || index < 0) return doc
  const section = { id: newId(), name: clean }
  const sections = readSections(doc)
  sections.splice(sections.findIndex((candidate) => candidate.id === group.section?.id) + 1, 0, section)
  const pages = doc.pages.map((page, i) => i >= index && i < group.start + group.pages.length ? withSection(page, section.id) : page)
  const used = new Set(pages.map((page) => page.sectionId))
  return setSections({ ...doc, pages }, sections.filter((candidate) => used.has(candidate.id)))
}

export function renameSection(doc: DoryDocument, sectionId: string, name: string): DoryDocument {
  const clean = cleanName(name)
  if (!clean) return doc
  return setSections(doc, readSections(doc).map((section) => section.id === sectionId && section.name !== clean ? { ...section, name: clean } : section))
}

/** Removes the separator, merging its slides into the preceding section without deleting slides. */
export function removeSection(doc: DoryDocument, sectionId: string): DoryDocument {
  if (!readSections(doc).some((section) => section.id === sectionId)) return doc
  const index = doc.pages.findIndex((page) => page.sectionId === sectionId)
  const preceding = index > 0 ? sectionIdOf(doc, doc.pages[index - 1]) : undefined
  const pages = doc.pages.map((page) => page.sectionId === sectionId ? withSection(page, preceding) : page)
  return setSections({ ...doc, pages }, readSections(doc).filter((section) => section.id !== sectionId))
}

export function moveToSection(doc: DoryDocument, pageId: string, sectionId: string | null): DoryDocument {
  const page = doc.pages.find((candidate) => candidate.id === pageId)
  if (!page || (sectionId !== null && !readSections(doc).some((section) => section.id === sectionId))) return doc
  const target = sectionId ?? undefined
  if (sectionIdOf(doc, page) === target) return doc
  const pages = doc.pages.filter((candidate) => candidate.id !== pageId)
  let at = 0
  pages.forEach((candidate, index) => { if (sectionIdOf(doc, candidate) === target) at = index + 1 })
  pages.splice(at, 0, withSection(page, target))
  return trimSections({ ...doc, pages })
}

/** Moves a contiguous run of slides (one timeline track) as a block before `beforeId`, or to the end. */
export function moveRun(doc: DoryDocument, firstId: string, count: number, beforeId: string | null): DoryDocument {
  const from = doc.pages.findIndex((page) => page.id === firstId)
  if (from < 0 || count < 1) return doc
  const run = doc.pages.slice(from, from + count)
  if (beforeId && run.some((page) => page.id === beforeId)) return doc
  const pages = [...doc.pages.slice(0, from), ...doc.pages.slice(from + count)]
  const at = beforeId ? pages.findIndex((page) => page.id === beforeId) : pages.length
  if (at < 0 || at === from) return doc
  pages.splice(at, 0, ...run)
  return { ...doc, pages }
}
