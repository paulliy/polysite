# polysite

A personal portfolio + product showcase site rendered entirely as a fixed grid of
split-flap (Solari board) characters. See `docs/split-flap-site-brief.md` for the
full design brief and `CLAUDE.md` for project conventions.

## Commands

```sh
bun install                    # install deps
bun run dev                    # local dev server (vite)
bun run build                  # type-check (vue-tsc --build) + production build
bun run preview                # preview the production build
bun run test:unit               # vitest, watch mode
bun run test:unit run           # vitest, single run
bun run test:e2e                 # playwright, all projects (run `bunx playwright install` once first)
bun run test:e2e --project=chromium  # single browser project
bun run lint                       # eslint . --fix --cache
bun run format                       # prettier --write src/ (experimental CLI)
```

## Fonts

JetBrains Mono is self-hosted from `public/fonts/` (woff2, weights 400/500/700),
licensed under the SIL Open Font License (`public/fonts/OFL.txt`).
