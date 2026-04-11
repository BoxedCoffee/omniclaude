# OpenClaude Project Guidelines

## Code Style
- Follow existing style in touched files; keep changes focused and avoid unrelated refactors.
- Prefer small, readable edits and concise comments only when logic is non-obvious.
- Do not reformat unrelated files.
- Project uses ESM TypeScript (`"type": "module"`) and Bun tooling.

## Architecture
- CLI entrypoint is `src/entrypoints/cli.tsx`; startup orchestration begins in `src/main.tsx`.
- Keep module boundaries clear:
  - `src/tools/`: tool implementations
  - `src/services/`: API/provider integrations
  - `src/bridge/`: remote/session bridge paths
  - `src/components/`: Ink UI rendering
- Global bootstrap state is centralized in `src/bootstrap/state.ts`; avoid adding broad shared state unless required.
- Preserve startup ordering and bootstrap isolation patterns in startup files.

## Build and Test
- Install: `bun install`
- Build: `bun run build`
- Local run: `bun run dev`
- Typecheck: `bun run typecheck`
- Test (TS): `bun test`
- Focused test: `bun test ./path/to/test-file.test.ts`
- Python tests: `python -m pytest -q python/tests`
- Runtime checks: `bun run doctor:runtime`
- Privacy check: `bun run verify:privacy`

## Conventions
- Validate behavior changes with relevant tests.
- For provider changes, verify the exact provider/model path affected.
- Preserve security/privacy behavior:
  - Avoid leaking secrets to child processes or logs.
  - Keep telemetry/privacy guardrails intact (`scripts/verify-no-phone-home.ts`).
- Prefer linking to canonical docs rather than duplicating setup details.

## Platform Notes
- Windows source builds require Bun 1.3.11+.
- Windows environment variables in PowerShell use `$env:KEY="value"`.
- If runtime reports missing ripgrep, install system `rg` and verify `rg --version`.

## Reference Docs
- Contributor workflow and PR expectations: `CONTRIBUTING.md`
- General setup and provider usage: `README.md`
- Windows setup: `docs/quick-start-windows.md`
- macOS/Linux setup: `docs/quick-start-mac-linux.md`
- Advanced setup and routing examples: `docs/advanced-setup.md`
- LiteLLM proxy setup: `docs/litellm-setup.md`
- Security reporting policy: `SECURITY.md`
- Ollama-focused workflow: `PLAYBOOK.md`
