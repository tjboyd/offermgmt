import { db, activityLog } from '../db';
import type { ActivityEventType } from '../db/schema';

export interface LogEventInput {
  playerId?:  string;
  offerId?:   string;
  userId?:    string | null;  // null for parent-triggered events
  actorLabel: string;
  eventType:  ActivityEventType;
  detail?:    Record<string, unknown>;
}

export async function logEvent(input: LogEventInput): Promise<void> {
  await db.insert(activityLog).values({
    playerId:   input.playerId   ?? null,
    offerId:    input.offerId    ?? null,
    userId:     input.userId     ?? null,
    actorLabel: input.actorLabel,
    eventType:  input.eventType,
    detail:     input.detail ?? null,
    ts:         new Date(),
  });
}

/** Convenience: log from a named staff user. */
export async function logStaffEvent(
  userId: string,
  userName: string,
  eventType: ActivityEventType,
  opts: Omit<LogEventInput, 'userId' | 'actorLabel' | 'eventType'>,
): Promise<void> {
  return logEvent({ ...opts, userId, actorLabel: userName, eventType });
}

/** Convenience: log a parent-triggered event (no user). */
export async function logParentEvent(
  eventType: ActivityEventType,
  opts: Omit<LogEventInput, 'userId' | 'actorLabel' | 'eventType'>,
): Promise<void> {
  return logEvent({ ...opts, userId: null, actorLabel: 'Parent via link', eventType });
}
