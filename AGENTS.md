# AGENTS.md

## Purpose

This document is for coding agents working in this repository.
Follow these conventions to make changes that match existing code.

## Package Manager and Runtime

- Use `bun` for dependency and script execution.
- Do not use `npm` commands in this repo.
- Primary framework: Astro 6 (beta), TypeScript strict mode.

## Install / Build / Run Commands

- Install deps: `bun install`
- Start dev server: `bun run dev`
- Production build: `bun run build`
- Preview production build: `bun run preview`
- Run all tests: `bun test` (or `bun run test`)

## Test Commands (Including Single Test)

- Run a single test file:
  - `bun test src/tools/color-picker/logic.test.ts`
- Run tests by test name pattern:
  - `bun test -t "converts rgb values to hex and hsl"`
- Run tests in one tool folder:
  - `bun test src/tools/crypto`

Notes:
- Tests use Bun’s built-in runner (`import { describe, expect, test } from 'bun:test'`).
- Keep tests deterministic and side-effect free.

## Lint / Typecheck Status

- There is currently no dedicated lint script in `package.json`. If there is any addition made, you will update this file accordingly
- There is also no ESLint/Biome/Prettier config committed. If there is any addition made, you will update this file accordingly
- Type safety comes from:
  - TypeScript strict config (`tsconfig.json` extends `astro/tsconfigs/strict`)
  - Build + test validation.
- Optional diagnostics command:
  - `bun run astro check`
  - If missing, install `@astrojs/check` and `typescript` when explicitly requested.

## Project Layout

- `src/pages/` route files (`.astro` pages)
- `src/pages/tools/` tool route entrypoints
- `src/tools/<tool>/logic.ts` pure/domain logic
- `src/tools/<tool>/logic.test.ts` unit tests for logic
- `src/components/ui/` reusable UI primitives
- `src/layouts/` shared app/tool shells
- `src/styles/` tokens + theme globals
- `src/data/tool-directory.ts` central tool metadata/catalog
- `src/lib/feature-flags.ts` LaunchDarkly browser-side integration

## Build Behavior Details

- `bun run build` executes `scripts/build-prod.mjs`.
- That script temporarily renames `src/pages/component-lib.astro` during build,
  then restores it afterward.
- Prefer `bun run build` over calling `astro build` directly.

## Code Style: TypeScript

- Use explicit types for exported APIs, interfaces, and return types.
- Keep utility logic mostly pure and testable.
- Prefer `const`; use `let` only when reassignment is required.
- Use narrow unions for domain choices (example: algorithm names).
- Keep helper functions small and composable.
- Use early returns to reduce nesting.
- Prefer `Number.parseInt`, `Number.parseFloat`, `Number(...)` over implicit coercion.
- Avoid `any`; if unavoidable, use `unknown` then narrow.

## Code Style: Imports

- Group imports at top of file.
- In tests, import from `bun:test` first, then local modules.
- Use relative imports that match existing project patterns.
- Avoid unused imports; keep import lists minimal.

## Code Style: Naming

- Types/interfaces: `PascalCase` (`ToolEntry`, `PaletteOptions`).
- Variables/functions: `camelCase` (`extractPalette`, `toolSections`).
- Constants: `UPPER_SNAKE_CASE` only for true constants (`MD5_K`).
- File names:
  - Tool logic/tests: `logic.ts`, `logic.test.ts`
  - Astro components/pages: `PascalCase.astro` for components, route-based for pages.

## Code Style: Astro Components

- Define `Props` interfaces in frontmatter when props are non-trivial.
- Destructure `Astro.props` near top.
- Keep markup semantic and accessible (`label`, `aria-*`, button types).
- Keep route pages thin; move reusable UI into `src/components/ui/`.
- Prefer composition with shared primitives (`Card`, `Button`, `Field`, etc.).

## Styling Conventions

- Use design tokens from `src/styles/tokens.css`.
- Reuse global classes from `src/styles/theme.css`.
- Prefer token variables over hardcoded colors/spacing.
- Keep gradients subtle; borders and surfaces should remain readable.
- Follow established naming patterns:
  - UI primitives: `ui-*`
  - Page-local classes: descriptive kebab-case.

## Error Handling Guidelines

- Throw explicit errors for invalid required inputs in logic layer.
- In UI/browser handlers, use `try/catch` around async file/clipboard APIs.
- Provide safe fallback states on failure (placeholder text, reset state).
- Don’t swallow errors silently; at minimum return fallback or log context.
- Keep user-facing error messages actionable and concise.

## Testing Guidelines

- Add/update tests for non-trivial logic changes.
- Prefer known vectors and deterministic fixtures.
- Cover edge cases (empty input, bounds clamping, invalid params).
- Keep tests focused on behavior, not implementation details.
- For bug fixes, add a regression test first when practical.

## Feature Flag Guidelines

- Feature flags are browser-only (`window` guarded) in `src/lib/feature-flags.ts`.
- Preserve fallback behavior when LaunchDarkly is unavailable.
- Avoid breaking initialization caching/state singleton behavior.

## Agent Workflow Expectations

- Make the smallest safe change that solves the request.
- Preserve existing architecture and naming unless asked to refactor.
- Run relevant tests for changed logic.
- Run `bun run build` before finalizing substantial UI/route changes.
- Do not commit or push unless explicitly asked.
- Assume the dev server is already up and running by the user

## Quick Command Reference

- `bun install`
- `bun run dev`
- `bun run build`
- `bun run preview`
- `bun test`
- `bun test src/tools/<tool>/logic.test.ts`
- `bun test -t "<test name pattern>"`
