---
inclusion: always
---

# Task Execution

- Execute spec tasks one at a time, waiting for user confirmation between tasks.
- Do not proceed to the next task until the current one is verified and acknowledged.

# Shell Commands

- Prefer single-execution commands over long-running processes (no watch modes, no dev servers).
- Do NOT run `node --test` or any test commands. The user will run tests manually.
- Do NOT run `node -c` (syntax check). Assume files are syntactically correct and skip validation.
- If a command produces no output after 30 seconds, abort it and report the issue to the user.
- Never start persistent processes (e.g., `npm run dev`, file watchers) in blocking mode; recommend the user run those manually if needed.
