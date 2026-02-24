export type DiffLineType = 'context' | 'added' | 'removed';

export interface DiffLine {
  type: DiffLineType;
  text: string;
  leftLineNumber: number | null;
  rightLineNumber: number | null;
}

export interface DiffStats {
  leftLineCount: number;
  rightLineCount: number;
  additions: number;
  removals: number;
  changedBlocks: number;
}

export interface TextDiffResult {
  lines: DiffLine[];
  stats: DiffStats;
  patch: string;
}

export interface UnifiedPatchOptions {
  fromFile?: string;
  toFile?: string;
}

interface DiffOp {
  type: 'equal' | 'add' | 'remove';
  text: string;
}

export interface MarkdownHeading {
  level: number;
  text: string;
  slug: string;
}

export interface MarkdownRenderResult {
  html: string;
  headings: MarkdownHeading[];
  wordCount: number;
  charCount: number;
}

export interface RegexMatchGroup {
  index: number;
  value: string | undefined;
  start: number | null;
  end: number | null;
  name?: string;
}

export interface RegexMatch {
  matchIndex: number;
  value: string;
  start: number;
  end: number;
  groups: RegexMatchGroup[];
  namedGroups: Record<string, string | undefined>;
}

export interface RegexAnalysisResult {
  pattern: string;
  flags: string;
  inputLength: number;
  isGlobalLike: boolean;
  matches: RegexMatch[];
}

export interface HighlightSegment {
  type: 'plain' | 'match';
  text: string;
  matchIndex?: number;
}

const LARGE_DIFF_MATRIX_LIMIT = 1_200_000;

const normalizeLineEndings = (value: string): string => value.replace(/\r\n?/g, '\n');

const splitLines = (value: string): string[] => {
  const normalized = normalizeLineEndings(value);
  if (normalized === '') return [];
  return normalized.split('\n');
};

const diffWithPrefixSuffixFallback = (leftLines: string[], rightLines: string[]): DiffOp[] => {
  let prefix = 0;
  while (
    prefix < leftLines.length &&
    prefix < rightLines.length &&
    leftLines[prefix] === rightLines[prefix]
  ) {
    prefix += 1;
  }

  let leftSuffix = leftLines.length - 1;
  let rightSuffix = rightLines.length - 1;
  while (
    leftSuffix >= prefix &&
    rightSuffix >= prefix &&
    leftLines[leftSuffix] === rightLines[rightSuffix]
  ) {
    leftSuffix -= 1;
    rightSuffix -= 1;
  }

  const ops: DiffOp[] = [];
  for (let index = 0; index < prefix; index += 1) {
    ops.push({ type: 'equal', text: leftLines[index] });
  }

  for (let index = prefix; index <= leftSuffix; index += 1) {
    if (index < leftLines.length) ops.push({ type: 'remove', text: leftLines[index] });
  }

  for (let index = prefix; index <= rightSuffix; index += 1) {
    if (index < rightLines.length) ops.push({ type: 'add', text: rightLines[index] });
  }

  for (let index = rightSuffix + 1; index < rightLines.length; index += 1) {
    ops.push({ type: 'equal', text: rightLines[index] });
  }

  return ops;
};

const diffLines = (leftLines: string[], rightLines: string[]): DiffOp[] => {
  const rows = leftLines.length;
  const cols = rightLines.length;

  if (rows === 0) return rightLines.map((text) => ({ type: 'add', text }));
  if (cols === 0) return leftLines.map((text) => ({ type: 'remove', text }));

  if (rows * cols > LARGE_DIFF_MATRIX_LIMIT) {
    return diffWithPrefixSuffixFallback(leftLines, rightLines);
  }

  const matrix: number[][] = Array.from({ length: rows + 1 }, () => Array<number>(cols + 1).fill(0));

  for (let row = rows - 1; row >= 0; row -= 1) {
    for (let col = cols - 1; col >= 0; col -= 1) {
      matrix[row][col] =
        leftLines[row] === rightLines[col]
          ? matrix[row + 1][col + 1] + 1
          : Math.max(matrix[row + 1][col], matrix[row][col + 1]);
    }
  }

  const ops: DiffOp[] = [];
  let row = 0;
  let col = 0;

  while (row < rows && col < cols) {
    if (leftLines[row] === rightLines[col]) {
      ops.push({ type: 'equal', text: leftLines[row] });
      row += 1;
      col += 1;
      continue;
    }

    if (matrix[row + 1][col] >= matrix[row][col + 1]) {
      ops.push({ type: 'remove', text: leftLines[row] });
      row += 1;
      continue;
    }

    ops.push({ type: 'add', text: rightLines[col] });
    col += 1;
  }

  while (row < rows) {
    ops.push({ type: 'remove', text: leftLines[row] });
    row += 1;
  }

  while (col < cols) {
    ops.push({ type: 'add', text: rightLines[col] });
    col += 1;
  }

  return ops;
};

const opsToDiffLines = (ops: DiffOp[]): DiffLine[] => {
  let leftLineNumber = 1;
  let rightLineNumber = 1;

  return ops.map((op) => {
    if (op.type === 'equal') {
      const line: DiffLine = {
        type: 'context',
        text: op.text,
        leftLineNumber,
        rightLineNumber
      };
      leftLineNumber += 1;
      rightLineNumber += 1;
      return line;
    }

    if (op.type === 'remove') {
      const line: DiffLine = {
        type: 'removed',
        text: op.text,
        leftLineNumber,
        rightLineNumber: null
      };
      leftLineNumber += 1;
      return line;
    }

    const line: DiffLine = {
      type: 'added',
      text: op.text,
      leftLineNumber: null,
      rightLineNumber
    };
    rightLineNumber += 1;
    return line;
  });
};

const countChangedBlocks = (lines: DiffLine[]): number => {
  let blocks = 0;
  let inBlock = false;

  for (const line of lines) {
    const isChanged = line.type !== 'context';
    if (isChanged && !inBlock) {
      blocks += 1;
      inBlock = true;
    } else if (!isChanged) {
      inBlock = false;
    }
  }

  return blocks;
};

export const buildUnifiedPatch = (left: string, right: string, options: UnifiedPatchOptions = {}): string => {
  const leftLines = splitLines(left);
  const rightLines = splitLines(right);
  const ops = diffLines(leftLines, rightLines);

  const fromFile = options.fromFile ?? 'a/input.txt';
  const toFile = options.toFile ?? 'b/output.txt';

  const header = [`--- ${fromFile}`, `+++ ${toFile}`, `@@ -1,${leftLines.length} +1,${rightLines.length} @@`];
  const body = ops.map((op) => {
    if (op.type === 'equal') return ` ${op.text}`;
    if (op.type === 'remove') return `-${op.text}`;
    return `+${op.text}`;
  });

  return [...header, ...body].join('\n');
};

export const diffText = (left: string, right: string, options: UnifiedPatchOptions = {}): TextDiffResult => {
  const leftLines = splitLines(left);
  const rightLines = splitLines(right);
  const ops = diffLines(leftLines, rightLines);
  const lines = opsToDiffLines(ops);

  const stats: DiffStats = {
    leftLineCount: leftLines.length,
    rightLineCount: rightLines.length,
    additions: lines.filter((line) => line.type === 'added').length,
    removals: lines.filter((line) => line.type === 'removed').length,
    changedBlocks: countChangedBlocks(lines)
  };

  return {
    lines,
    stats,
    patch: buildUnifiedPatch(left, right, options)
  };
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || 'section';

const safeLinkHref = (href: string): string => {
  const trimmed = href.trim();
  if (!trimmed) return '#';
  if (/^(https?:|mailto:|tel:|#|\/)/i.test(trimmed)) return trimmed;
  return '#';
};

const renderInlineMarkdown = (value: string): string => {
  const codeStore: string[] = [];
  let text = value.replace(/`([^`]+)`/g, (_match, code: string) => {
    const token = `__CODE_TOKEN_${codeStore.length}__`;
    codeStore.push(`<code>${escapeHtml(code)}</code>`);
    return token;
  });

  text = escapeHtml(text);

  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, href: string) => {
    const safeHref = escapeHtml(safeLinkHref(href));
    return `<a href="${safeHref}" target="_blank" rel="noreferrer noopener">${label}</a>`;
  });
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  text = text.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  text = text.replace(/_([^_\n]+)_/g, '<em>$1</em>');
  text = text.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  for (let index = 0; index < codeStore.length; index += 1) {
    text = text.replace(`__CODE_TOKEN_${index}__`, codeStore[index]);
  }

  return text;
};

const countWords = (value: string): number => {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
};

export const renderMarkdown = (source: string): MarkdownRenderResult => {
  const normalized = normalizeLineEndings(source);
  const lines = normalized.split('\n');
  const htmlChunks: string[] = [];
  const headings: MarkdownHeading[] = [];

  let index = 0;
  let inCodeBlock = false;
  let codeFenceLanguage = '';
  let codeBuffer: string[] = [];

  const flushCodeBlock = () => {
    const languageClass = codeFenceLanguage ? ` class="language-${escapeHtml(codeFenceLanguage)}"` : '';
    htmlChunks.push(`<pre><code${languageClass}>${escapeHtml(codeBuffer.join('\n'))}</code></pre>`);
    inCodeBlock = false;
    codeFenceLanguage = '';
    codeBuffer = [];
  };

  while (index < lines.length) {
    const line = lines[index];

    if (inCodeBlock) {
      if (/^```/.test(line)) {
        flushCodeBlock();
      } else {
        codeBuffer.push(line);
      }
      index += 1;
      continue;
    }

    const fenceMatch = line.match(/^```([\w-]+)?\s*$/);
    if (fenceMatch) {
      inCodeBlock = true;
      codeFenceLanguage = (fenceMatch[1] ?? '').trim();
      codeBuffer = [];
      index += 1;
      continue;
    }

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+?)\s*$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      const text = headingMatch[2].trim();
      const slug = slugify(text);
      headings.push({ level, text, slug });
      htmlChunks.push(`<h${level} id="${slug}">${renderInlineMarkdown(text)}</h${level}>`);
      index += 1;
      continue;
    }

    if (/^(\*\s*\*\s*\*|-{3,}|_{3,})\s*$/.test(line)) {
      htmlChunks.push('<hr />');
      index += 1;
      continue;
    }

    if (/^>\s?/.test(line)) {
      const quoteLines: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) {
        quoteLines.push(lines[index].replace(/^>\s?/, ''));
        index += 1;
      }
      htmlChunks.push(`<blockquote><p>${quoteLines.map(renderInlineMarkdown).join('<br />')}</p></blockquote>`);
      continue;
    }

    const unorderedMatch = line.match(/^[-*+]\s+(.+)$/);
    const orderedMatch = line.match(/^\d+\.\s+(.+)$/);
    if (unorderedMatch || orderedMatch) {
      const ordered = Boolean(orderedMatch);
      const items: string[] = [];
      while (index < lines.length) {
        const current = lines[index];
        const match = ordered ? current.match(/^\d+\.\s+(.+)$/) : current.match(/^[-*+]\s+(.+)$/);
        if (!match) break;
        items.push(`<li>${renderInlineMarkdown(match[1].trim())}</li>`);
        index += 1;
      }
      htmlChunks.push(`<${ordered ? 'ol' : 'ul'}>${items.join('')}</${ordered ? 'ol' : 'ul'}>`);
      continue;
    }

    const paragraph: string[] = [line];
    index += 1;
    while (index < lines.length) {
      const current = lines[index];
      if (
        !current.trim() ||
        /^```/.test(current) ||
        /^(#{1,6})\s+/.test(current) ||
        /^>\s?/.test(current) ||
        /^[-*+]\s+/.test(current) ||
        /^\d+\.\s+/.test(current) ||
        /^(\*\s*\*\s*\*|-{3,}|_{3,})\s*$/.test(current)
      ) {
        break;
      }
      paragraph.push(current);
      index += 1;
    }

    htmlChunks.push(`<p>${paragraph.map(renderInlineMarkdown).join('<br />')}</p>`);
  }

  if (inCodeBlock) flushCodeBlock();

  return {
    html: htmlChunks.join('\n'),
    headings,
    wordCount: countWords(source),
    charCount: source.length
  };
};

const SUPPORTED_REGEX_FLAGS = new Set(['d', 'g', 'i', 'm', 's', 'u', 'v', 'y']);

export const normalizeRegexFlags = (flags: string): string => {
  const compact = flags.replace(/\s+/g, '');
  const seen = new Set<string>();

  for (const flag of compact) {
    if (!SUPPORTED_REGEX_FLAGS.has(flag)) {
      throw new Error(`Unsupported regex flag: ${flag}`);
    }
    if (seen.has(flag)) {
      throw new Error(`Duplicate regex flag: ${flag}`);
    }
    seen.add(flag);
  }

  return compact;
};

const getGroupRanges = (match: RegExpExecArray): Array<[number, number] | undefined> | null => {
  const maybeIndices = match as RegExpExecArray & { indices?: Array<[number, number] | undefined> };
  return Array.isArray(maybeIndices.indices) ? maybeIndices.indices : null;
};

export const analyzeRegex = (pattern: string, flags: string, input: string): RegexAnalysisResult => {
  const normalizedFlags = normalizeRegexFlags(flags);

  let regex: RegExp;
  try {
    regex = new RegExp(pattern, normalizedFlags);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid regular expression.';
    throw new Error(message);
  }

  const isGlobalLike = regex.global || regex.sticky;
  const matches: RegexMatch[] = [];

  const pushMatch = (result: RegExpExecArray) => {
    const matchValue = result[0] ?? '';
    const start = result.index ?? 0;
    const end = start + matchValue.length;
    const groupRanges = getGroupRanges(result);
    const namedGroups = result.groups ? { ...result.groups } : {};

    const groups: RegexMatchGroup[] = [];
    for (let index = 0; index < result.length; index += 1) {
      const groupValue = result[index];
      const range = groupRanges?.[index];
      groups.push({
        index,
        value: groupValue,
        start: range ? range[0] : index === 0 ? start : null,
        end: range ? range[1] : index === 0 ? end : null
      });
    }

    if (result.groups) {
      for (const [name, value] of Object.entries(result.groups)) {
        const groupIndex = groups.findIndex((group) => group.index > 0 && group.value === value && !group.name);
        if (groupIndex >= 0) groups[groupIndex].name = name;
      }
    }

    matches.push({
      matchIndex: matches.length,
      value: matchValue,
      start,
      end,
      groups,
      namedGroups
    });
  };

  if (isGlobalLike) {
    regex.lastIndex = 0;
    let result: RegExpExecArray | null = regex.exec(input);
    while (result) {
      pushMatch(result);
      if (result[0] === '') {
        regex.lastIndex += 1;
      }
      result = regex.exec(input);
    }
  } else {
    const result = regex.exec(input);
    if (result) pushMatch(result);
  }

  return {
    pattern,
    flags: normalizedFlags,
    inputLength: input.length,
    isGlobalLike,
    matches
  };
};

export const buildRegexHighlightSegments = (input: string, matches: RegexMatch[]): HighlightSegment[] => {
  if (!matches.length || !input) return [{ type: 'plain', text: input }];

  const segments: HighlightSegment[] = [];
  let cursor = 0;

  for (const match of matches) {
    if (match.end <= match.start) continue;
    if (match.start > cursor) {
      segments.push({ type: 'plain', text: input.slice(cursor, match.start) });
    }

    if (match.start < cursor) continue;

    segments.push({
      type: 'match',
      text: input.slice(match.start, match.end),
      matchIndex: match.matchIndex
    });
    cursor = match.end;
  }

  if (cursor < input.length) {
    segments.push({ type: 'plain', text: input.slice(cursor) });
  }

  if (!segments.length) return [{ type: 'plain', text: input }];
  return segments;
};

