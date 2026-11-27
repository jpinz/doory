import { FabricObject, Point, type TMat2D, util } from 'fabric'
import type { DocObject } from '@/types/document'
import type { PreviewBox } from './channel'

const IDENTITY: TMat2D = [1, 0, 0, 1, 0, 0]

const GEOMETRY = ['left', 'top', 'width', 'height', 'scaleX', 'scaleY', 'angle', 'skewX', 'skewY', 'flipX', 'flipY', 'originX', 'originY', 'strokeWidth', 'strokeUniform'] as const

/** The object's own transform, worked out by Fabric from the same fields the stage loads it with. */
function ownTransform(object: DocObject): { matrix: TMat2D; half: Point } | null {
  const options: Record<string, unknown> = {}
  for (const key of GEOMETRY) if (object[key] !== undefined) options[key] = object[key]
  try {
    const shape = new FabricObject(options)
    return { matrix: shape.calcOwnMatrix(), half: shape._getNonTransformedDimensions().scalarDivide(2) }
  } catch {
    return null
  }
}

/**
 * Where the objects with the given ids sit on a page, as fractions of the page's size, so the presenter view can
 * mark them on a page picture of any size. Group children are placed in their group's plane, as Fabric does.
 */
export function objectBoxes(objects: readonly DocObject[], ids: ReadonlySet<string>, pageWidth: number, pageHeight: number): Map<string, PreviewBox> {
  const boxes = new Map<string, PreviewBox>()
  const walk = (list: readonly DocObject[], parent: TMat2D): void => {
    for (const object of list) {
      const sized = typeof object.width === 'number' && object.width > 0 && typeof object.height === 'number' && object.height > 0
      const wanted = sized && typeof object.id === 'string' && ids.has(object.id)
      const children = Array.isArray(object.objects) ? (object.objects as DocObject[]) : null
      if (!wanted && !children) continue
      const own = ownTransform(object)
      if (!own) continue
      const matrix = util.multiplyTransformMatrices(parent, own.matrix)
      if (wanted) {
        const { x: hx, y: hy } = own.half
        const corners = [new Point(-hx, -hy), new Point(hx, -hy), new Point(hx, hy), new Point(-hx, hy)].map((p) => util.transformPoint(p, matrix))
        const xs = corners.map((p) => p.x)
        const ys = corners.map((p) => p.y)
        const box = {
          x: Math.min(...xs) / pageWidth,
          y: Math.min(...ys) / pageHeight,
          w: (Math.max(...xs) - Math.min(...xs)) / pageWidth,
          h: (Math.max(...ys) - Math.min(...ys)) / pageHeight,
        }
        if (Object.values(box).every(Number.isFinite) && box.w > 0 && box.h > 0) boxes.set(object.id, box)
      }
      if (children) walk(children, matrix)
    }
  }
  if (pageWidth > 0 && pageHeight > 0) walk(objects, IDENTITY)
  return boxes
}
