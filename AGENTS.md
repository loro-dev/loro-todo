# Repository Guidelines

## Project Structure & Module Organization

The app is a Vite + React TypeScript client. Front-end logic lives in `src/`, with entry points in `src/main.tsx` and UI in `src/App.tsx`. Collaborative state helpers are grouped under `src/state/` (e.g., `doc.ts` for CRDT wiring, `storage.ts` for IndexedDB access, `publicSync.ts` for websocket sync). Reusable hooks and utilities sit alongside components (`src/useLongPressDrag.ts`, `src/NetworkStatusIndicator.tsx`). Static assets and the HTML shell live in `public/`, while production bundles land in `dist/`. Keep new modules colocated with their feature; shared primitives belong in `src/state/` or clearly named subfolders.

## Build, Test & Development Commands

Run `pnpm install` once to sync dependencies. Use `pnpm predev` to build bundled `loro-*` peer packages before local work. Launch the dev server with `pnpm dev` (pass `--host` when testing remote devices). Produce a production bundle via `pnpm app:build`, then smoke-test it with `pnpm preview --strictPort --port 5173`. Type integrity is enforced by `pnpm typecheck`.

## Coding Style & Naming Conventions

Follow the existing 4-space indentation, double quotes, and trailing semicolons shown in `src/App.tsx`. Components and React hooks use `PascalCase` and `camelCase` respectively (`NetworkStatusIndicator`, `useLongPressDrag`). Prefer named exports and explicit type aliases for shared structures. Keep side-effectful code inside hooks and `useEffect` blocks, and annotate async helpers with precise `Promise` return types.

## Testing Guidelines

A formal test harness is not yet wired in; when adding automated coverage, adopt Vitest with React Testing Library to match the Vite stack. Place specs beside the code (`src/state/doc.test.ts`) and mirror the filename suffix `*.test.ts`/`*.test.tsx`. Every new CRDT operation or persistence path should ship with regression tests and manual verification through `pnpm dev` in at least two browser sessions. Document manual test steps in the related PR.

## Commit & Pull Request Guidelines

Establish Conventional Commits (`feat:`, `fix:`, `chore:`) for clarity until a history exists. Commits should be scoped to one concern and include brief context on CRDT or sync implications. Pull requests must describe the change, outline test evidence (`pnpm dev`, `pnpm app:build`, `pnpm typecheck`), and add screenshots or GIFs when UI shifts. Link related issues or TODOs, and call out any migration steps for IndexedDB data or workspace keys.

# Development Guidelines

## Philosophy

### Core Beliefs

- **Incremental progress over big bangs** - Small changes that compile and pass tests
- **Learning from existing code** - Study and plan before implementing
- **Pragmatic over dogmatic** - Adapt to project reality
- **Clear intent over clever code** - Be boring and obvious

### Simplicity Means

- Single responsibility per function/class
- Avoid premature abstractions
- No clever tricks - choose the boring solution
- If you need to explain it, it's too complex
- Avoid over-engineering, don't write low-value docs/comments/tests. They'll increase the maintenance cost and make code review harder.
- Your changes should be easy to review. Please address the part that you want human to focus on by adding `TODO: REVIEW [reason]`.
- Don't test obvious things.

## Process

### 1. Planning & Staging

Break complex work into 3-5 stages. Document in `IMPLEMENTATION_PLAN.md`:

```markdown
## Stage N: [Name]

**Goal**: [Specific deliverable]
**Success Criteria**: [Testable outcomes]
**Tests**: [Specific test cases]
**Status**: [Not Started|In Progress|Complete]
```

- Update status as you progress
- Remove file when all stages are done

### 2. Implementation Flow

1. **Understand** - Study existing patterns in codebase
2. **Test** - Write test first (red)
3. **Implement** - Minimal code to pass (green)
4. **Refactor** - Clean up with tests passing
5. **Commit** - With clear message linking to plan

### 3. When Stuck (After 3 Attempts)

**CRITICAL**: Maximum 3 attempts per issue, then STOP.

1. **Document what failed**:
   - What you tried
   - Specific error messages
   - Why you think it failed

2. **Research alternatives**:
   - Find 2-3 similar implementations
   - Note different approaches used

3. **Question fundamentals**:
   - Is this the right abstraction level?
   - Can this be split into smaller problems?
   - Is there a simpler approach entirely?

4. **Try different angle**:
   - Different library/framework feature?
   - Different architectural pattern?
   - Remove abstraction instead of adding?

## Technical Standards

### Architecture Principles

- **Composition over inheritance** - Use dependency injection
- **Interfaces over singletons** - Enable testing and flexibility
- **Explicit over implicit** - Clear data flow and dependencies
- **Test-driven when possible** - Never disable tests, fix them

### Code Quality

- **Every commit must**:
  - Compile successfully
  - Pass all existing tests
  - Include tests for new functionality
  - Follow project formatting/linting

- **Before committing**:
  - Run formatters/linters
  - Self-review changes
  - Ensure commit message explains "why"

### Error Handling

- Fail fast with descriptive messages
- Include context for debugging
- Handle errors at appropriate level
- Never silently swallow exceptions

## Decision Framework

When multiple valid approaches exist, choose based on:

1. **Testability** - Can I easily test this?
2. **Readability** - Will someone understand this in 6 months?
3. **Consistency** - Does this match project patterns?
4. **Simplicity** - Is this the simplest solution that works?
5. **Reversibility** - How hard to change later?

## Project Integration

### Learning the Codebase

- Find 3 similar features/components
- Identify common patterns and conventions
- Use same libraries/utilities when possible
- Follow existing test patterns

### Tooling

- Use project's existing build system
- Use project's test framework
- Use project's formatter/linter settings
- Don't introduce new tools without strong justification

## Quality Gates

### Definition of Done

- [ ] Tests written and passing
- [ ] Code follows project conventions
- [ ] No linter/formatter warnings
- [ ] Commit messages are clear
- [ ] Implementation matches plan
- [ ] No TODOs without issue numbers

### Test Guidelines

- Test behavior, not implementation
- One assertion per test when possible
- Clear test names describing scenario
- Use existing test utilities/helpers
- Tests should be deterministic

## Important Reminders

**NEVER**:

- Use `--no-verify` to bypass commit hooks
- Disable tests instead of fixing them
- Commit code that doesn't compile
- Make assumptions - verify with existing code

**ALWAYS**:

- Commit working code incrementally
- Update plan documentation as you go
- Learn from existing implementations
- Stop after 3 failed attempts and reassess
