export type EventHandler<T> = (event: T) => void;

export interface EventBus<TEvents extends Record<string, unknown>> {
  emit<TKey extends keyof TEvents>(type: TKey, event: TEvents[TKey]): void;

  on<TKey extends keyof TEvents>(type: TKey, handler: EventHandler<TEvents[TKey]>): () => void;
}

export class SimpleEventBus<TEvents extends Record<string, unknown>> implements EventBus<TEvents> {
  private readonly handlers = new Map<keyof TEvents, Set<EventHandler<never>>>();

  public on<TKey extends keyof TEvents>(
    type: TKey,
    handler: EventHandler<TEvents[TKey]>,
  ): () => void {
    let handlers = this.handlers.get(type);

    if (!handlers) {
      handlers = new Set<EventHandler<never>>();
      this.handlers.set(type, handlers);
    }

    handlers.add(handler as EventHandler<never>);

    return () => {
      handlers?.delete(handler as EventHandler<never>);
    };
  }

  public emit<TKey extends keyof TEvents>(type: TKey, event: TEvents[TKey]): void {
    const handlers = this.handlers.get(type);
    if (!handlers) {
      return;
    }

    for (const handler of handlers) {
      (handler as EventHandler<TEvents[TKey]>)(event);
    }
  }
}
