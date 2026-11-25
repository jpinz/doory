import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setupEditor } from '../../../animation/testing'
import { EditorProvider } from '../../../EditorProvider'
import type { EditorEngine } from '../../../engine/editor'
import { t } from '../../../strings'
import { WheelEditor } from './WheelEditor'
import { defaultWheel } from './model'

let engine: EditorEngine | null = null
afterEach(() => {
  cleanup()
  engine?.dispose()
  engine = null
})

async function open() {
  ;({ engine } = await setupEditor())
  await act(() => engine!.wheels.insert())
  const spec = defaultWheel()
  const close = vi.fn()
  const apply = vi.spyOn(engine!.wheels, 'set')
  render(<EditorProvider engine={engine!} portalRoot={document.body}><WheelEditor spec={spec} close={close} /></EditorProvider>)
  return { apply, close }
}

describe('wheel slice controls', () => {
  it('keeps edits as a draft until content, color and percentages can be applied together', async () => {
    const { apply, close } = await open()
    const first = within(screen.getAllByRole('group')[0])
    await userEvent.clear(first.getByLabelText(t.wheel.content))
    expect(screen.getByRole('button', { name: t.wheel.apply })).toBeDisabled()
    await userEvent.type(first.getByLabelText(t.wheel.content), 'Coffee')
    fireEvent.change(first.getByLabelText(t.wheel.color), { target: { value: '#123456' } })
    fireEvent.change(first.getByLabelText(`${t.wheel.percentage} (%)`), { target: { value: '10' } })
    expect(screen.getByRole('button', { name: t.wheel.apply })).toBeDisabled()
    expect(apply).not.toHaveBeenCalled()
    const second = within(screen.getAllByRole('group')[1])
    fireEvent.change(second.getByLabelText(`${t.wheel.percentage} (%)`), { target: { value: '40' } })
    await userEvent.click(screen.getByRole('button', { name: t.wheel.apply }))
    expect(apply).toHaveBeenCalledWith({ slices: expect.arrayContaining([expect.objectContaining({ text: 'Coffee', color: '#123456', percentage: 10 })]) })
    expect(close).toHaveBeenCalledOnce()
  })

  it('adds and removes slices, offers equal percentages, and requires at least two slices', async () => {
    const { apply } = await open()
    await userEvent.click(screen.getByRole('button', { name: t.wheel.addSlice }))
    expect(screen.getAllByRole('group')).toHaveLength(5)
    await userEvent.click(screen.getByRole('button', { name: `${t.wheel.removeSlice} 1` }))
    await userEvent.click(screen.getByRole('button', { name: `${t.wheel.removeSlice} 1` }))
    expect(screen.getByRole('button', { name: t.wheel.apply })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: t.wheel.equalize }))
    await userEvent.click(screen.getByRole('button', { name: t.wheel.apply }))
    expect(apply.mock.calls[0][0].slices.map((slice) => slice.percentage)).toEqual([33.33, 33.33, 33.34])
    await userEvent.click(screen.getByRole('button', { name: `${t.wheel.removeSlice} 1` }))
    expect(screen.getAllByRole('button', { name: new RegExp(t.wheel.removeSlice) }).every((button) => (button as HTMLButtonElement).disabled)).toBe(true)
  })
})
