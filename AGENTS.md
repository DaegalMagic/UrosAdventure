# Local Wiki Agent Instructions

This project uses a local wiki at `.wiki/` as shared operating memory for coding
agents. The wiki is a lightweight, project-scoped adaptation of the same
LLM-wiki operating pattern used in other repositories: a human curates sources
and asks questions; the agent summarizes, cross-links, and keeps the knowledge
graph coherent and grounded in code.

## What To Read First

Before making non-trivial changes or answering project-context questions, read:

1. `.wiki/config.md`
2. `.wiki/_index.md`
3. The most relevant page under `.wiki/wiki/`

## Wiki Structure

The local wiki follows this shape:

```text
.wiki/
|- _index.md
|- config.md
|- log.md
|- raw/
|  |- _index.md
|  |- notes/
|  `- repos/
|- wiki/
|  |- _index.md
|  |- references/
|  `- topics/
`- output/
   `- _index.md
```

## Operating Rules

1. Indexes are navigation. Read indexes first and keep them current.
2. Raw sources are immutable summaries of evidence. Put synthesis in `wiki/`.
3. Keep project facts grounded in code (`index.html`, `css/`, `js/`),
   deterministic artifacts, and explicit user decisions.
4. If a claim is uncertain, label it conservatively instead of overstating it.
5. Update the wiki when core behavior, the game loop, input/rendering, state,
   asset pipeline, or delivery/deploy status changes in a way future agents
   would need to rediscover.
6. Append new work to `.wiki/log.md`; do not rewrite old log entries.

## Project Tooling

- This is a build-tool-free static web game (HTML/CSS/vanilla JS rendered to a
  `<canvas>`). There is no package manager, bundler, or framework.
- A dependency-free logic test harness lives in `tools/test/` (vm sandbox loads
  `js/*.js` in `index.html` order; named isolated cases per stage/system). Run
  `node tools/test.js` (all) or `node tools/test.js stage2` (filter by file or
  suite name). Non-zero exit on any failure (CI/pre-commit friendly). Add new
  checks as `t.test` cases in `tools/test/cases/*.js`; see
  `docs/test-refactor-plan.md` §6. (`tools/verify-split.js` is now a thin wrapper
  that just runs `tools/test.js`, kept for old call sites.)
- To run/verify visually, open `index.html` directly in a browser, or serve the
  folder statically (e.g. `python -m http.server 8000`) and load the page.
- The harness covers logic only (no render pixels). Pixel/visual "verification"
  still means loading the page and observing runtime behavior in the browser.
- Deployment is GitHub Pages via `.github/workflows/deploy.yml` on push to
  `main`. Keep the repository root free of secrets and non-public files, because
  the whole root is uploaded as the Pages artifact.
- Avoid introducing a build step, bundler, or framework unless the user
  explicitly asks; the no-build constraint is intentional.

## Evidence Labels

- `verified`: confirmed by repository code, deterministic artifacts, or direct
  inspection.
- `operational`: an intentionally followed project rule or workflow.
- `assumption`: a reasonable working interpretation that still needs checking.
- `open_question`: unresolved and should not drive implementation alone.

## Timestamp Discipline

- When recording current status, verification results, runtime observations, or
  environment findings in the wiki or related project docs, include an explicit
  local timestamp with timezone offset, for example `2026-05-30 17:30 +09:00`.

## Scope

This wiki is for common project operations only:

- current project shape
- important code entry points
- status snapshots
- operating conventions
- handoff context

Do not use it as a dumping ground for speculative design notes unless they are
clearly marked and tied to a real implementation need.
