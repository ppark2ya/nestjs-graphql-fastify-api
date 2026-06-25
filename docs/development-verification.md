# Development Verification

Before pushing a PR, run the relevant build/test commands and an ESLint check.

For UI changes, include a non-mutating lint check for the changed files:

```bash
pnpm exec eslint apps/ui/src/path/to/changed-file.tsx
```

For broader TypeScript changes, run the repository lint check:

```bash
pnpm exec eslint "{apps,libs}/**/*.{ts,tsx}"
```

If the repository-wide lint check fails because of pre-existing files outside the
change, record the failing command and run a targeted lint check for the files
modified in the PR.

After merging a PR, always update the local `main` branch before starting the
next task:

```bash
git switch main
git pull --ff-only origin main
```

If `main` is checked out in another worktree, run the commands from that
worktree instead of switching branches in the current one.
