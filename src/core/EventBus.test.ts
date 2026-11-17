/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { EventBus } from './EventBus';
import type { EngineEvents } from './types';

test('EventBus delivers typed events and cleans up listeners on unsubscribe', () => {
  const bus = new EventBus<EngineEvents>();
  const received: string[] = [];

  const unsub = bus.on('world:timeChanged', ({ preset }) => {
    received.push(preset);
  });

  assert.equal(bus.listenerCount('world:timeChanged'), 1);
  bus.emit('world:timeChanged', { preset: 'sunset' });
  assert.deepEqual(received, ['sunset']);

  unsub();
  assert.equal(bus.listenerCount('world:timeChanged'), 0);
  bus.emit('world:timeChanged', { preset: 'noon' });
  assert.deepEqual(received, ['sunset']);
});
