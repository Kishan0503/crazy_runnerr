import type { AnimationClip } from 'three'

/**
 * The root bone's position track ("mixamorigHips.position", "Hips.position",
 * "pelvis.position", …). three.js strips ':' from node names, so Mixamo's
 * "mixamorig:Hips" arrives as "mixamorigHips".
 */
const ROOT_POSITION = /(hips|pelvis|root)\.position$/i

/**
 * Return copies of `clips` with ROOT MOTION removed: the root bone's horizontal
 * travel (x, z) is pinned to its first keyframe, so every animation plays in
 * place. Vertical (y) motion is kept — crouches and jump poses need it.
 *
 * Why: the runner's forward travel comes from the world scrolling toward the
 * camera, not from the character. A clip exported "with root motion" (e.g. the
 * default Runner's jump/slide move the hips ~3–5 units forward) makes the body
 * surge ahead during the clip and snap back after it. The source clips are
 * cached by useGLTF and shared, so they're never mutated — new tracks are built.
 */
export function stripRootMotion(clips: AnimationClip[]): AnimationClip[] {
  return clips.map((clip) => {
    if (!clip.tracks.some((t) => ROOT_POSITION.test(t.name))) return clip
    const copy = clip.clone()
    copy.tracks = copy.tracks.map((track) => {
      if (!ROOT_POSITION.test(track.name) || track.getValueSize() !== 3) return track
      const t = track.clone()
      // clone() can share the cached array — always work on a fresh one.
      const v = (t.values = t.values.slice())
      const x0 = v[0]
      const z0 = v[2]
      for (let i = 0; i < v.length; i += 3) {
        v[i] = x0
        v[i + 2] = z0
      }
      return t
    })
    return copy
  })
}
