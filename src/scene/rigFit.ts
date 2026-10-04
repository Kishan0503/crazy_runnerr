import { Vector3, type Object3D } from 'three'

/** Toe joints sit a few cm above the sole; lift them by this much (world units). */
export const SOLE_GAP = 0.035

const FEET = /(Left|Right)(ToeBase|Foot)$/
const _p = new Vector3()

/**
 * World-space height of the character's lowest foot joint (toe, else foot), or
 * null if the rig has none.
 *
 * Grounding used the skinned mesh's bounding box, but for the first frames
 * after a model mounts that box can come from the raw, origin-centred geometry
 * rather than the posed skin — the model then got pushed up by half its height
 * and floated. Bones are always posed by the mixer, so grounding on them is
 * reliable (and cheaper than walking every vertex).
 */
export function feetWorldY(root: Object3D): number | null {
  let toe = Infinity
  let foot = Infinity
  root.updateWorldMatrix(true, true)
  root.traverse((o) => {
    const m = FEET.exec(o.name)
    if (!m || !(o as { isBone?: boolean }).isBone) return
    const y = o.getWorldPosition(_p).y
    if (m[2] === 'ToeBase') toe = Math.min(toe, y)
    else foot = Math.min(foot, y)
  })
  const y = Number.isFinite(toe) ? toe : foot
  return Number.isFinite(y) ? y : null
}
