# polysite

A personal portfolio + product showcase site rendered entirely as a fixed grid of
split-flap (Solari board) characters. See `docs/split-flap-site-brief.md` for the
full design brief and `CLAUDE.md` for project conventions.

## Commands

```sh
bun install        # install deps
bun run dev        # local dev server
bun run build      # type-check + production build
bun run preview    # preview the production build
bun run test:unit  # vitest
bun run test:e2e   # playwright (run `bunx playwright install` once first)
bun run lint       # eslint --fix
bun run format     # prettier --write
```

## Fonts

JetBrains Mono is self-hosted from `public/fonts/` (woff2, weights 400/500/700),
licensed under the SIL Open Font License (`public/fonts/OFL.txt`).
