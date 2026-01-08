import { vi } from 'vitest';
import type { ServerToClientEvents, ClientToServerEvents, GameState, Move, BoardAnnotations } from '@chess/shared';

export interface MockSocket {
  emit: ReturnType<typeof vi.fn>;
  emittedEvents: Array<{ event: string; args: unknown[] }>;
  getEmittedEvent: (eventName: string) => unknown[] | undefined;
  clearEmitted: () => void;
}

export function createMockSocket(): MockSocket {
  const emittedEvents: Array<{ event: string; args: unknown[] }> = [];

  const emit = vi.fn((event: string, ...args: unknown[]) => {
    emittedEvents.push({ event, args });
    return true;
  });

  return {
    emit,
    emittedEvents,
    getEmittedEvent: (eventName: string) => {
      const found = emittedEvents.find((e) => e.event === eventName);
      return found?.args;
    },
    clearEmitted: () => {
      emittedEvents.length = 0;
      emit.mockClear();
    },
  };
}


