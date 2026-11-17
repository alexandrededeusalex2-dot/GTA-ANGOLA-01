/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { PerformanceMonitor } from './PerformanceMonitor';

test('PerformanceMonitor computes FPS and recommends low tier under software GL', () => {
  const monitor = new PerformanceMonitor(20);
  for (let i = 0; i < 20; i++) {
    monitor.recordFrame(1 / 60);
  }
  assert.equal(monitor.getEstimatedFps(), 60);
  assert.equal(monitor.recommendQualityTier('high', true), 'low');
  assert.equal(monitor.recommendQualityTier('high', false), 'high');
});

test('PerformanceMonitor recommends downgrade when Android FPS drops below budget', () => {
  const monitor = new PerformanceMonitor(20);
  for (let i = 0; i < 20; i++) {
    monitor.recordFrame(0.05); // 20 FPS
  }
  assert.equal(monitor.getEstimatedFps(), 20);
  assert.equal(monitor.recommendQualityTier('medium', false), 'low');
});
