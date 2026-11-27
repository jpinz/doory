export function resolveNextIndices(pages: readonly { id: string; presentationNext?: string | null }[]): (number | null)[] {
  const indices = new Map(pages.map((page, index) => [page.id, index]))
  return pages.map((page, index) => {
    if (page.presentationNext === null) return null
    if (typeof page.presentationNext === 'string' && indices.has(page.presentationNext)) return indices.get(page.presentationNext)!
    return index + 1 < pages.length ? index + 1 : null
  })
}
