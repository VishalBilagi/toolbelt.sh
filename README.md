# [toolbelt.sh](https://toolbelt.sh)

A collection of small web tools for everyday developer and creator tasks.

Built with Astro, this project bundles several utilities into one fast, local-first interface.

## What’s included

- QR Code Generator (SVG/PNG output)
- Color Picker & Palette Extractor (from local images)
- SVG Resizer
- Encoding & Token Tools (Base64, URL/query helpers, JWT decode)
- Crypto Utilities (hashing, HMAC, UUID generation)

## Getting started

### Prerequisites


### Install

```bash
bun install
```

### Run locally

```bash
bun run dev
```

Then open the local Astro dev URL (usually `http://localhost:4321`).

## Scripts

- `bun run dev` - Start the Astro dev server
- `bun run build` - Production build
- `bun run preview` - Preview the production build locally
- `bun test` (or `bun run test`) - Run tests

## Project structure (high level)

- `src/pages/` - Routes and tool pages
- `src/tools/` - Tool logic and tests
- `src/components/` - Reusable UI components
- `src/layouts/` - Shared page layouts
- `src/styles/` - Global styles and theme tokens
- `src/data/tool-directory.ts` - Tool catalog metadata

## Contributing

If you add a new tool, a good place to start is:

1. Add the page in `src/pages/tools/`
2. Add the logic in `src/tools/<tool-name>/`
3. Register it in `src/data/tool-directory.ts`
4. Add tests when the tool has non-trivial logic
