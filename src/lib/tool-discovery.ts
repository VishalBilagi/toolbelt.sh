/** Match every search word, including formats and task aliases from the catalog. */
export const matchesToolSearch = (text: string, query: string): boolean => {
  const normalize = (value: string): string => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase();
  const haystack = normalize(text);
  return normalize(query).trim().split(/\s+/).every(word => haystack.includes(word));
};

export const parseToolList = (value: string | null, validPaths: readonly string[]): string[] => {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return [...new Set(parsed.filter((item): item is string => typeof item === 'string' && validPaths.includes(item)))];
  } catch {
    return [];
  }
};

export const addRecentTool = (previous: readonly string[], path: string, limit = 3): string[] =>
  [path, ...previous.filter(item => item !== path)].slice(0, Math.max(0, limit));
