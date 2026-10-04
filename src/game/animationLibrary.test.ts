import { describe, expect, it } from 'vitest'
import { AnimationClip, Bone, Euler, Group, Quaternion, QuaternionKeyframeTrack, Vector3, VectorKeyframeTrack } from 'three'
import { hipsAnimY, hipsRestY, mergeLibraryClips, nodeNames } from './animationLibrary'

/** A tiny Mixamo-like rig: hips at `hipsY`, one spine bone. */
function rig(hipsY: number) {
  const root = new Group()
  const hips = new Bone()
  hips.name = 'mixamorigHips'
  hips.position.y = hipsY
  const spine = new Bone()
  spine.name = 'mixamorigSpine'
  hips.add(spine)
  root.add(hips)
  return root
}

/** Library clip authored on a rig whose hips stand at y = 1.0. */
function libClip(name: string, duration = 1) {
  return new AnimationClip(name, duration, [
    new VectorKeyframeTrack('mixamorigHips.position', [0, duration], [0, 1.0, 0, 0, 0.2, 0]),
    new QuaternionKeyframeTrack('mixamorigSpine.quaternion', [0, duration], [0, 0, 0, 1, 0, 0.3, 0, 0.954]),
    new QuaternionKeyframeTrack('mixamorigLeftHandThumb4.quaternion', [0, duration], [0, 0, 0, 1, 0, 0, 0, 1]),
  ])
}

describe('hipsRestY / nodeNames', () => {
  it('finds the hips bone rest height and all bone names', () => {
    const r = rig(0.67)
    expect(hipsRestY(r)).toBeCloseTo(0.67)
    expect(nodeNames(r).has('mixamorigSpine')).toBe(true)
  })
})

describe('mergeLibraryClips', () => {
  it('adds missing library clips after the character’s own clips', () => {
    const r = rig(0.67)
    const own = [new AnimationClip('run', 1, [])]
    const merged = mergeLibraryClips(own, [libClip('fall'), libClip('celebrate')], hipsRestY(r), nodeNames(r))
    expect(merged.map((c) => c.name)).toEqual(['run', 'fall', 'celebrate'])
  })

  it('keeps the character’s own clip when names collide', () => {
    const r = rig(0.67)
    const own = [new AnimationClip('turn180', 0.5, [])]
    const merged = mergeLibraryClips(own, [libClip('turn180')], hipsRestY(r), nodeNames(r))
    expect(merged).toHaveLength(1)
    expect(merged[0]).toBe(own[0])
  })

  it('rescales the hips height to the character’s size (Runner 0.67, Rookie 0.01)', () => {
    for (const hipsY of [0.67, 0.01]) {
      const r = rig(hipsY)
      const [clip] = mergeLibraryClips([], [libClip('fall')], hipsRestY(r), nodeNames(r))
      const hips = clip.tracks.find((t) => t.name === 'mixamorigHips.position')!
      expect(hips.values[1]).toBeCloseTo(hipsY) // standing frame = character's rest height
      expect(hips.values[4]).toBeCloseTo(0.2 * hipsY) // lying frame keeps its proportion
    }
  })

  it('drops tracks for bones the character does not have', () => {
    const r = rig(0.67)
    const [clip] = mergeLibraryClips([], [libClip('fall')], hipsRestY(r), nodeNames(r))
    expect(clip.tracks.some((t) => t.name.includes('Thumb4'))).toBe(false)
  })

  it('trims the long landing clip and never mutates the cached library clip', () => {
    const r = rig(0.67)
    const lib = libClip('land', 2)
    const [clip] = mergeLibraryClips([], [lib], hipsRestY(r), nodeNames(r))
    expect(clip.duration).toBeLessThanOrEqual(0.61)
    expect(lib.duration).toBe(2)
    expect(lib.tracks[0].values[1]).toBe(1.0)
  })
})

describe('hipsAnimY', () => {
  it('uses the character’s own idle clip, not a misleading bind pose (Runner case)', () => {
    const r = rig(-0.26) // bind pose says −0.26 …
    const idle = new AnimationClip('idle', 1, [
      new VectorKeyframeTrack('mixamorigHips.position', [0, 1], [0, 0.68, 0, 0, 0.69, 0]), // … clips stand at 0.68
    ])
    expect(hipsAnimY([idle], r)).toBeCloseTo(0.68)
    const [fall] = mergeLibraryClips([idle], [libClip('fall')], hipsAnimY([idle], r), nodeNames(r)).slice(1)
    expect(fall.tracks.find((t) => t.name === 'mixamorigHips.position')!.values[1]).toBeCloseTo(0.68)
  })

  it('falls back to the bind pose when the character has no hips track', () => {
    expect(hipsAnimY([], rig(0.5))).toBeCloseTo(0.5)
  })
})

describe('start-facing alignment', () => {
  const yawOf = (vals: ArrayLike<number>, i: number) =>
    new Euler().setFromQuaternion(new Quaternion(vals[i], vals[i + 1], vals[i + 2], vals[i + 3]), 'YXZ').y

  it('rotates a clip that starts turned (fall at −62°) to face ahead, keeping its relative motion', () => {
    const start = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), (-62 * Math.PI) / 180)
    const later = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), (-100 * Math.PI) / 180)
    const fall = new AnimationClip('fall', 1, [
      new QuaternionKeyframeTrack('mixamorigHips.quaternion', [0, 1], [...start.toArray(), ...later.toArray()]),
    ])
    const r = rig(1)
    const [clip] = mergeLibraryClips([], [fall], 1, nodeNames(r))
    const v = clip.tracks[0].values
    expect(yawOf(v, 0)).toBeCloseTo(0, 3)
    expect((yawOf(v, 4) * 180) / Math.PI).toBeCloseTo(-38, 0) // −100 − (−62)
  })

  it('never re-aligns the turn clip (its turn is the point)', () => {
    const start = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), (-90 * Math.PI) / 180)
    const turn = new AnimationClip('turn180', 1, [
      new QuaternionKeyframeTrack('mixamorigHips.quaternion', [0], [...start.toArray()]),
    ])
    const [clip] = mergeLibraryClips([], [turn], 1, nodeNames(rig(1)))
    expect((yawOf(clip.tracks[0].values, 0) * 180) / Math.PI).toBeCloseTo(-90, 0)
  })
})
