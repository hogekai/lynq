Pre-commit release preparation for the lynq monorepo.

## Steps

1. **Diff analysis**: Run `git diff --cached` and `git diff` to understand all staged and unstaged changes since the last commit. Read the current version from `packages/lynq/package.json` and the existing `CHANGELOG.md`.

2. **Semver judgment**: Based on the changes, determine the appropriate version bump:
   - **patch** (x.y.Z): bug fixes, documentation updates, internal refactors with no API surface change
   - **minor** (x.Y.0): new features, new middleware, new exports — backward-compatible additions
   - **major** (X.0.0): breaking changes — removed/renamed exports, changed signatures, dropped support
   Present your reasoning and the proposed new version. Ask for confirmation before proceeding.

3. **Version bump**: Update `"version"` in `packages/lynq/package.json` to the new version.

4. **Changelog update**: Prepend a new section to `CHANGELOG.md` following the existing format:
   ```
   ## [x.y.z] - YYYY-MM-DD

   ### Added / Changed / Fixed / Breaking Changes
   - concise description of each change
   ```
   Use today's date. Categorize changes under the appropriate heading(s). Keep descriptions concise — one line per change.

5. **Lint**: Run `pnpm biome check --write .` (or the project's configured lint command). If it fails, fix auto-fixable issues and report any remaining errors.

6. **Typecheck**: Run `pnpm typecheck`. If it fails, report the errors and attempt to fix them.

7. **Test**: Run tests with `cd packages/lynq && pnpm vitest run`. If any tests fail, report which ones failed and attempt to fix them. If unfixable, stop and report.

8. **Commit**: Stage all changed files (`package.json`, `CHANGELOG.md`, plus any lint-fixed files) and create a commit with the message `chore: bump to x.y.z + changelog`.

9. **Tag**: Create an annotated git tag `vx.y.z` pointing to the commit just created: `git tag -a vx.y.z -m "vx.y.z"`.

10. **Summary**: Report the final state — version, changelog entry, tag, and lint/typecheck/test results. Do NOT push — that's the user's next step.

## Notes
- Only bump `packages/lynq/package.json` (the core package). Other packages have independent versions.
- If there are no meaningful changes (working tree clean, nothing staged), say so and stop.
- The user may pass an argument to override the version bump level, e.g. `/prep-release minor`.
