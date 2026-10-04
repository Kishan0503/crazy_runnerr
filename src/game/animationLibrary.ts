import { AnimationClip, AnimationUtils, Euler, Quaternion, Vector3, type KeyframeTrack, type Object3D } from 'three'

/**
 * Shared animation library (Phase 3). public/models/anims.glb holds Mixamo clips
 * (stumble, fall, celebrate, turn180, land) that are applied to EVERY character
 * at runtime: all our characters use Mixamo's skeleton, and three.js binds clip
 * tracks to bones by name ("mixamorigHips.quaternion" …).
 *
 * Rotations transfer as-is. The hips POSITION track is in the library rig's
 * units (Y Bot, hips ≈ 1.0 high) while characters were exported at very
 * different scales (Runner ≈ 0.67, Rookie ≈ 0.01), so it's rescaled per
 * character from the character's own hips rest height.
 */
export const LIBRARY_URL = `${import.meta.env.BASE_URL}models/anims.glb`

/** Clips that are trimmed when merged (name → seconds to keep). */
const TRIM: Record<string, number> = { land: 0.6 }

const HIPS_POSITION = /hips\.position$/i
const HIPS_ROTATION = /hips\.quaternion$/i
/** Clips whose body turn IS the point (never re-aligned). */
const KEEP_FACING = new Set(['turn180'])

/**
 * Mixamo clips can start with the body already turned (the fall starts at −62°),
 * which would snap the character sideways the instant it plays. Rotate the
 * whole hips track about Y so its first frame faces straight ahead; the motion
 * within the clip is unchanged. Small offsets (< 10°) are left alone.
 */
function alignStartYaw(track: KeyframeTrack): KeyframeTrack {
  if (!HIPS_ROTATION.test(track.name) || track.getValueSize() !== 4) return track
  const v = track.values
  const first = new Quaternion(v[0], v[1], v[2], v[3])
  const yaw = new Euler().setFromQuaternion(first, 'YXZ').y
  if (Math.abs(yaw) < (10 * Math.PI) / 180) return track
  const fix = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -yaw)
  const out = track.clone()
  const q = new Quaternion()
  out.values = Float32Array.from(v)
  for (let i = 0; i < out.values.length; i += 4) {
    q.fromArray(out.values, i).premultiply(fix).toArray(out.values, i)
  }
  return out
}
const boneOf = (trackName: string) => trackName.slice(0, trackName.lastIndexOf('.'))

/**
 * Standing hips height in the space the character's ANIMATIONS use: the first
 * hips-position key of its own idle (else run, else any) clip. The bind pose
 * can't be trusted for this — Runner's rest hips sit at y = −0.26 while its
 * clips stand at +0.68 — so the clips are the reference. Falls back to the
 * bone's rest height when the character has no hips track at all.
 */
export function hipsAnimY(own: AnimationClip[], root: Object3D): number | null {
  const byName = (n: string) => own.find((c) => c.name.toLowerCase().includes(n))
  for (const clip of [byName('idle'), byName('run'), ...own]) {
    const t = clip?.tracks.find((tr) => HIPS_POSITION.test(tr.name) && tr.getValueSize() === 3)
    if (t && t.values[1] > 0) return t.values[1]
  }
  return hipsRestY(root)
}

/** Rest height (local y) of the character's hips bone, or null if not found. */
export function hipsRestY(root: Object3D): number | null {
  let y: number | null = null
  root.traverse((o) => {
    if (y === null && /hips$/i.test(o.name) && (o as { isBone?: boolean }).isBone) y = o.position.y
  })
  return y
}

/** Every node name in the character (bones), for filtering library tracks. */
export function nodeNames(root: Object3D): Set<string> {
  const names = new Set<string>()
  root.traverse((o) => names.add(o.name))
  return names
}

/**
 * The character's own clips + any library clip it doesn't already have
 * (its own `turn180` wins). Library clips are retargeted: tracks for bones the
 * character lacks are dropped, and the hips position is rescaled to the
 * character's size. Library clips are never mutated (useGLTF caches them).
 */
export function mergeLibraryClips(
  own: AnimationClip[],
  library: AnimationClip[],
  restY: number | null,
  bones: Set<string>,
): AnimationClip[] {
  const have = new Set(own.map((c) => c.name.toLowerCase()))
  const extra: AnimationClip[] = []
  for (const src of library) {
    if (have.has(src.name.toLowerCase())) continue
    let clip = src.clone()
    clip.tracks = clip.tracks
      .filter((t) => bones.has(boneOf(t.name)))
      .map((t) => {
        if (!HIPS_POSITION.test(t.name) || restY === null || t.getValueSize() !== 3) return t
        const first = t.values[1]
        if (!(first > 0)) return t
        const k = restY / first
        const out = t.clone()
        out.values = Float32Array.from(t.values, (v) => v * k)
        return out
      })
    if (clip.tracks.length === 0) continue
    if (!KEEP_FACING.has(clip.name)) clip.tracks = clip.tracks.map(alignStartYaw)
    const keep = TRIM[clip.name]
    if (keep && clip.duration > keep) clip = AnimationUtils.subclip(clip, clip.name, 0, Math.round(keep * 30), 30)
    extra.push(clip)
  }
  return [...own, ...extra]
}
