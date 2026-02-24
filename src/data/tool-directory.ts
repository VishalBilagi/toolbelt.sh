export type ToolIcon = 'qr' | 'crop' | 'svg' | 'data' | 'lock' | 'time';

export interface ToolEntry {
  name: string;
  href: string;
  description: string;
  tags: string[];
  icon: ToolIcon;
}

export interface ToolSection {
  id: string;
  title: string;
  tools: ToolEntry[];
}

export const toolSections: ToolSection[] = [
  {
    id: 'image-graphics',
    title: 'Image & Graphics',
    tools: [
      {
        name: 'QR Code Generator',
        href: '/tools/qr',
        description: 'Create customizable SVG/PNG QR codes instantly.',
        tags: ['qr', 'qrcode', 'svg', 'png', 'generator'],
        icon: 'qr'
      },
      {
        name: 'Color Picker & Palette Extractor',
        href: '/tools/color-picker',
        description: 'Sample image pixels and extract dominant color palettes.',
        tags: ['image', 'color', 'palette', 'extract', 'local'],
        icon: 'crop'
      },
      {
        name: 'SVG Resizer',
        href: '/tools/svg-resize',
        description: 'Scale and fix SVG dimensions without quality loss.',
        tags: ['svg', 'vector', 'resize'],
        icon: 'svg'
      }
    ]
  },
  {
    id: 'data-security',
    title: 'Data & Security',
    tools: [
      {
        name: 'Encoding & Token Tools',
        href: '/tools/encoding-token',
        description: 'Base64, URL/query editing, and JWT claim decoding utilities.',
        tags: ['base64', 'url', 'query', 'jwt', 'decode'],
        icon: 'data'
      },
      {
        name: 'Epoch Converter',
        href: '/tools/epoch',
        description: 'Convert epoch timestamps and ISO date/time values across precisions.',
        tags: ['epoch', 'timestamp', 'unix', 'timezone', 'date'],
        icon: 'time'
      },
      {
        name: 'Crypto Utilities',
        href: '/tools/crypto',
        description: 'SHA/MD5 hashing, HMAC signing, and UUID generation.',
        tags: ['hash', 'hmac', 'md5', 'sha', 'uuid'],
        icon: 'lock'
      }
    ]
  }
];

export const totalToolCount = toolSections.reduce((sum, section) => sum + section.tools.length, 0);
