// Pure bounce math for workspace switches. No GI imports on purpose:
// unit-testable with plain Node.
// GNOME's stock settle uses duration <= 250ms; anything longer (a slow
// touchpad drag, clamped to ~400ms) is "gradual" and must NOT bounce.

export const BOUNCE_MAX_MS = 300;    // settle durations above this: no bounce
export const OVER_OVERSHOOT_PX = 14; // overshoot past rest position (≈1% of a 1440px screen)
export const SLIDE_FACTOR = 0.75;    // phase 1 duration = params.duration * SLIDE_FACTOR
export const RETURN_MS = 130;        // phase 2 duration

export function computeBounceParams({duration, target, current = 0, baseDistance = 1}) {
    if (duration === undefined || duration <= 0 || duration > BOUNCE_MAX_MS)
        return null;

    const delta = target - current;
    if (Math.abs(delta) < Number.EPSILON) // no-op switch (target == current)
        return null;

    const intermediate = target + Math.sign(delta) * (OVER_OVERSHOOT_PX / baseDistance);

    return {
        intermediate,
        target,
        slideDuration: Math.round(duration * SLIDE_FACTOR),
        returnDuration: RETURN_MS,
    };
}