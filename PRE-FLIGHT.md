# Pre-Flight Checklist 🚀

Before publishing `@git-stunts/alfred` to NPM, ensure all items below are checked off.

## 1. Documentation 📝
- [ ] **README.md**: Add documentation for `bulkhead` policy (concurrency limiting).
- [ ] **README.md**: Add documentation for Telemetry system (`ConsoleSink`, `InMemorySink`, options).
- [ ] **README.md**: Update `Policy` fluent API examples with `bulkhead` and telemetry usage.

## 2. Code Quality 🛡️
- [ ] **Linting**: Run `npm run lint` to ensure strict mode compliance (0 errors).
- [ ] **Testing**: Run `npm test` to ensure all 113+ tests pass.
- [ ] **Coverage**: Verify coverage remains >95% via `npx vitest run --coverage`.

## 3. Packaging 📦
- [ ] **Version**: Bump version in `package.json` from `0.1.0` to `0.2.0`.
- [ ] **Types**: Ensure `index.d.ts` exports `BulkheadOptions`, `BulkheadRejectedError`, and Telemetry interfaces.
- [ ] **Artifact**: Run `npm pack` and inspect the generated tarball to ensure no junk files are included and all source files are present.

## 4. Release 🚀
- [ ] **Git**: Tag the release `git tag v0.2.0`.
- [ ] **NPM**: Run `npm publish --access public` (or `--dry-run` first).
