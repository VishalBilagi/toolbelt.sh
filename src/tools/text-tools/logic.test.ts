import { describe, expect, test } from 'bun:test';

import {
  analyzeRegex,
  buildRegexHighlightSegments,
  diffText,
  normalizeRegexFlags,
  renderMarkdown
} from './logic';

describe('diffText', () => {
  test('creates line diff stats and unified patch output', () => {
    const result = diffText('alpha\nbeta\ngamma', 'alpha\nbeta changed\ngamma\ndelta', {
      fromFile: 'a/left.txt',
      toFile: 'b/right.txt'
    });

    expect(result.stats.additions).toBe(2);
    expect(result.stats.removals).toBe(1);
    expect(result.stats.changedBlocks).toBeGreaterThanOrEqual(1);
    expect(result.patch).toContain('--- a/left.txt');
    expect(result.patch).toContain('+++ b/right.txt');
    expect(result.patch).toContain('-beta');
    expect(result.patch).toContain('+beta changed');
    expect(result.patch).toContain('+delta');
  });

  test('falls back gracefully for larger inputs without throwing', () => {
    const left = Array.from({ length: 1800 }, (_, index) => `line-${index}`).join('\n');
    const right = `${left}\nextra`;
    const result = diffText(left, right);
    expect(result.stats.additions).toBe(1);
    expect(result.lines.at(-1)?.type).toBe('added');
  });
});

describe('renderMarkdown', () => {
  test('renders headings, emphasis, links, lists, and code fences', () => {
    const result = renderMarkdown(`# Title

Intro with **bold** and [link](https://example.com).

- one
- two

\`\`\`ts
const n = 1;
\`\`\`
`);

    expect(result.headings).toEqual([{ level: 1, text: 'Title', slug: 'title' }]);
    expect(result.wordCount).toBeGreaterThan(5);
    expect(result.html).toContain('<h1 id="title">Title</h1>');
    expect(result.html).toContain('<strong>bold</strong>');
    expect(result.html).toContain('<a href="https://example.com"');
    expect(result.html).toContain('<ul><li>one</li><li>two</li></ul>');
    expect(result.html).toContain('<pre><code class="language-ts">const n = 1;');
  });

  test('escapes raw html in markdown content', () => {
    const result = renderMarkdown('<script>alert(1)</script>');
    expect(result.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(result.html).not.toContain('<script>');
  });
});

describe('regex tools', () => {
  test('normalizes flags and rejects duplicates', () => {
    expect(normalizeRegexFlags(' gi ')).toBe('gi');
    expect(() => normalizeRegexFlags('gg')).toThrow('Duplicate regex flag: g');
  });

  test('analyzes regex matches with groups and highlights', () => {
    const result = analyzeRegex('(?<word>[a-z]+)', 'gd', 'one 22 two');

    expect(result.isGlobalLike).toBe(true);
    expect(result.matches).toHaveLength(2);
    expect(result.matches[0].namedGroups.word).toBe('one');
    expect(result.matches[0].groups[0].start).toBe(0);
    expect(result.matches[0].groups[0].end).toBe(3);

    const segments = buildRegexHighlightSegments('one 22 two', result.matches);
    expect(segments.map((segment) => `${segment.type}:${segment.text}`)).toEqual([
      'match:one',
      'plain: 22 ',
      'match:two'
    ]);
  });

  test('throws actionable errors for invalid patterns', () => {
    expect(() => analyzeRegex('[a-', 'g', 'test')).toThrow();
  });
});

