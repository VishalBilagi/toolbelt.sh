export interface JsonValidationResult {
  valid: boolean;
  error: string | null;
}

export interface JsonDiffEntry {
  path: string;
  left: unknown;
  right: unknown;
  type: 'added' | 'removed' | 'changed';
}

export interface CsvOptions {
  delimiter: string;
  headerRow: boolean;
}

const stringifyValue = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};

export const parseJsonWithContext = (input: string): unknown => {
  try {
    return JSON.parse(input);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON input.';
    throw new Error(`Invalid JSON: ${message}`);
  }
};

export const formatJson = (input: string, indent = 2): string => {
  const parsed = parseJsonWithContext(input);
  return JSON.stringify(parsed, null, indent);
};

export const validateJson = (input: string): JsonValidationResult => {
  try {
    parseJsonWithContext(input);
    return { valid: true, error: null };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Invalid JSON input.'
    };
  }
};

const diffValues = (left: unknown, right: unknown, path: string, diffs: JsonDiffEntry[]): void => {
  if (Object.is(left, right)) return;

  const leftIsArray = Array.isArray(left);
  const rightIsArray = Array.isArray(right);
  if (leftIsArray && rightIsArray) {
    const max = Math.max(left.length, right.length);
    for (let i = 0; i < max; i += 1) {
      const nextPath = `${path}[${i}]`;
      if (i >= left.length) {
        diffs.push({ path: nextPath, left: undefined, right: right[i], type: 'added' });
      } else if (i >= right.length) {
        diffs.push({ path: nextPath, left: left[i], right: undefined, type: 'removed' });
      } else {
        diffValues(left[i], right[i], nextPath, diffs);
      }
    }
    return;
  }

  const leftIsObject = typeof left === 'object' && left !== null;
  const rightIsObject = typeof right === 'object' && right !== null;

  if (leftIsObject && rightIsObject) {
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const keys = new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)]);

    for (const key of keys) {
      const nextPath = path === '$' ? `$.${key}` : `${path}.${key}`;
      if (!(key in leftRecord)) {
        diffs.push({ path: nextPath, left: undefined, right: rightRecord[key], type: 'added' });
      } else if (!(key in rightRecord)) {
        diffs.push({ path: nextPath, left: leftRecord[key], right: undefined, type: 'removed' });
      } else {
        diffValues(leftRecord[key], rightRecord[key], nextPath, diffs);
      }
    }
    return;
  }

  diffs.push({ path, left, right, type: 'changed' });
};

export const diffJson = (leftInput: string, rightInput: string): JsonDiffEntry[] => {
  const left = parseJsonWithContext(leftInput);
  const right = parseJsonWithContext(rightInput);
  const diffs: JsonDiffEntry[] = [];
  diffValues(left, right, '$', diffs);
  return diffs;
};

const parseCsvLine = (line: string, delimiter: string, lineNumber: number): string[] => {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === delimiter && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  if (inQuotes) {
    throw new Error(`CSV parse error on line ${lineNumber}: unmatched quote.`);
  }

  values.push(current);
  return values;
};

const escapeCsvField = (value: string, delimiter: string): string => {
  const needsQuotes = value.includes('"') || value.includes('\n') || value.includes('\r') || value.includes(delimiter);
  if (!needsQuotes) return value;
  return `"${value.replaceAll('"', '""')}"`;
};

export const csvToJson = (csvInput: string, options: CsvOptions): string => {
  const delimiter = options.delimiter || ',';
  if (delimiter.length !== 1) throw new Error('Delimiter must be a single character.');

  const lines = csvInput
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0);

  if (lines.length === 0) return '[]';

  const rows = lines.map((line, index) => parseCsvLine(line, delimiter, index + 1));

  if (options.headerRow) {
    const headers = rows[0];
    const bodyRows = rows.slice(1);
    const mapped = bodyRows.map((row, rowIndex) => {
      if (row.length !== headers.length) {
        throw new Error(
          `CSV parse error on line ${rowIndex + 2}: expected ${headers.length} columns, received ${row.length}.`
        );
      }

      return headers.reduce<Record<string, string>>((record, key, colIndex) => {
        record[key || `column_${colIndex + 1}`] = row[colIndex] ?? '';
        return record;
      }, {});
    });

    return JSON.stringify(mapped, null, 2);
  }

  return JSON.stringify(rows, null, 2);
};

export const jsonToCsv = (jsonInput: string, delimiter = ',', includeHeader = true): string => {
  if (delimiter.length !== 1) throw new Error('Delimiter must be a single character.');

  const parsed = parseJsonWithContext(jsonInput);
  if (!Array.isArray(parsed)) {
    throw new Error('JSON input must be an array for CSV conversion.');
  }

  if (parsed.length === 0) return '';

  if (Array.isArray(parsed[0])) {
    return (parsed as unknown[])
      .map((row) => {
        if (!Array.isArray(row)) throw new Error('Mixed JSON array types are not supported for CSV conversion.');
        return row.map((cell) => escapeCsvField(stringifyValue(cell), delimiter)).join(delimiter);
      })
      .join('\n');
  }

  if (typeof parsed[0] !== 'object' || parsed[0] === null) {
    throw new Error('JSON array must contain objects or arrays for CSV conversion.');
  }

  const objectRows = parsed as Array<Record<string, unknown>>;
  const headerKeys = Array.from(new Set(objectRows.flatMap((row) => Object.keys(row))));
  const lines: string[] = [];

  if (includeHeader) {
    lines.push(headerKeys.map((key) => escapeCsvField(key, delimiter)).join(delimiter));
  }

  for (const row of objectRows) {
    const line = headerKeys.map((key) => escapeCsvField(stringifyValue(row[key]), delimiter)).join(delimiter);
    lines.push(line);
  }

  return lines.join('\n');
};
