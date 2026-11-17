/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from '../../core/EventBus';
import type { EngineEvents } from '../../core/types';
import { createDefaultSaveProfile, sanitizeSaveProfile, SaveSystem } from './SaveSystem';

test('sanitizeSaveProfile recovers gracefully from invalid partial input', () => {
  const sanitized = sanitizeSaveProfile({
    qualityTier: 'invalid-tier',
    timeOfDay: 'sunset',
    muted: true,
    lastCameraPosition: { x: 1, y: 2, z: Number.NaN },
  });

  assert.equal(sanitized.qualityTier, 'medium');
  assert.equal(sanitized.timeOfDay, 'sunset');
  assert.equal(sanitized.muted, true);
  assert.deepEqual(sanitized.lastCameraPosition, createDefaultSaveProfile().lastCameraPosition);
});

test('SaveSystem persists and reloads profile via fallback backend in Node environment', async () => {
  const bus = new EventBus<EngineEvents>();
  const saveSystem = new SaveSystem(bus);
  await saveSystem.init();

  assert.equal(saveSystem.getBackendMode(), 'memory');
  const saved = await saveSystem.saveProfile({ qualityTier: 'low', timeOfDay: 'noon' });
  assert.equal(saved.qualityTier, 'low');
  assert.equal(saved.timeOfDay, 'noon');

  const reloaded = await saveSystem.loadProfile();
  assert.equal(reloaded.qualityTier, 'low');
  assert.equal(reloaded.timeOfDay, 'noon');
  saveSystem.dispose();
});
