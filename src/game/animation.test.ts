import { describe, expect, it } from 'vitest'
import { AnimationClip, QuaternionKeyframeTrack, VectorKeyframeTrack } from 'three'
import { stripRootMotion } from './animation'

/** A jump-like clip whose hips surge forward 3.4 units in z while rising in y. */
function jumpClip(rootName = 'mixamorigHips') {
  return new AnimationClip('jump', 1, [
    new VectorKeyframeTrack(`${rootName}.position`, [0, 0.5, 1], [0, 0.6, 0, 0.02, 0.95, 1.7, 0.04, 0.6, 3.4]),
    new QuaternionKeyframeTrack('mixamorigSpine.quaternion', [0, 1], [0, 0, 0, 1, 0, 0.1, 0, 0.995]),
  ])
}

describe('stripRootMotion', () => {
  it('pins root x/z to the first frame but keeps vertical motion', () => {
    const [clip] = stripRootMotion([jumpClip()])
    const v = clip.tracks[0].values
    for (let i = 0; i < v.length; i += 3) {
      expect(v[i]).toBe(0) // x pinned
      expect(v[i + 2]).toBe(0) // z pinned — no forward surge
    }
    expect([v[1], v[4], v[7]]).toEqual([0.6, 0.95, 0.6].map(Math.fround)) // y kept
  })

  it('handles other root bone names (Mixamo with colon stripped, Hips, pelvis)', () => {
    for (const name of ['mixamorigHips', 'Hips', 'pelvis']) {
      const [clip] = stripRootMotion([jumpClip(name)])
      expect(clip.tracks[0].values[8]).toBe(0)
    }
  })

  it('never mutates the cached source clip', () => {
    const src = jumpClip()
    stripRootMotion([src])
    expect(src.tracks[0].values[8]).toBeCloseTo(3.4)
  })

  it('leaves rotation tracks and clips without root motion untouched', () => {
    const src = jumpClip()
    const [clip] = stripRootMotion([src])
    expect(Array.from(clip.tracks[1].values)).toEqual(Array.from(src.tracks[1].values))
    const plain = new AnimationClip('idle', 1, [src.tracks[1]])
    expect(stripRootMotion([plain])[0]).toBe(plain)
  })
})
