# Loro Todo List

A lightweight reference app that shows what you can build with the [Loro](https://loro.dev) CRDT stack. The goal is to demonstrate how Loro enables local-first, real-time collaboration in a familiar todo list UI without running a custom backend.

## Why this example matters
- Illustrates how `loro-crdt`, `loro-mirror`, and `loro-mirror-react` fit together in a modern React project.
- Highlights Loro's strengths: offline-first data, peer collaboration via the hosted public sync service, and automatic conflict resolution.
- Provides a small codebase you can explore or fork when evaluating Loro for your own collaborative tools.

## Quick start
```bash
pnpm install
pnpm dev
```
The dev server runs on http://localhost:5173 and rebuilds the local Loro packages automatically.

To create a production build:
```bash
pnpm app:build
```

## Learn more
- Browse `src/App.tsx` for the UI and workspace flows, and `src/state/` for the CRDT schema, persistence helpers, and sync wiring.
- Read the [Loro docs](https://loro.dev/docs) for deeper explanations of the concepts used here.

## License
Released under the [GNU Affero General Public License v3.0](./LICENSE). Remember to keep the icon licenses noted in the source files if you redistribute the build.
