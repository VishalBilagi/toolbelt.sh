import { describe, expect, test } from 'bun:test';

import { extractPdfPages, mergePdfFiles, parsePageSelection, splitPdfIntoSinglePages } from './logic';

const createPdfWithPageCount = async (count: number): Promise<Uint8Array> => {
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.create();

  for (let page = 0; page < count; page += 1) {
    pdf.addPage([300, 200 + page]);
  }

  return pdf.save();
};

const getPageCount = async (bytes: Uint8Array): Promise<number> => {
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.load(bytes);
  return pdf.getPageCount();
};

describe('parsePageSelection', () => {
  test('parses ranges and values in sorted order', () => {
    expect(parsePageSelection('4,1,2-3')).toEqual([1, 2, 3, 4]);
  });

  test('throws for invalid tokens', () => {
    expect(() => parsePageSelection('1,a')).toThrow('Invalid page value');
  });
});

describe('mergePdfFiles', () => {
  test('merges multiple PDFs into one document', async () => {
    const first = await createPdfWithPageCount(2);
    const second = await createPdfWithPageCount(3);

    const result = await mergePdfFiles([first, second]);

    expect(result.pageCount).toBe(5);
    await expect(getPageCount(result.bytes)).resolves.toBe(5);
  });
});

describe('splitPdfIntoSinglePages', () => {
  test('splits each source page into a single-page document', async () => {
    const source = await createPdfWithPageCount(3);
    const split = await splitPdfIntoSinglePages(source);

    expect(split).toHaveLength(3);

    for (const part of split) {
      await expect(getPageCount(part)).resolves.toBe(1);
    }
  });
});

describe('extractPdfPages', () => {
  test('extracts only the selected pages', async () => {
    const source = await createPdfWithPageCount(5);
    const result = await extractPdfPages(source, [2, 5]);

    expect(result.pageCount).toBe(2);
    await expect(getPageCount(result.bytes)).resolves.toBe(2);
  });

  test('throws when selection is out of range', async () => {
    const source = await createPdfWithPageCount(2);

    await expect(extractPdfPages(source, [3])).rejects.toThrow('out of range');
  });
});
