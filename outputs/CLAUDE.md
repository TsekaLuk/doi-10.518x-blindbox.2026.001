# CLAUDE.md

Claude-specific note: follow `AGENTS.md` first. This file exists so Claude Code can discover the same workspace contract.

Operational defaults:

- Read local `INDEX.md` before making changes.
- Ask only when local intent cannot be inferred from `INDEX.md`, nearby files, or naming.
- Do not place secrets, credentials, customer data, or production data in this workspace.
- When creating a durable folder, include `AGENTS.md`, `CLAUDE.md`, and `INDEX.md`.
- Keep generated build outputs, logs, screenshots, and recordings in `assets/` unless a repository explicitly owns them.

When work becomes reusable, extract a clean version into `share/`.
