# Repository Guidelines

## Project Structure & Module Organization

- `src/`: React + TypeScript renderer (components, hooks, i18n, utilities). Use `@/…` imports for `src/*`.
- `src-tauri/`: Tauri (Rust) backend, commands, services, and app packaging (`tauri.conf.json`).
- `tests/`: Renderer tests (components, hooks, integration) plus MSW mocks (`tests/msw/`).
- `docs/`: Design/refactor notes and developer guides.
- `scripts/`: One-off build/asset scripts (icon generation, etc.).

## Build, Test, and Development Commands

This repo uses `pnpm` (see `packageManager` in `package.json`) and Node `>= 20` (`.node-version`).

- `pnpm install`: Install dependencies.
- `pnpm dev`: Run the full Tauri app in dev mode (builds Rust + starts Vite).
- `pnpm dev:renderer`: Run the Vite renderer only (fast UI iteration).
- `pnpm build`: Build the desktop app via Tauri.
- `pnpm typecheck`: TypeScript typecheck (`tsc --noEmit`).
- `pnpm test:unit` / `pnpm test:unit:watch`: Run unit tests (Vitest).
- `cd src-tauri && cargo test`: Run Rust tests for backend modules/commands.

## Coding Style & Naming Conventions

- TypeScript is `strict` with unused locals/params treated as errors (`tsconfig.json`).
- Formatting is enforced with Prettier: `pnpm format` / `pnpm format:check`.
- Tests follow `*.test.ts(x)` naming and live under `tests/` (keep test utilities in `tests/utils/`).

## Testing Guidelines

- Frameworks: `vitest` + `@testing-library/react` (jsdom) and `msw` for network mocking.
- Prefer testing public behavior (render + user events) over implementation details.
- For coverage, you can run `pnpm test:unit -- --coverage` (reporters: `text`, `lcov`).

## Commit & Pull Request Guidelines

- Commit messages generally follow Conventional Commits: `feat: …`, `fix: …`, `refactor: …`, `chore: …`, `docs: …`, `style(scope): …`, `fix(ci): …` (emoji prefixes appear in history; optional).
- PRs should include: a concise summary, how you tested (`pnpm typecheck`, `pnpm test:unit`, and/or `cargo test`), and screenshots/GIFs for UI changes.

## Security & Configuration Tips

- Never commit API keys, signing keys, or local machine paths. Tauri signing is handled via CI secrets.
- Avoid checking in build outputs (`dist/`, `src-tauri/target/`) unless the change explicitly requires it.
