export interface MergeResult {
  bytes: Uint8Array;
  pageCount: number;
}

export interface ExtractResult {
  bytes: Uint8Array;
  pageCount: number;
}

let pdfLibPromise: Promise<typeof import('pdf-lib')> | null = null;

const getPdfLib = async (): Promise<typeof import('pdf-lib')> => {
  if (!pdfLibPromise) {
    pdfLibPromise = import('pdf-lib');
  }

  return pdfLibPromise;
};

const normalizePageSelection = (selectedPages: number[], totalPages: number): number[] => {
  const normalized = new Set<number>();

  for (const page of selectedPages) {
    if (!Number.isInteger(page)) {
      throw new Error('Page selection must use whole numbers only.');
    }

    if (page < 1 || page > totalPages) {
      throw new Error(`Page ${page} is out of range. Enter values between 1 and ${totalPages}.`);
    }

    normalized.add(page);
  }

  return [...normalized].sort((left, right) => left - right);
};

export const parsePageSelection = (input: string): number[] => {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('Enter at least one page number (example: 1,3-5).');
  }

  const pages = new Set<number>();
  const tokens = trimmed
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    throw new Error('Enter at least one page number (example: 1,3-5).');
  }

  for (const token of tokens) {
    if (token.includes('-')) {
      const [rawStart, rawEnd] = token.split('-').map((part) => part.trim());
      const start = Number.parseInt(rawStart ?? '', 10);
      const end = Number.parseInt(rawEnd ?? '', 10);

      if (Number.isNaN(start) || Number.isNaN(end)) {
        throw new Error(`Invalid page range "${token}".`);
      }

      const rangeStart = Math.min(start, end);
      const rangeEnd = Math.max(start, end);

      for (let page = rangeStart; page <= rangeEnd; page += 1) {
        pages.add(page);
      }

      continue;
    }

    const page = Number.parseInt(token, 10);
    if (Number.isNaN(page)) {
      throw new Error(`Invalid page value "${token}".`);
    }

    pages.add(page);
  }

  return [...pages].sort((left, right) => left - right);
};

export const mergePdfFiles = async (pdfFiles: Uint8Array[]): Promise<MergeResult> => {
  if (pdfFiles.length < 2) {
    throw new Error('Select at least two PDF files to merge.');
  }

  const { PDFDocument } = await getPdfLib();
  const mergedPdf = await PDFDocument.create();

  for (const fileBytes of pdfFiles) {
    const sourcePdf = await PDFDocument.load(fileBytes);
    const pageIndexes = sourcePdf.getPageIndices();
    const copiedPages = await mergedPdf.copyPages(sourcePdf, pageIndexes);

    for (const page of copiedPages) {
      mergedPdf.addPage(page);
    }
  }

  const bytes = await mergedPdf.save();

  return {
    bytes,
    pageCount: mergedPdf.getPageCount(),
  };
};

export const splitPdfIntoSinglePages = async (pdfBytes: Uint8Array): Promise<Uint8Array[]> => {
  const { PDFDocument } = await getPdfLib();
  const sourcePdf = await PDFDocument.load(pdfBytes);
  const pageCount = sourcePdf.getPageCount();

  if (pageCount === 0) {
    throw new Error('The selected PDF has no pages to split.');
  }

  const results: Uint8Array[] = [];

  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    const nextDocument = await PDFDocument.create();
    const [copiedPage] = await nextDocument.copyPages(sourcePdf, [pageIndex]);
    nextDocument.addPage(copiedPage);
    results.push(await nextDocument.save());
  }

  return results;
};

export const extractPdfPages = async (
  pdfBytes: Uint8Array,
  selectedPages: number[]
): Promise<ExtractResult> => {
  const { PDFDocument } = await getPdfLib();
  const sourcePdf = await PDFDocument.load(pdfBytes);
  const safePages = normalizePageSelection(selectedPages, sourcePdf.getPageCount());

  if (safePages.length === 0) {
    throw new Error('Select at least one page to extract.');
  }

  const extractedPdf = await PDFDocument.create();
  const sourcePageIndexes = safePages.map((pageNumber) => pageNumber - 1);
  const copiedPages = await extractedPdf.copyPages(sourcePdf, sourcePageIndexes);

  for (const page of copiedPages) {
    extractedPdf.addPage(page);
  }

  return {
    bytes: await extractedPdf.save(),
    pageCount: extractedPdf.getPageCount(),
  };
};
