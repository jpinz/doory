import { screen } from '@testing-library/react'
import { useState } from 'react'
import userEvent from '@testing-library/user-event'
import { useLocation } from 'react-router-dom'
import { buildCatalogue, setSizePresetsForTests, type SizePresetCatalogue } from '@/lib/sizePresets'
import { renderWithProviders } from '@/test/utils'
import { CreateDesignDialog } from './CreateDesignDialog'

const catalogue = buildCatalogue({
  version: 1,
  groups: [
    { slug: 'presentation', label: 'Presentations', children: [
      { slug: 'screen', label: 'Screen slides', presets: [
        { slug: 'classroom', label: 'Classroom deck', width: 1920, height: 1080, unit: 'px' },
        { slug: 'classic', label: 'Classic deck', width: 1024, height: 768, unit: 'px' },
      ] },
    ] },
    { slug: 'print', label: 'Print', presets: [{ slug: 'poster', label: 'Poster', width: 1200, height: 1800 }] },
  ],
}) as SizePresetCatalogue

function Location() {
  const { pathname, search } = useLocation()
  return <output data-testid="location">{pathname + search}</output>
}

describe('Create a presentation dialog', () => {
  beforeEach(() => setSizePresetsForTests(catalogue))

  it('offers only presentation formats, including server-defined ones', () => {
    renderWithProviders(<CreateDesignDialog open onClose={() => undefined} />)
    expect(screen.getByRole('button', { name: /Classroom deck/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Classic deck/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Poster/ })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Create presentation' })).toBeDisabled()
  })

  it('creates the selected slide format', async () => {
    renderWithProviders(<><CreateDesignDialog open onClose={() => undefined} /><Location /></>)
    await userEvent.click(screen.getByRole('button', { name: /Classic deck/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Create presentation' }))
    expect(screen.getByTestId('location')).toHaveTextContent('/create?preset=classic')
  })

  it('creates a format on double click', async () => {
    renderWithProviders(<><CreateDesignDialog open onClose={() => undefined} /><Location /></>)
    await userEvent.dblClick(screen.getByRole('button', { name: /Classroom deck/ }))
    expect(screen.getByTestId('location')).toHaveTextContent('/create?preset=classroom')
  })

  it('opens again with nothing selected', async () => {
    function Host() {
      const [open, setOpen] = useState(true)
      return <><button type="button" onClick={() => setOpen(true)}>Open</button><CreateDesignDialog open={open} onClose={() => setOpen(false)} /></>
    }
    renderWithProviders(<Host />)
    await userEvent.click(screen.getByRole('button', { name: /Classic deck/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Open' }))
    expect(await screen.findByRole('button', { name: 'Create presentation' })).toBeDisabled()
  })

  it('starts custom slides at 16:9 and keeps size validation', async () => {
    renderWithProviders(<CreateDesignDialog open onClose={() => undefined} initialTab="custom" />)
    expect(screen.getByLabelText('Width')).toHaveValue('1920')
    expect(screen.getByLabelText('Height')).toHaveValue('1080')
    const width = screen.getByLabelText('Width')
    await userEvent.clear(width)
    await userEvent.type(width, '30000')
    await userEvent.click(screen.getByRole('button', { name: 'Create presentation' }))
    expect(await screen.findByText(/at most 20000 px/)).toBeInTheDocument()
  })

  it('falls back to built-in slide formats when a server offers none', () => {
    setSizePresetsForTests(buildCatalogue({ version: 1, groups: [{ slug: 'print', label: 'Print', presets: [{ slug: 'poster', label: 'Poster', width: 100, height: 200 }] }] }))
    renderWithProviders(<CreateDesignDialog open onClose={() => undefined} />)
    expect(screen.getByRole('button', { name: /Presentation \(16:9\)/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Presentation \(4:3\)/ })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Poster/ })).not.toBeInTheDocument()
  })
})
