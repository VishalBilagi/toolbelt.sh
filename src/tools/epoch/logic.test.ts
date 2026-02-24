import { describe, expect, test } from 'bun:test';

import {
  dateToEpochValues,
  detectEpochUnit,
  epochToDate,
  formatLocalDisplay,
  formatUtcDisplay,
  parseDateInput,
  parseEpochInteger
} from './logic';

describe('parseEpochInteger', () => {
  test('parses signed integer values', () => {
    expect(parseEpochInteger('-1700000000')).toBe(-1_700_000_000n);
  });

  test('throws for non-numeric values', () => {
    expect(() => parseEpochInteger('10.3')).toThrow('whole number');
  });
});

describe('detectEpochUnit', () => {
  test('flags 10 digit values as ambiguous', () => {
    const detected = detectEpochUnit(1_700_000_000n);
    expect(detected.ambiguous).toBe(true);
    expect(detected.unit).toBeNull();
  });

  test('detects microseconds for 16 digits', () => {
    const detected = detectEpochUnit(1_700_000_000_000_000n);
    expect(detected.ambiguous).toBe(false);
    expect(detected.unit).toBe('microseconds');
  });
});

describe('epochToDate', () => {
  test('converts milliseconds directly', () => {
    const result = epochToDate(1_708_535_665_123n, 'milliseconds');
    expect(result.date.toISOString()).toBe('2024-02-21T17:14:25.123Z');
    expect(result.truncatedToMilliseconds).toBe(false);
  });

  test('truncates nanoseconds to milliseconds', () => {
    const result = epochToDate(1_708_535_665_123_456_789n, 'nanoseconds');
    expect(result.date.toISOString()).toBe('2024-02-21T17:14:25.123Z');
    expect(result.truncatedToMilliseconds).toBe(true);
  });
});

describe('parseDateInput and dateToEpochValues', () => {
  test('parses timezone-offset ISO values', () => {
    const parsed = parseDateInput('2026-02-24T12:00:00-05:00', 'local');
    expect(parsed.toISOString()).toBe('2026-02-24T17:00:00.000Z');
  });

  test('interprets no-offset values as UTC when selected', () => {
    const parsed = parseDateInput('2026-02-24T12:00:00', 'utc');
    expect(parsed.toISOString()).toBe('2026-02-24T12:00:00.000Z');
  });

  test('returns all epoch precision outputs', () => {
    const parsed = new Date('2026-02-24T17:00:00.000Z');
    const result = dateToEpochValues(parsed);
    expect(result.seconds).toBe('1771952400');
    expect(result.milliseconds).toBe('1771952400000');
    expect(result.microseconds).toBe('1771952400000000');
    expect(result.nanoseconds).toBe('1771952400000000000');
  });
});

describe('formatters', () => {
  test('includes UTC suffix for UTC display', () => {
    const date = new Date('2026-02-24T17:00:00.123Z');
    expect(formatUtcDisplay(date)).toBe('2026-02-24 17:00:00.123 UTC');
  });

  test('includes timestamp for local display', () => {
    const date = new Date('2026-02-24T17:00:00.123Z');
    expect(formatLocalDisplay(date)).toContain('2026-02-24');
    expect(formatLocalDisplay(date)).toContain('00.123');
  });
});
