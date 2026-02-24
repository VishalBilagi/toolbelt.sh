export function generateQR(text: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'classic' });
    
    worker.onmessage = (e) => {
      if (typeof e.data === 'string') {
        resolve(e.data);
      } else {
        const message =
          typeof e.data?.error === 'string' ? e.data.error : 'Failed to generate QR code.';
        reject(new Error(message));
      }
      worker.terminate();
    };
    
    worker.onerror = (e) => {
      reject(e);
      worker.terminate();
    };

    worker.postMessage({ text });
  });
}
