import { describe, expect, it } from 'vitest'
import type { DoryDocument } from '@/types/document'
import { addPage, duplicatePage, movePage, removePage } from './docOps'
import { migrateDocument } from './migrations'
import { moveToSection, readSections, removeSection, renameSection, sectionGroups, startSection } from './sections'

function deck(grouped = true): DoryDocument {
  return {
    schemaVersion: 1, width: 1920, height: 1080, unit: 'px',
    ...(grouped ? { meta: { presetId: 'presentation', sections: [{ id: 'r1', name: 'Round 1' }, { id: 'r2', name: 'Round 2' }] } } : {}),
    pages: ['a', 'b', 'c', 'd'].map((id, index) => ({
      id, background: { type: 'solid', color: '#ffffff' }, objects: [{ id: `o-${id}`, type: 'rect', presentationLink: { pageId: 'c' } }],
      ...(grouped ? { sectionId: index < 2 ? 'r1' : 'r2' } : {}),
    })),
  }
}

describe('slide sections', () => {
  it('starts sections at selected slides while preserving their content and order', () => {
    const original = deck(false)
    const first = startSection(original, 'b', ' Round 1 ')
    const second = startSection(first, 'd', 'Round 2')
    expect(sectionGroups(second).map((group) => [group.section?.name, group.pages.map((page) => page.id)])).toEqual([
      [undefined, ['a']], ['Round 1', ['b', 'c']], ['Round 2', ['d']],
    ])
    expect(second.pages[1].objects).toBe(original.pages[1].objects)
    expect(original.meta).toBeUndefined()
  })

  it('moves slides between sections, preserving stable link destinations', () => {
    const next = moveToSection(deck(), 'b', 'r2')
    expect(sectionGroups(next).map((group) => group.pages.map((page) => page.id))).toEqual([['a'], ['c', 'd', 'b']])
    expect(next.pages[3].objects[0].presentationLink).toEqual({ pageId: 'c' })
    expect(moveToSection(next, 'b', 'missing')).toBe(next)
  })

  it('inherits sections for new and duplicated slides and respects the drag target at a boundary', () => {
    const doc = deck()
    expect(addPage(doc, 2).pages[2].sectionId).toBe('r1')
    expect(duplicatePage(doc, 'c').pages[3].sectionId).toBe('r2')
    expect(movePage(doc, 'b', 1, 'r2').pages.map((page) => page.sectionId)).toEqual(['r1', 'r2', 'r2', 'r2'])
    expect(movePage(doc, 'c', 1).pages.map((page) => page.sectionId)).toEqual(['r1', 'r1', 'r1', 'r2'])
    expect(readSections(removePage(removePage(doc, 'c'), 'd')).map((section) => section.id)).toEqual(['r1'])
  })

  it('renames and removes sections without deleting slides, and survives document reload', () => {
    const doc = renameSection(deck(), 'r2', 'Final round')
    expect(readSections(migrateDocument(JSON.parse(JSON.stringify(doc))))[1].name).toBe('Final round')
    const removed = removeSection(doc, 'r2')
    expect(removed.pages.map((page) => page.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(removed.pages.every((page) => page.sectionId === 'r1')).toBe(true)
    expect(removed.meta?.presetId).toBe('presentation')
    expect(startSection(doc, 'a', ' \0 ')).toBe(doc)
  })
})
