import { describe, expect, test } from 'bun:test';

import { csvToJson, diffJson, formatJson, jsonToCsv, validateJson } from './logic';

describe('JSON format and validate', () => {
  test('formats valid JSON with indentation', () => {
    const output = formatJson('{"a":1,"b":{"c":2}}', 2);
    expect(output).toContain('\n  "a": 1');
  });

  test('returns actionable parse error for invalid JSON', () => {
    const result = validateJson('{"a": }');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid JSON');
  });
});

describe('JSON diff', () => {
  test('reports added, removed, and changed fields', () => {
    const diffs = diffJson('{"name":"Alice","age":30,"roles":["admin"]}', '{"name":"Alicia","roles":["admin","owner"],"active":true}');
    expect(diffs).toEqual([
      { path: '$.name', left: 'Alice', right: 'Alicia', type: 'changed' },
      { path: '$.age', left: 30, right: undefined, type: 'removed' },
      { path: '$.roles[1]', left: undefined, right: 'owner', type: 'added' },
      { path: '$.active', left: undefined, right: true, type: 'added' }
    ]);
  });
});

describe('CSV <-> JSON conversion', () => {
  test('parses CSV with quoted delimiters', () => {
    const json = csvToJson('name,city\n"Alice","New York, NY"', { delimiter: ',', headerRow: true });
    expect(json).toContain('"city": "New York, NY"');
  });

  test('throws line-aware error when CSV row length mismatches header', () => {
    expect(() => csvToJson('a,b\n1', { delimiter: ',', headerRow: true })).toThrow(
      'CSV parse error on line 2: expected 2 columns, received 1.'
    );
  });

  test('converts JSON objects to CSV and escapes quotes', () => {
    const csv = jsonToCsv('[{"name":"A\\"B","city":"Paris"}]');
    expect(csv).toBe('name,city\n"A""B",Paris');
  });

  test('supports semicolon delimiter and no headers', () => {
    const csv = jsonToCsv('[{"a":1,"b":2}]', ';', false);
    expect(csv).toBe('1;2');
  });
});
