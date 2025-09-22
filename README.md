# Loro Todo List

A lightweight reference app that shows what you can build with the [Loro](https://loro.dev) CRDT stack. The goal is to demonstrate how Loro enables local-first, real-time collaboration in a familiar todo list UI without running a custom backend.

## Why

- Show how `loro-crdt`, `loro-mirror`, and `loro-mirror-react` fit together in a modern React project.
- Highlights Loro's strengths: offline-first data, peer collaboration via the hosted public sync service, and automatic conflict resolution.
- Simple, collaborative, and account-free

## Collaboration & Sync

This project connects to the hosted Loro public sync server for real-time collaboration. Each client generates a P-256 key pair locally; the workspace public key plus a signature derived from the private key authenticate the WebSocket join request. Because the share URL encodes both the public key and the private key fragment, collaborators can join the same room just by visiting the shared link. Live synchronization currently relies on the closed-source `loro-protoco` and `loro-websocket` packages.

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

## License

Released under the [GNU Affero General Public License v3.0](./LICENSE). Remember to keep the icon licenses noted in the source files if you redistribute the build.
