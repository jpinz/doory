import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setupEditor } from '../../animation/testing'
import { EditorProvider } from '../../EditorProvider'
import type { EditorEngine } from '../../engine/editor'
import { serializeObject } from '../../engine/serialization'
import { t } from '../../strings'
import { DoryDie } from './dice/DoryDie'
import { defaultDie } from './dice/model'
import { DoryWheel } from './wheel/DoryWheel'
import { defaultWheel } from './wheel/model'
import { PageInteractiveControls } from './PageInteractiveControls'

let engine: EditorEngine | null = null
afterEach(() => {
  cleanup()
  engine?.dispose()
  engine = null
  vi.restoreAllMocks()
})

describe('read-only interactive controls', () => {
  it('offers keyboard actions for both wheels and dice on the same page', async () => {
    const wheel = serializeObject(new DoryWheel({ wheel: defaultWheel() }))
    const die = serializeObject(new DoryDie({ die: defaultDie() }))
    const setup = await setupEditor({ mode: 'shared-view', objects: [wheel, die] })
    engine = setup.engine
    const spin = vi.spyOn(engine.wheels, 'spin').mockImplementation(() => undefined)
    const roll = vi.spyOn(engine.dice, 'roll').mockImplementation(() => undefined)
    render(<EditorProvider engine={engine} portalRoot={document.body}><PageInteractiveControls page={engine.state.doc.pages[0]} /></EditorProvider>)
    const user = userEvent.setup()
    screen.getByRole('button', { name: `${t.wheel.spin}: ${t.wheel.name}` }).focus()
    await user.keyboard('{Enter}')
    expect(spin).toHaveBeenCalledWith(setup.pageId, wheel.id)
    screen.getByRole('button', { name: `${t.dice.roll}: ${t.dice.name}` }).focus()
    await user.keyboard('{Enter}')
    expect(roll).toHaveBeenCalledWith(setup.pageId, die.id)
  })
})
