import { EventEmitter } from "node:events";
import type { LiveEvent, LiveEventType } from "@paperclipai/shared";

type LiveEventPayload = Record<string, unknown>;
type LiveEventListener = (event: LiveEvent) => void;

const emitter = new EventEmitter();
emitter.setMaxListeners(0);

let nextEventId = 0;

// ── Event buffer for replay (Phase 8) ───────────────────────────────────────
// Holds the last N events per company for reconnecting clients.
// When Redis Streams is available, this buffer becomes unnecessary.
const EVENT_BUFFER_SIZE = 500;
const eventBuffers = new Map<string, LiveEvent[]>();

function bufferEvent(event: LiveEvent) {
  let buffer = eventBuffers.get(event.companyId);
  if (!buffer) {
    buffer = [];
    eventBuffers.set(event.companyId, buffer);
  }
  buffer.push(event);
  if (buffer.length > EVENT_BUFFER_SIZE) {
    buffer.splice(0, buffer.length - EVENT_BUFFER_SIZE);
  }
}

function toLiveEvent(input: {
  companyId: string;
  type: LiveEventType;
  payload?: LiveEventPayload;
}): LiveEvent {
  nextEventId += 1;
  return {
    id: nextEventId,
    companyId: input.companyId,
    type: input.type,
    createdAt: new Date().toISOString(),
    payload: input.payload ?? {},
  };
}

export function publishLiveEvent(input: {
  companyId: string;
  type: LiveEventType;
  payload?: LiveEventPayload;
}) {
  const event = toLiveEvent(input);
  bufferEvent(event);
  emitter.emit(input.companyId, event);
  return event;
}

export function subscribeCompanyLiveEvents(companyId: string, listener: LiveEventListener) {
  emitter.on(companyId, listener);
  return () => emitter.off(companyId, listener);
}

/**
 * Replay missed events since a given event ID for reconnecting clients.
 * Returns events after `sinceId` for the given company.
 * Phase 8 enhancement: once Redis Streams is configured, this reads from
 * persistent storage instead of the in-memory buffer.
 */
export function replayEvents(companyId: string, sinceId: number): LiveEvent[] {
  const buffer = eventBuffers.get(companyId);
  if (!buffer) return [];
  return buffer.filter(e => e.id > sinceId);
}
