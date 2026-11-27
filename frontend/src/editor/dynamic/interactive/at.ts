import { type FabricObject, Group, type Point } from 'fabric'
import { DoryDie } from './dice/DoryDie'
import { DoryWheel } from './wheel/DoryWheel'

export type InteractiveObject = DoryDie | DoryWheel

export function interactiveObjects(objects: readonly FabricObject[]): InteractiveObject[] {
  return objects.flatMap((object) => {
    if (!object.visible || object.opacity === 0) return []
    if (object instanceof DoryDie || object instanceof DoryWheel) return [object]
    return object instanceof Group ? interactiveObjects(object.getObjects()) : []
  })
}

/** Do not activate an object through another object drawn in front of it. */
export function interactiveAt(objects: readonly FabricObject[], point: Point): InteractiveObject | null {
  for (let i = objects.length - 1; i >= 0; i--) {
    const object = objects[i]
    if (!object.visible || object.opacity === 0 || !object.containsPoint(point)) continue
    if (object instanceof DoryDie || object instanceof DoryWheel) return object
    if (object instanceof Group) return interactiveAt(object.getObjects(), point)
    return null
  }
  return null
}
