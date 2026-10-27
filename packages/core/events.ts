/**
 * @ember/core/events — typed in-frame event bus used for system-to-system messages.
 *
 * Owner: this file owns engine event dispatch. Games declare their own event map
 * (see `games/ember-runner/src/events.ts`) and pass it as the type parameter.
 */

export type EventMap = Record<string, unknown>;

export type EventHandler<Payload> = (payload: Payload) => void;

export interface Subscription {
  unsubscribe(): void;
}

/**
 * Synchronous bus. Emission order is registration order, which the engines' tests
 * rely on. A listener added while emitting is not called for the current event.
 */
export class EventBus<Events extends EventMap = EventMap> {
  private handlers = new Map<keyof Events, Set<EventHandler<never>>>();

  on<K extends keyof Events>(type: K, handler: EventHandler<Events[K]>): Subscription {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler as EventHandler<never>);
    return {
      unsubscribe: () => {
        set!.delete(handler as EventHandler<never>);
      },
    };
  }

  once<K extends keyof Events>(type: K, handler: EventHandler<Events[K]>): Subscription {
    const subscription = this.on(type, (payload) => {
      subscription.unsubscribe();
      handler(payload);
    });
    return subscription;
  }

  emit<K extends keyof Events>(type: K, payload: Events[K]): number {
    const set = this.handlers.get(type);
    if (!set || set.size === 0) return 0;
    let delivered = 0;
    for (const handler of [...set]) {
      (handler as EventHandler<Events[K]>)(payload);
      delivered++;
    }
    return delivered;
  }

  listenerCount<K extends keyof Events>(type: K): number {
    return this.handlers.get(type)?.size ?? 0;
  }

  clear(type?: keyof Events): void {
    if (type === undefined) this.handlers.clear();
    else this.handlers.delete(type);
  }
}

/**
 * Collects events during a step so systems can read them deterministically in a
 * later phase of the same frame. Drained by `RuntimeSession` after each step.
 */
export class EventQueue<Events extends EventMap = EventMap> {
  private queue: Array<{ type: keyof Events; payload: unknown }> = [];

  push<K extends keyof Events>(type: K, payload: Events[K]): void {
    this.queue.push({ type, payload });
  }

  drain(bus: EventBus<Events>): number {
    const pending = this.queue;
    this.queue = [];
    for (const item of pending) bus.emit(item.type as never, item.payload as never);
    return pending.length;
  }

  get size(): number {
    return this.queue.length;
  }
}
