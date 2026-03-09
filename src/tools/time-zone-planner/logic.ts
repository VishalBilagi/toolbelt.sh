export interface PlannerShareState {
  baseTimeZone: string;
  dateTimeLocal: string;
  zones: string[];
  shiftHours: number;
  workdayStartHour: number;
  workdayEndHour: number;
}

const DATE_TIME_LOCAL_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

const dateTimeFormatterCache = new Map<string, Intl.DateTimeFormat>();

const getDateTimeFormatter = (timeZone: string): Intl.DateTimeFormat => {
  const cached = dateTimeFormatterCache.get(timeZone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  dateTimeFormatterCache.set(timeZone, formatter);
  return formatter;
};

const parseIntegerInRange = (value: string | null, fallback: number, min: number, max: number): number => {
  if (value === null) return fallback;

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;

  return Math.max(min, Math.min(max, parsed));
};

export const isValidTimeZone = (timeZone: string): boolean => {
  try {
    Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
};

export const normalizeTimeZones = (zones: string[]): string[] => {
  const seen = new Set<string>();
  const normalized: string[] = [];

  for (const zone of zones) {
    const value = zone.trim();
    if (!value || seen.has(value) || !isValidTimeZone(value)) {
      continue;
    }

    seen.add(value);
    normalized.push(value);
  }

  return normalized;
};

export const parseShareState = (params: URLSearchParams, fallbackBaseTimeZone: string): PlannerShareState => {
  const baseCandidate = params.get('base')?.trim() ?? '';
  const baseTimeZone = isValidTimeZone(baseCandidate) ? baseCandidate : fallbackBaseTimeZone;

  const dateTimeLocalValue = params.get('at')?.trim() ?? '';
  const dateTimeLocal = DATE_TIME_LOCAL_PATTERN.test(dateTimeLocalValue) ? dateTimeLocalValue : '';

  const zonesRaw = params.get('zones') ?? '';
  const zones = normalizeTimeZones(zonesRaw.split(','));

  const shiftHours = parseIntegerInRange(params.get('shift'), 0, -24, 24);
  const workdayStartHour = parseIntegerInRange(params.get('workStart'), 9, 0, 23);
  const workdayEndHour = parseIntegerInRange(params.get('workEnd'), 18, 1, 24);

  return {
    baseTimeZone,
    dateTimeLocal,
    zones,
    shiftHours,
    workdayStartHour,
    workdayEndHour: Math.max(workdayStartHour + 1, workdayEndHour)
  };
};

export const buildShareQuery = (state: PlannerShareState): string => {
  const params = new URLSearchParams();

  params.set('base', state.baseTimeZone);

  if (DATE_TIME_LOCAL_PATTERN.test(state.dateTimeLocal)) {
    params.set('at', state.dateTimeLocal);
  }

  const zones = normalizeTimeZones(state.zones);
  if (zones.length > 0) {
    params.set('zones', zones.join(','));
  }

  if (state.shiftHours !== 0) {
    params.set('shift', String(Math.max(-24, Math.min(24, state.shiftHours))));
  }

  if (state.workdayStartHour !== 9) {
    params.set('workStart', String(Math.max(0, Math.min(23, state.workdayStartHour))));
  }

  if (state.workdayEndHour !== 18) {
    const boundedEnd = Math.max(1, Math.min(24, state.workdayEndHour));
    params.set('workEnd', String(boundedEnd));
  }

  const query = params.toString();
  return query ? `?${query}` : '';
};

const parseDateTimeLocal = (dateTimeLocal: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
} => {
  if (!DATE_TIME_LOCAL_PATTERN.test(dateTimeLocal)) {
    throw new Error('Use date format YYYY-MM-DDTHH:mm.');
  }

  const [datePart, timePart] = dateTimeLocal.split('T');
  const [year, month, day] = datePart.split('-').map((value) => Number.parseInt(value, 10));
  const [hour, minute] = timePart.split(':').map((value) => Number.parseInt(value, 10));

  return { year, month, day, hour, minute };
};

const getOffsetMilliseconds = (epochMs: number, timeZone: string): number => {
  const formatter = getDateTimeFormatter(timeZone);
  const parts = formatter.formatToParts(new Date(epochMs));

  const values: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      values[part.type] = part.value;
    }
  }

  const year = Number.parseInt(values.year, 10);
  const month = Number.parseInt(values.month, 10);
  const day = Number.parseInt(values.day, 10);
  const hour = Number.parseInt(values.hour, 10);
  const minute = Number.parseInt(values.minute, 10);
  const second = Number.parseInt(values.second, 10);

  const localUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return localUtc - epochMs;
};

export const dateTimeLocalToInstant = (dateTimeLocal: string, timeZone: string): Date => {
  if (!isValidTimeZone(timeZone)) {
    throw new Error('Select a valid IANA timezone.');
  }

  const { year, month, day, hour, minute } = parseDateTimeLocal(dateTimeLocal);
  const initialGuess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);

  let offset = getOffsetMilliseconds(initialGuess, timeZone);
  let timestamp = initialGuess - offset;

  const adjustedOffset = getOffsetMilliseconds(timestamp, timeZone);
  if (adjustedOffset !== offset) {
    offset = adjustedOffset;
    timestamp = initialGuess - offset;
  }

  return new Date(timestamp);
};

export const instantToDateTimeLocal = (instant: Date, timeZone: string): string => {
  if (!isValidTimeZone(timeZone)) {
    throw new Error('Select a valid IANA timezone.');
  }

  const formatter = getDateTimeFormatter(timeZone);
  const parts = formatter.formatToParts(instant);

  const values: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      values[part.type] = part.value;
    }
  }

  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
};
