import type { DocObject } from '@/types/document'

export type InteractiveKind = 'wheel' | 'die'

export interface InteractiveControl {
  id: string
  kind: InteractiveKind
  label: string
}

export function findInteractiveDocuments(objects: readonly DocObject[], matches: (object: DocObject) => boolean): DocObject[] {
  return objects.flatMap((object) => {
    if (object.visible === false || object.opacity === 0) return []
    if (matches(object)) return [object]
    return Array.isArray(object.objects) ? findInteractiveDocuments(object.objects as DocObject[], matches) : []
  })
}
