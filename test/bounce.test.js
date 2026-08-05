import test from 'node:test';
import assert from 'node:assert/strict';
import { computeBounceParams } from '../bounce.js';

const BASE = 1540; // px-per-progress-unit: ≈ a 1440px screen + spacing, keeps overshoot in px

function bounce(duration, target, current) {
    return computeBounceParams({duration, target, current, baseDistance: BASE});
}

test('keyboard switch (250ms) bounces and overshoots in the travel direction', () => {
    const r = bounce(250, 1, 0);
    assert.ok(r);
    assert.ok(r.intermediate > r.target, 'overshoots forward');
    assert.equal(r.target, 1);
    assert.equal(r.slideDuration, 188);  // Math.round(250 * 0.75)
    assert.equal(r.returnDuration, 130);
});

test('reverse direction overshoots below the target', () => {
    const r = bounce(250, 0, 1);
    assert.ok(r.intermediate < r.target, 'overshoots backwards');
});

test('slow gesture settle (400ms clamped) does NOT bounce', () => {
    assert.equal(bounce(400, 1, 0), null);
});

test('missing duration does NOT bounce', () => {
    assert.equal(bounce(undefined, 1, 0), null);
});

test('no-op switch (target == current) does NOT bounce', () => {
    assert.equal(bounce(250, 1, 1), null);
});

test('overshoot magnitude stays near ~1% of baseDistance', () => {
    const r = bounce(250, 1, 0);
    const dPx = Math.abs(r.intermediate - 1) * 1540;
    assert.ok(dPx >= 12 && dPx <= 16, `overshoot ${dPx}px outside [12,16]`);
});