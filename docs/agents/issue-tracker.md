# Issue tracker

Issues and new specs live as Markdown files under `.scratch/`.

- One feature per directory: `.scratch/<feature-slug>/`.
- Specs: `.scratch/<feature-slug>/spec.md`.
- Tickets: `.scratch/<feature-slug>/issues/<NN>-<slug>.md`,
  numbered from `01`, with one file per ticket.
- Record triage state in a `Status:` line near the top.
  Use the values in `triage-labels.md`.
- Append discussion under `## Comments`.
- Existing product documentation remains in `docs/specs/`.

When asked to publish, create the appropriate local file.
When asked to fetch a ticket, read its referenced file.
Resolve ambiguous ticket numbers within their feature directory.

## Wayfinder

- Map: `.scratch/<effort>/map.md`.
- Child tickets use the numbered issue paths above.
- Record `Type: research`, `prototype`, `grilling` or `task`.
- Wayfinder uses its own workflow statuses: `open`, `claimed`
  and `resolved`.
- Record dependencies as `Blocked by: NN, NN`.
- Pick the lowest-numbered open ticket whose dependencies
  are resolved.
- Set `Status: claimed` before starting work.
- On completion, append `## Answer`, set `Status: resolved`
  and add the finding plus its ticket link to the map.
