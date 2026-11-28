import { render, screen } from '@testing-library/react'
import { DebugBranchBadge } from './DebugBranchBadge'

describe('DebugBranchBadge', () => {
  it('shows the full branch name and makes it available when truncated', () => {
    const branch = 'dev/jupinzer/branch-debug-badge'
    render(<DebugBranchBadge branch={branch} />)
    expect(screen.getByText(branch).parentElement).toHaveAttribute('title', branch)
  })

  it('renders nothing when branch information is unavailable', () => {
    const { container } = render(<DebugBranchBadge branch="" />)
    expect(container).toBeEmptyDOMElement()
  })
})
