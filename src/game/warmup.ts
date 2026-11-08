/**
 * Shader warm-up (Phase 4P). three.js compiles a material's shader the first
 * time something using it is DRAWN — mid-run that was a 1–1.6 s freeze. Every
 * pooled renderer therefore draws one hidden dummy (behind the camera, culling
 * off) for its first few frames after mounting, and again whenever
 * `requestWarmup()` is called (e.g. after the quality tier switches effects,
 * which changes the shader variants). The compile then happens on the loading
 * screen / menu instead of during play.
 */
export const warmup = { gen: 0 }

/** Frames each renderer draws its dummy for (covers main + shadow pass). */
export const WARM_FRAMES = 3

/** World z for warm-up dummies: behind the camera, never seen. */
export const WARM_Z = 60

/** Ask every pooled renderer to warm its shaders again. */
export function requestWarmup() {
  warmup.gen++
}

/** Per-renderer helper: `shouldWarm()` is true for WARM_FRAMES frames after mount / each request. */
export class WarmTracker {
  private gen = -1
  private left = 0
  shouldWarm(): boolean {
    if (this.gen !== warmup.gen) {
      this.gen = warmup.gen
      this.left = WARM_FRAMES
    }
    if (this.left > 0) {
      this.left--
      return true
    }
    return false
  }
}
