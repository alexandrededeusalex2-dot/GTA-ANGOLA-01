/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type EventHandler<T> = (payload: T) => void;

/**
 * Typed publish/subscribe event bus used to decouple all 12 ANGOLA VIRTUAL
 * modules without introducing circular imports.
 */
export class EventBus<Events extends object> {
  private listeners = new Map<keyof Events, Set<EventHandler<unknown>>>();

  on<K extends keyof Events>(event: K, handler: EventHandler<Events[K]>): () => void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    const typedHandler = handler as EventHandler<unknown>;
    set.add(typedHandler);
    return () => {
      set?.delete(typedHandler);
      if (set && set.size === 0) {
        this.listeners.delete(event);
      }
    };
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return;
    for (const handler of [...set]) {
      (handler as EventHandler<Events[K]>)(payload);
    }
  }

  listenerCount<K extends keyof Events>(event: K): number {
    return this.listeners.get(event)?.size ?? 0;
  }

  clear(): void {
    this.listeners.clear();
  }
}
