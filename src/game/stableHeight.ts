/**
 * Robust height measurement for auto-fitting characters.
 *
 * Characters are normalized to a target height from their measured posed
 * height. Measuring ONCE on the first frame was flaky: that frame can come
 * before the animation mixer has applied any pose, leaving the model in its
 * raw bind pose — which for some exports is in completely different units
 * (Inferno measured ~1/80 of its real height → rendered ~80× too big).
 *
 * The sampler only returns a height once (a) a clip pose has been applied and
 * (b) consecutive measurements agree within `tolerance`.
 */
export function createHeightSampler(tolerance = 0.05, needed = 2) {
  let prev = 0
  let streak = 0
  return (height: number, posed: boolean): number | null => {
    if (!posed || !(height > 1e-4)) {
      prev = 0
      streak = 0
      return null
    }
    streak = prev > 0 && Math.abs(height - prev) / prev < tolerance ? streak + 1 : 0
    prev = height
    return streak >= needed - 1 ? height : null
  }
}
