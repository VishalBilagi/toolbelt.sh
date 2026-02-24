export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface HslColor {
  h: number;
  s: number;
  l: number;
}

export interface PaletteOptions {
  colorCount?: number;
  maxSamples?: number;
  iterations?: number;
  alphaThreshold?: number;
}

export interface CanvasRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

const distanceSq = (a: RgbColor, b: RgbColor): number =>
  (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2;

const roundColor = (color: RgbColor): RgbColor => ({
  r: Math.round(clamp(color.r, 0, 255)),
  g: Math.round(clamp(color.g, 0, 255)),
  b: Math.round(clamp(color.b, 0, 255))
});

export const mapClientPointToPixel = (
  clientX: number,
  clientY: number,
  rect: CanvasRect,
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number } => {
  const relativeX = (clientX - rect.left) / rect.width;
  const relativeY = (clientY - rect.top) / rect.height;
  return {
    x: clamp(Math.floor(relativeX * canvasWidth), 0, canvasWidth - 1),
    y: clamp(Math.floor(relativeY * canvasHeight), 0, canvasHeight - 1)
  };
};

export const samplePixel = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  x: number,
  y: number
): RgbColor => {
  const safeX = clamp(Math.round(x), 0, width - 1);
  const safeY = clamp(Math.round(y), 0, height - 1);
  const offset = (safeY * width + safeX) * 4;

  return {
    r: data[offset] ?? 0,
    g: data[offset + 1] ?? 0,
    b: data[offset + 2] ?? 0
  };
};

export const rgbToHex = ({ r, g, b }: RgbColor): string =>
  `#${[r, g, b].map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, '0')).join('')}`;

export const rgbToHsl = ({ r, g, b }: RgbColor): HslColor => {
  const red = clamp(r, 0, 255) / 255;
  const green = clamp(g, 0, 255) / 255;
  const blue = clamp(b, 0, 255) / 255;

  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const chroma = max - min;
  const lightness = (max + min) / 2;

  let hue = 0;
  if (chroma !== 0) {
    if (max === red) hue = ((green - blue) / chroma) % 6;
    else if (max === green) hue = (blue - red) / chroma + 2;
    else hue = (red - green) / chroma + 4;
  }

  hue = Math.round((hue * 60 + 360) % 360);
  const saturation = chroma === 0 ? 0 : chroma / (1 - Math.abs(2 * lightness - 1));

  return {
    h: hue,
    s: Math.round(saturation * 100),
    l: Math.round(lightness * 100)
  };
};

const collectSamples = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  maxSamples: number,
  alphaThreshold: number
): RgbColor[] => {
  const totalPixels = width * height;
  if (totalPixels === 0) return [];
  const stride = Math.max(1, Math.floor(Math.sqrt(totalPixels / Math.max(maxSamples, 1))));
  const samples: RgbColor[] = [];

  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const offset = (y * width + x) * 4;
      const alpha = data[offset + 3] ?? 0;
      if (alpha < alphaThreshold) continue;
      samples.push({
        r: data[offset] ?? 0,
        g: data[offset + 1] ?? 0,
        b: data[offset + 2] ?? 0
      });
    }
  }

  return samples;
};

const initializeCentroids = (samples: RgbColor[], count: number): RgbColor[] => {
  const centroids: RgbColor[] = [samples[0]];

  while (centroids.length < count && centroids.length < samples.length) {
    let farthestSample = samples[0];
    let farthestDistance = -1;

    for (const sample of samples) {
      const nearest = Math.min(...centroids.map((centroid) => distanceSq(sample, centroid)));
      if (nearest > farthestDistance) {
        farthestDistance = nearest;
        farthestSample = sample;
      }
    }

    centroids.push(farthestSample);
  }

  return centroids;
};

const dedupePalette = (colors: RgbColor[], threshold = 24): RgbColor[] => {
  const thresholdSq = threshold ** 2;
  const unique: RgbColor[] = [];

  for (const color of colors) {
    if (unique.some((candidate) => distanceSq(color, candidate) < thresholdSq)) continue;
    unique.push(color);
  }

  return unique;
};

export const extractPalette = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options: PaletteOptions = {}
): RgbColor[] => {
  const colorCount = clamp(Math.round(options.colorCount ?? 5), 1, 12);
  const maxSamples = Math.max(100, options.maxSamples ?? 4000);
  const iterations = clamp(Math.round(options.iterations ?? 10), 1, 50);
  const alphaThreshold = clamp(Math.round(options.alphaThreshold ?? 24), 0, 255);

  const samples = collectSamples(data, width, height, maxSamples, alphaThreshold);
  if (samples.length === 0) return [];

  const centroids = initializeCentroids(samples, colorCount);
  const assignments = new Int16Array(samples.length);

  for (let step = 0; step < iterations; step += 1) {
    for (let index = 0; index < samples.length; index += 1) {
      let closestIndex = 0;
      let closestDistance = Number.POSITIVE_INFINITY;

      for (let centroidIndex = 0; centroidIndex < centroids.length; centroidIndex += 1) {
        const distance = distanceSq(samples[index], centroids[centroidIndex]);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = centroidIndex;
        }
      }

      assignments[index] = closestIndex;
    }

    const sums = centroids.map(() => ({ r: 0, g: 0, b: 0, count: 0 }));
    for (let index = 0; index < samples.length; index += 1) {
      const sample = samples[index];
      const bucket = sums[assignments[index]];
      bucket.r += sample.r;
      bucket.g += sample.g;
      bucket.b += sample.b;
      bucket.count += 1;
    }

    for (let centroidIndex = 0; centroidIndex < centroids.length; centroidIndex += 1) {
      const bucket = sums[centroidIndex];
      if (!bucket.count) continue;
      centroids[centroidIndex] = {
        r: bucket.r / bucket.count,
        g: bucket.g / bucket.count,
        b: bucket.b / bucket.count
      };
    }
  }

  const counts = centroids.map(() => 0);
  for (const assignment of assignments) {
    counts[assignment] += 1;
  }

  const ordered = centroids
    .map((color, index) => ({ color: roundColor(color), count: counts[index] }))
    .sort((a, b) => b.count - a.count)
    .map((entry) => entry.color);

  return dedupePalette(ordered).slice(0, colorCount);
};

export const formatRgb = ({ r, g, b }: RgbColor): string => `rgb(${r}, ${g}, ${b})`;

export const formatHsl = ({ h, s, l }: HslColor): string => `hsl(${h}, ${s}%, ${l}%)`;
