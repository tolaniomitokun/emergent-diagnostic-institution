# The Emergent Diagnostic Institution (EDI)

## What This Is
A six-agent AI diagnostic system built with Claude Opus 4.6 and Claude Code. Agents collaborate through structured debate to diagnose complex medical cases that have gone undiagnosed for years.

## Architecture
- **Python orchestrator** (`orchestrator.py`, 1335 lines) — runs the multi-agent pipeline via Anthropic API
- **React frontend** (`visualization/src/`) — 12 components, full interactive visualization
- **Express server** (`visualization/server.js`) — serves API, runs pipeline via SSE, access-code gated
- **6 AI agents** defined in `agents/` — neurologist, internist, cardiologist, metacognitive observer, patient translator, constitution amender
- **Constitutional framework** — `shared/constitution/constitution.md` governs agent behavior, evolves after every case

## Key Files
- `orchestrator.py` — main pipeline: case loading → Round 1 → Observer → Round 2 → Diagnosis → Patient Explanation → Constitutional Amendments
- `visualization/src/sections/RunDiagnosis.jsx` — the "Run a Diagnosis" interactive section (file upload, pipeline progress, demo mode)
- `visualization/src/App.jsx` — routes and main page layout
- `visualization/server.js` — Express server with `/api/run-diagnosis` SSE endpoint
- `cases/` — 6 evaluation cases (Eli Reeves, Sofia Chen, Maria Santos, Harold Kimura, Baby Amara, Nina Okafor)
- `visualization/public/data/` — curated showcase data for Eli Reeves (Case 001)
- `visualization/public/test-files/` — demo medical record files for all 6 cases

## Deployment
- **Live:** https://emergentdiagnostic-ai.up.railway.app
- **GitHub:** https://github.com/tolaniomitokun/emergent-diagnostic-institution
- **Docker-based** Railway deployment (Node.js + Python dual runtime)
- Env vars needed: `ANTHROPIC_API_KEY`, `ACCESS_CODES`

## Special Modes
- `?demo=true` on main page — simulates pipeline for video recording (no API key needed)
- `/titles` — cinematic title cards for video production
- `/eval` — evaluation summary across all 6 cases
- `/case/:caseId` — individual case results

## Known Patterns
- `copy-data.js` runs before dev/build — copies shared runtime files to public/data, but SKIPS files that already exist (to preserve curated showcase data)
- Access codes gate the "Run a Diagnosis" feature (not the showcase)
- The constitution gets amended after every pipeline run — amendments are case-specific
