---
name: offer-logging
description: After finishing notable work in any session, offer once, in one line, to log it as Matrix Reloaded evidence. Notable means shipped or merged work, a hard problem solved, a decision or design the user drove, an analysis, helping or coaching someone, giving or acting on feedback, or improving a process or Holacracy governance. Use at the end of such a piece of work, when the user has the Matrix Reloaded tracker set up. Not for routine or trivial tasks.
---

# Offer to log evidence

When a piece of notable work is done in this session, end your reply with one line offering to log it, e.g.:

> Want me to log this as Matrix Reloaded evidence (`/matrix-reloaded:log-evidence`)?

- Notable: shipped or merged work, a hard problem solved, a decision or design the user drove, an analysis, helping or coaching someone, giving or acting on feedback, improving a process or governance.
- Offer at most once per piece of work. Don't offer for routine or trivial tasks, or again after the user declined.
- Only offer when the tracker is set up: `node "${CLAUDE_PLUGIN_ROOT}/scripts/tracker.mjs" where` succeeds. Check silently; if it fails, don't offer.
- Never log without a yes. On a yes, follow the `matrix-reloaded:log-evidence` skill.
