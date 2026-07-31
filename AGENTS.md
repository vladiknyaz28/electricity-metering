# AGENTS

## Agent skills

### Domain docs

Single-context: root `CONTEXT.md` + `docs/adr/`. Specs go to `docs/specs/`. See `docs/agents/domain.md`.

### Build chain

```txt
grill-with-docs → to-spec → handoff (optional)
```

- `/grill-me` — interview only, no docs
- `/grill-with-docs` — interview + update `CONTEXT.md` / ADRs via `/domain-modeling`
- `/to-spec` — synthesize a local markdown spec under `docs/specs/` (no issue tracker)
- `/handoff` — compact the session for another agent
