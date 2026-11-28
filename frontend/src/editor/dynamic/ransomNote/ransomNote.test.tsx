import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Group } from 'fabric'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setupEditor } from '../../animation/testing'
import { EditorProvider } from '../../EditorProvider'
import type { EditorEngine } from '../../engine/editor'
import { deserializeObjects, serializeObject } from '../../engine/serialization'
import { t } from '../../strings'
import { DoryRansomNote, notePreviewSvg } from './DoryRansomNote'
import { defaultRansomNote, MAX_NOTE_LENGTH, noteLayout, readRansomNote } from './model'
import { noteLink, readNoteLink } from './link'
import { RansomNoteSection } from './RansomNoteSection'

let engine: EditorEngine | null = null
afterEach(() => {
  cleanup()
  engine?.dispose()
  engine = null
  vi.restoreAllMocks()
})

describe('ransom note', () => {
  it('keeps a deterministic layout, wraps words and rejects invalid specs', () => {
    const spec = { text: 'one two three four five six seven\n<&', seed: 42, letterCase: 'typed' as const, chaos: 0 }
    const layout = noteLayout(spec)
    expect(noteLayout(spec)).toEqual(layout)
    expect(noteLayout({ ...spec, seed: 43 }).tiles).not.toEqual(layout.tiles)
    const letters = layout.tiles.filter((tile) => tile.text !== '<' && tile.text !== '&')
    expect(new Set(letters.map((tile) => tile.y)).size).toBeGreaterThan(1)
    expect(new Set(letters.slice(-5).map((tile) => tile.y)).size).toBe(1)
    expect(layout.tiles.find((tile) => tile.text === '<')!.y).toBeGreaterThan(Math.max(...letters.map((tile) => tile.y)))
    expect(readRansomNote({ text: ' ', seed: 1 })).toBeNull()
    expect(readRansomNote({ text: 'x'.repeat(MAX_NOTE_LENGTH + 1), seed: 1 })).toBeNull()
    expect(readRansomNote({ text: 'ok', seed: -1 })).toBeNull()
    expect(readRansomNote({ ...spec, fonts: [] })).toBeNull()
    expect(readRansomNote({ ...spec, colors: ['unknown'] })).toBeNull()
    expect(readRansomNote({ ...spec, chaos: 101 })).toBeNull()
  })

  it('fits paper to glyphs and varies cut angles, sizes and edge shapes', () => {
    const spec = { text: 'iW', seed: 42, letterCase: 'typed' as const, chaos: 0, fonts: ['sans' as const] }
    const layout = noteLayout(spec)
    expect(layout.tiles[0].width).toBeLessThan(layout.tiles[1].width)
    expect(layout.tiles.every((tile) => tile.angle === 0)).toBe(true)
    const chaotic = noteLayout({ ...spec, text: 'Different letters', chaos: 100 })
    expect(chaotic.tiles.some((tile) => Math.abs(tile.angle) > 8)).toBe(true)
    expect(new Set(chaotic.tiles.map((tile) => tile.size)).size).toBeGreaterThan(1)
    expect(noteLayout({ ...spec, edge: 'torn' }).tiles[0].points.length).toBeGreaterThan(layout.tiles[0].points.length)
    const roundedSvg = notePreviewSvg({ ...spec, edge: 'rounded', shadow: 0 })
    expect(roundedSvg).toContain(' Q ')
    expect(roundedSvg).not.toContain('feDropShadow')
    expect(notePreviewSvg({ ...spec, shadow: 100 })).toContain('feDropShadow')
  })

  it('round-trips inside groups and exports escaped letters as SVG', async () => {
    const spec = { text: 'A<&\nB', seed: 7, letterCase: 'typed' as const }
    const layout = noteLayout(spec)
    const group = new Group([new DoryRansomNote({ ransomNote: spec, width: layout.width, height: layout.height })])
    const json = serializeObject(group)
    const [restored] = await deserializeObjects([json], { resolveSrc: async (src) => src, ensureFonts: async () => undefined })
    const child = (restored as Group).getObjects()[0]
    expect(child).toBeInstanceOf(DoryRansomNote)
    expect(serializeObject(restored)).toEqual(json)
    const svg = child.toSVG()
    expect(svg).toContain('&lt;')
    expect(svg).toContain('&amp;')
    expect(svg.match(/<path /g)).toHaveLength(4)
    const ctx = document.createElement('canvas').getContext('2d')!
    const drawText = vi.spyOn(ctx, 'fillText')
    ;(child as DoryRansomNote)._render(ctx)
    expect(drawText.mock.calls.map(([text]) => text)).toEqual(['A', '<', '&', 'B'])
    group.dispose()
    restored.dispose()
  })

  it('applies every appearance control and copies a reproducible note link', async () => {
    const user = userEvent.setup()
    const copy = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    ;({ engine } = await setupEditor())
    await act(() => engine!.ransomNotes.insert())
    const before = engine.state.doc
    render(<EditorProvider engine={engine} portalRoot={document.body}><RansomNoteSection /></EditorProvider>)
    await user.click(screen.getByRole('button', { name: t.ransomNote.edit }))
    const seed = screen.getByLabelText(t.ransomNote.seed)
    fireEvent.change(seed, { target: { value: '123456' } })
    for (const [label, value] of [[t.ransomNote.chaos, 85], [t.ransomNote.letterSize, 120], [t.ransomNote.gap, 12], [t.ransomNote.shadow, 75]] as const) {
      fireEvent.change(screen.getByLabelText(label), { target: { value } })
    }
    await user.click(screen.getByRole('radio', { name: t.ransomNote.cases.lower }))
    await user.click(screen.getByRole('radio', { name: t.ransomNote.edges.torn }))
    await user.click(screen.getByRole('button', { name: t.ransomNote.colorNames.red }))
    await user.click(screen.getByRole('button', { name: t.ransomNote.fontNames.mono }))
    expect(engine.state.doc).toBe(before)
    await user.click(screen.getByRole('button', { name: t.ransomNote.copyLink }))
    expect(copy).toHaveBeenCalledOnce()
    const copied = readNoteLink(new URL(copy.mock.calls[0][0]).hash)!
    expect(copied).toMatchObject({ seed: 123456, chaos: 85, letterSize: 120, gap: 12, shadow: 75, letterCase: 'lower', edge: 'torn' })
    expect(copied.colors).not.toContain('red')
    expect(copied.fonts).not.toContain('mono')
    await user.click(screen.getByRole('button', { name: t.ransomNote.apply }))
    expect(engine.state.doc.pages[0].objects[0].ransomNote).toEqual(copied)
    await user.click(screen.getByRole('button', { name: t.ransomNote.edit }))
    await user.click(screen.getByRole('button', { name: t.ransomNote.reset }))
    await user.click(screen.getByRole('button', { name: t.ransomNote.apply }))
    expect(engine.state.doc.pages[0].objects[0].ransomNote).toEqual(defaultRansomNote(t.ransomNote.sample))
  }, 10_000)

  it('round-trips Unicode links without putting the message in the query string', () => {
    const spec = { ...defaultRansomNote('Hello # <& 字'), edge: 'rounded' as const }
    const link = new URL(noteLink(spec, 'https://doory.example'))
    expect(link.search).toBe('')
    expect(readNoteLink(link.hash)).toEqual(spec)
    expect(readNoteLink('#ransom-note=%broken')).toBeNull()
    expect(readNoteLink('#ransom-note={}')).toBeNull()
  })

  it('inserts, edits and shuffles a note with undo and duplicate support', async () => {
    ;({ engine } = await setupEditor())
    await act(() => engine!.ransomNotes.insert())
    expect(engine.state.selection.kinds).toEqual(['ransom-note'])
    const original = readRansomNote(engine.state.doc.pages[0].objects[0].ransomNote)!
    render(<EditorProvider engine={engine} portalRoot={document.body}><RansomNoteSection /></EditorProvider>)
    await userEvent.click(screen.getByRole('button', { name: t.ransomNote.edit }))
    const input = screen.getByLabelText(t.ransomNote.message)
    await userEvent.clear(input)
    await userEvent.type(input, 'Find the key')
    await userEvent.click(screen.getByRole('button', { name: t.ransomNote.apply }))
    expect(engine.state.doc.pages[0].objects[0].ransomNote).toEqual({ ...original, text: 'Find the key' })
    await userEvent.click(screen.getByRole('button', { name: t.ransomNote.shuffle }))
    const shuffled = readRansomNote(engine.state.doc.pages[0].objects[0].ransomNote)!
    expect(shuffled.seed).not.toBe(original.seed)
    await act(() => engine!.undo())
    expect(engine.state.doc.pages[0].objects[0].ransomNote).toEqual({ ...original, text: 'Find the key' })
    await act(() => engine!.redo())
    await act(() => engine!.arrange.duplicate())
    await waitFor(() => expect(engine!.state.doc.pages[0].objects).toHaveLength(2))
    expect(engine.state.doc.pages[0].objects[1].ransomNote).toEqual(shuffled)
  })

  it('does not let shared viewers change a note', async () => {
    const spec = { text: 'hello', seed: 1 }
    const layout = noteLayout(spec)
    const object = serializeObject(new DoryRansomNote({ ransomNote: spec, width: layout.width, height: layout.height }))
    ;({ engine } = await setupEditor({ mode: 'shared-view', objects: [object] }))
    const doc = engine.state.doc
    expect(engine.ransomNotes.set({ ...spec, text: 'changed' })).toBe(false)
    engine.ransomNotes.shuffle()
    expect(engine.state.doc).toBe(doc)
  })
})
