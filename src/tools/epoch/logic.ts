export type EpochUnit = 'seconds' | 'milliseconds' | 'microseconds' | 'nanoseconds';
export type TimezoneMode = 'local' | 'utc';

const DATE_MIN_MS = -8_640_000_000_000_000n;
const DATE_MAX_MS = 8_640_000_000_000_000n;

const UNIT_SCALE: Record<EpochUnit, bigint> = {
  seconds: 1_000n,
  milliseconds: 1n,
  microseconds: 1_000n,
  nanoseconds: 1_000_000n
};

export interface DetectionResult {
  unit: EpochUnit | null;
  ambiguous: boolean;
  reason: string;
}

export interface EpochToDateResult {
  date: Date;
  timestampMs: number;
  truncatedToMilliseconds: boolean;
}

export interface DateToEpochResult {
  seconds: string;
  milliseconds: string;
  microseconds: string;
  nanoseconds: string;
}

const toDigitLength = (value: bigint): number => {
  return value < 0n ? value.toString().length - 1 : value.toString().length;
};

export const parseEpochInteger = (input: string): bigint => {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Enter an epoch value to convert.');
  }

  if (!/^[+-]?\d+$/.test(trimmed)) {
    throw new Error('Epoch input must be a whole number.');
  }

  return BigInt(trimmed);
};

export const detectEpochUnit = (value: bigint): DetectionResult => {
  const digitLength = toDigitLength(value);

  if (digitLength <= 9) {
    return { unit: 'seconds', ambiguous: false, reason: 'Short epoch values are treated as seconds.' };
  }

  if (digitLength === 10 || digitLength === 11) {
    return {
      unit: null,
      ambiguous: true,
      reason: '10-11 digit values can represent either seconds or milliseconds in edge cases.'
    };
  }

  if (digitLength >= 19) {
    return { unit: 'nanoseconds', ambiguous: false, reason: '19+ digits match nanosecond precision.' };
  }

  if (digitLength >= 16) {
    return { unit: 'microseconds', ambiguous: false, reason: '16-18 digits match microsecond precision.' };
  }

  return { unit: 'milliseconds', ambiguous: false, reason: '12-15 digits match millisecond precision.' };
};

export const epochToDate = (value: bigint, unit: EpochUnit): EpochToDateResult => {
  const divisor = UNIT_SCALE[unit];
  const wholeMs = unit === 'seconds' ? value * divisor : value / divisor;
  const remainder = unit === 'seconds' ? 0n : value % divisor;

  if (wholeMs < DATE_MIN_MS || wholeMs > DATE_MAX_MS) {
    throw new Error('Timestamp out of supported range.');
  }

  return {
    date: new Date(Number(wholeMs)),
    timestampMs: Number(wholeMs),
    truncatedToMilliseconds: remainder !== 0n
  };
};

const ensureParsedDate = (timestampMs: number): Date => {
  const date = new Date(timestampMs);
  if (Number.isNaN(date.getTime())) {
    throw new Error('Could not parse date/time. Use ISO 8601 (e.g. 2026-02-24T17:00:00Z).');
  }

  return date;
};

const normalizeDateInput = (input: string): string => {
  return input.trim().replace(' ', 'T');
};

export const parseDateInput = (input: string, mode: TimezoneMode): Date => {
  const normalized = normalizeDateInput(input);
  if (!normalized) {
    throw new Error('Enter a date/time to convert.');
  }

  const hasOffset = /(?:z|[+-]\d{2}:?\d{2})$/i.test(normalized);

  if (hasOffset) {
    return ensureParsedDate(Date.parse(normalized));
  }

  if (mode === 'utc') {
    return ensureParsedDate(Date.parse(`${normalized}Z`));
  }

  return ensureParsedDate(new Date(normalized).getTime());
};

export const dateToEpochValues = (date: Date): DateToEpochResult => {
  const milliseconds = BigInt(date.getTime());

  return {
    seconds: (milliseconds / 1_000n).toString(),
    milliseconds: milliseconds.toString(),
    microseconds: (milliseconds * 1_000n).toString(),
    nanoseconds: (milliseconds * 1_000_000n).toString()
  };
};

const pad = (value: number): string => value.toString().padStart(2, '0');

const padMilliseconds = (value: number): string => value.toString().padStart(3, '0');

export const formatUtcDisplay = (date: Date): string => {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}.${padMilliseconds(date.getUTCMilliseconds())} UTC`;
};

export const formatLocalDisplay = (date: Date): string => {
  const tzShort = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
    .formatToParts(date)
    .find((part) => part.type === 'timeZoneName')?.value ?? 'Local';

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${padMilliseconds(date.getMilliseconds())} ${tzShort}`;
};
