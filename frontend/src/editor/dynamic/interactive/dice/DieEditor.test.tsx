import { act, cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setupEditor } from '../../../animation/testing'
import { EditorProvider } from '../../../EditorProvider'
import type { EditorEngine } from '../../../engine/editor'
import { t } from '../../../strings'
import { DieEditor } from './DieEditor'
import { defaultDie } from './model'

let engine: EditorEngine | null = null
afterEach(() => {
  cleanup()
  engine?.dispose()
  engine = null
})

describe('die controls', () => {
  it('applies numbered dice and editable symbolic faces', async () => {
    ;({ engine } = await setupEditor())
    await act(() => engine!.dice.insert())
    const close = vi.fn()
    const apply = vi.spyOn(engine.dice, 'set')
    render(<EditorProvider engine={engine} portalRoot={document.body}><DieEditor spec={defaultDie()} close={close} /></EditorProvider>)
    await userEvent.selectOptions(screen.getByLabelText(t.dice.sides), '20')
    await userEvent.click(screen.getByRole('button', { name: t.dice.apply }))
    expect(apply).toHaveBeenCalledWith({ kind: 'number', sides: 20, color: '#ffffff' })
    expect(screen.queryByRole('switch', { name: t.dice.pips })).toBeNull()
    await userEvent.selectOptions(screen.getByLabelText(t.dice.sides), '6')
    await userEvent.click(screen.getByRole('switch', { name: t.dice.pips }))
    await userEvent.click(screen.getByRole('button', { name: t.dice.apply }))
    expect(apply).toHaveBeenLastCalledWith({ kind: 'number', sides: 6, pips: true, color: '#ffffff' })
    await userEvent.selectOptions(screen.getByLabelText(t.dice.type), 'symbol')
    const first = within(screen.getAllByRole('group')[0])
    await userEvent.selectOptions(first.getByLabelText(t.dice.shape), '★')
    await userEvent.clear(first.getByLabelText(t.dice.symbol))
    await userEvent.type(first.getByLabelText(t.dice.symbol), 'Win')
    await userEvent.click(screen.getByRole('button', { name: t.dice.addFace }))
    await userEvent.click(screen.getByRole('button', { name: t.dice.apply }))
    expect(apply).toHaveBeenLastCalledWith(expect.objectContaining({ kind: 'symbol', faces: expect.arrayContaining([expect.objectContaining({ text: 'Win' }), expect.objectContaining({ text: '' })]) }))
    expect(close).toHaveBeenCalledTimes(3)
  })
})
