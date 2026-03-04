---
name: react-best-practices
description: React performance optimization guidelines from Vercel Engineering. Use when writing, reviewing, or refactoring React components, data fetching, state management, or bundle optimization in the UI project (apps/ui/).
---

# React Best Practices (Vercel Engineering)

Comprehensive performance optimization guide for React applications. 58 rules across 8 categories, prioritized by impact.

For full details with code examples, read `.claude/skills/react-best-practices-full.md`.

## Project Context

This project uses:
- React 19.2.4 with React Compiler (`babel-plugin-react-compiler`)
- Vite 7 (not Next.js) - skip Next.js-specific rules (API routes, RSC, `next/dynamic`)
- Apollo Client for data fetching (not SWR)
- Tailwind CSS 4 + shadcn/ui

## Applicable Rules by Priority

### 1. Eliminating Waterfalls (CRITICAL)
- `async-parallel` - Use `Promise.all()` for independent operations
- `async-defer-await` - Move await into branches where actually used

### 2. Bundle Size Optimization (CRITICAL)
- `bundle-barrel-imports` - Import directly, avoid barrel files
- `bundle-dynamic-imports` - Use `React.lazy()` for heavy components
- `bundle-defer-third-party` - Load analytics/logging lazily
- `bundle-conditional` - Load modules only when feature is activated
- `bundle-preload` - Preload on hover/focus for perceived speed

### 3. Client-Side Data Fetching (MEDIUM-HIGH)
- `client-event-listeners` - Deduplicate global event listeners
- `client-passive-event-listeners` - Use passive listeners for scroll/touch
- `client-localstorage-schema` - Version and minimize localStorage data

### 4. Re-render Optimization (MEDIUM)

**Note:** React Compiler handles most memoization automatically. These rules still apply for patterns the compiler cannot optimize.

- `rerender-derived-state-no-effect` - Derive state during render, not in useEffect
- `rerender-functional-setstate` - Use functional setState for stable callbacks
- `rerender-lazy-state-init` - Pass function to useState for expensive initial values
- `rerender-move-effect-to-event` - Put interaction logic in event handlers, not effects
- `rerender-transitions` - Use `startTransition` for non-urgent updates
- `rerender-use-ref-transient-values` - Use refs for transient frequent values (scroll, mouse)
- `rerender-defer-reads` - Don't subscribe to state only used in callbacks

### 5. Rendering Performance (MEDIUM)
- `rendering-content-visibility` - Use `content-visibility: auto` for long lists
- `rendering-hoist-jsx` - Extract static JSX outside components
- `rendering-conditional-render` - Use ternary, not `&&` for conditionals
- `rendering-usetransition-loading` - Prefer `useTransition` for loading state

### 6. JavaScript Performance (LOW-MEDIUM)
- `js-index-maps` - Build Map for repeated lookups
- `js-combine-iterations` - Combine multiple filter/map into one loop
- `js-early-exit` - Return early from functions
- `js-set-map-lookups` - Use Set/Map for O(1) lookups

### 7. Advanced Patterns (LOW)
- `advanced-event-handler-refs` - Store event handlers in refs for stable identity
- `advanced-init-once` - Initialize expensive resources once per app load

## Rules NOT Applicable to This Project

These rules are for Next.js App Router / RSC and don't apply:
- `async-api-routes`, `async-suspense-boundaries` (no Next.js)
- `server-*` rules (no RSC, no server components)
- `client-swr-dedup` (uses Apollo Client, not SWR)
- `rendering-hydration-*` (Vite SPA, no SSR)
- `rendering-activity` (React 19 experimental)
