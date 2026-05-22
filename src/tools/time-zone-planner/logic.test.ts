import { describe, expect, test } from 'bun:test';

import {
  buildShareQuery,
  dateTimeLocalToInstant,
  instantToDateTimeLocal,
  normalizeTimeZones,
  parseShareState
} from './logic';

describe('normalizeTimeZones', () => {
  test('keeps valid unique IANA zones and removes invalid entries', () => {
    expect(normalizeTimeZones(['UTC', 'America/New_York', 'UTC', 'Mars/Phobos', '  '])).toEqual([
      'UTC',
      'America/New_York'
    ]);
  });
});

describe('share-state helpers', () => {
  test('parses and sanitizes incoming query values', () => {
    const parsed = parseShareState(
      new URLSearchParams(
        'base=Europe%2FLondon&at=2025-01-15T19:45&zones=UTC,Asia%2FTokyo,Invalid%2FZone&shift=3&workStart=8&workEnd=17'
      ),
      'UTC'
    );

    expect(parsed).toEqual({
      baseTimeZone: 'Europe/London',
      dateTimeLocal: '2025-01-15T19:45',
      zones: ['UTC', 'Asia/Tokyo'],
      shiftHours: 3,
      workdayStartHour: 8,
      workdayEndHour: 17
    });
  });

  test('builds a clean share query', () => {
    const query = buildShareQuery({
      baseTimeZone: 'America/New_York',
      dateTimeLocal: '2025-07-20T10:30',
      zones: ['UTC', 'America/Los_Angeles', 'UTC'],
      shiftHours: -2,
      workdayStartHour: 8,
      workdayEndHour: 17
    });

    expect(query).toBe(
      '?base=America%2FNew_York&at=2025-07-20T10%3A30&zones=UTC%2CAmerica%2FLos_Angeles&shift=-2&workStart=8&workEnd=17'
    );
  });
});

describe('date/time conversion', () => {
  test('converts local New York winter time to expected UTC instant', () => {
    const instant = dateTimeLocalToInstant('2025-01-15T09:00', 'America/New_York');
    expect(instant.toISOString()).toBe('2025-01-15T14:00:00.000Z');
  });

  test('round-trips instants into another timezone local datetime format', () => {
    const instant = new Date('2025-06-10T15:30:00.000Z');
    const local = instantToDateTimeLocal(instant, 'Asia/Tokyo');
    expect(local).toBe('2025-06-11T00:30');
  });
});
