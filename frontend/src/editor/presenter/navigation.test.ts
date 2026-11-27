import { describe, expect, it } from 'vitest'
import { resolveNextIndices } from './navigation'

describe('slide flow destinations', () => {
  it('resolves stable slide ids instead of their position in the deck', () => {
    const pages = [
      { id: 'board' },
      { id: 'answer', presentationNext: 'board' },
      { id: 'question', presentationNext: 'answer' },
    ]
    expect(resolveNextIndices(pages)).toEqual([1, 0, 1])
    expect(resolveNextIndices([pages[2], pages[0], pages[1]])).toEqual([2, 2, 1])
  })

  it('keeps slide order for missing destinations and ends at explicit terminals', () => {
    expect(resolveNextIndices([
      { id: 'a', presentationNext: 'deleted' },
      { id: 'b', presentationNext: null },
      { id: 'c' },
    ])).toEqual([1, null, null])
  })
})
