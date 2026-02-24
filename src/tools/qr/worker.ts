/// <reference lib="webworker" />

type QrInstance = {
  addData: (data: string, mode?: string) => void;
  make: () => void;
  getModuleCount: () => number;
  isDark: (row: number, col: number) => boolean;
};

type QrFactory = (typeNumber: number, errorCorrectionLevel: 'L' | 'M' | 'Q' | 'H') => QrInstance;

const QR_LIBRARY_URL = 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js';

let libReady: Promise<void> | null = null;

const loadLibrary = (): Promise<void> => {
  if (libReady) return libReady;

  libReady = new Promise((resolve, reject) => {
    try {
      importScripts(QR_LIBRARY_URL);
      const factory = (self as unknown as { qrcode?: QrFactory }).qrcode;
      if (typeof factory !== 'function') {
        throw new Error('QR library failed to initialize.');
      }
      resolve();
    } catch (error) {
      // Allow future requests to retry loading after transient failures.
      libReady = null;
      reject(error);
    }
  });

  return libReady;
};

const buildSvgPath = (qr: QrInstance, quietZone = 4): { path: string; size: number } => {
  const modules = qr.getModuleCount();
  const pathSegments: string[] = [];

  for (let row = 0; row < modules; row += 1) {
    for (let col = 0; col < modules; col += 1) {
      if (!qr.isDark(row, col)) continue;
      const x = col + quietZone;
      const y = row + quietZone;
      pathSegments.push(`M${x},${y}h1v1h-1z`);
    }
  }

  return {
    path: pathSegments.join(''),
    size: modules + quietZone * 2
  };
};

self.onmessage = async (event: MessageEvent<{ text?: string }>) => {
  try {
    const input = (event.data?.text ?? '').trim();
    if (!input) {
      throw new Error('QR input is empty.');
    }

    await loadLibrary();
    const factory = (self as unknown as { qrcode: QrFactory }).qrcode;

    const qr = factory(0, 'M');
    qr.addData(input, 'Byte');
    qr.make();

    const { path, size } = buildSvgPath(qr);
    const outputSize = 320;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${outputSize}" height="${outputSize}" viewBox="0 0 ${size} ${size}" role="img" aria-label="QR code"><rect width="100%" height="100%" fill="#ffffff"/><path d="${path}" fill="#000000" shape-rendering="crispEdges"/></svg>`;

    self.postMessage(svg);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate QR code.';
    self.postMessage({ error: message });
  }
};
