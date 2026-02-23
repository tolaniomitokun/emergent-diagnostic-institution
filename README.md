# The Emergent Diagnostic Institution

A self-governing AI diagnostic institution where six specialized agents debate complex medical cases, detect their own cognitive biases in real-time, and evolve their clinical reasoning constitution after every case.

**[Live Demo](https://emergentdiagnostic-ai.up.railway.app)** | **[Demo Video](https://youtu.be/your-video-id)**

Built with Claude Opus 4.6 and Claude Code for the **"Built with Opus 4.6" Hackathon** (Anthropic/Cerebral Valley, Feb 2026).

---

## What It Does

Give the institution a patient case — paste clinical notes, upload medical records, or describe symptoms — and it runs a multi-agent diagnostic pipeline:

1. **Specialist agents** independently analyze the case through their domain expertise
2. **The Metacognitive Observer** reviews all analyses for cognitive biases (anchoring, premature closure, confirmation bias, diagnostic momentum)
3. **Specialists debate** in a second round, forced to address the biases the Observer detected
4. **The Chief Diagnostician** synthesizes everything into a final institutional diagnosis with calibrated confidence
5. **The Patient Translator** writes a plain-language explanation for the patient's family
6. **The Constitution Amender** proposes new institutional rules based on lessons learned

The institution gets smarter after every case.

## Showcase Case: Eli Reeves

A 14-year-old boy misdiagnosed with autism for 6 years while actually having CLN2 Disease (a treatable neurodegenerative condition). The institution processes 77,000 words of medical records spanning 8 doctors across 3 states and correctly identifies the diagnosis in under 15 minutes — something 8 real doctors missed over 14 years.

---

## Two Pipeline Modes

### Legacy Mode (Fixed Pipeline)
A deterministic 10-step pipeline: 3 specialists x 2 rounds + observer + synthesis + translation + amendments. Always the same team, always 2 rounds.

```bash
python orchestrator.py cases/case_001_diagnostic_odyssey.json
```

### Agentic Mode (Observer-as-Orchestrator)
The Observer becomes the orchestrator using Anthropic tool_use. It triages each case, selects 2-4 specialists based on the presenting symptoms, decides how many debate rounds to run, and triggers synthesis when it judges convergence is sufficient.

```bash
python orchestrator.py --mode=agentic cases/case_001_diagnostic_odyssey.json
```

In agentic mode, the Observer has 7 tools: `call_specialist`, `review_round`, `trigger_synthesis`, `trigger_translation`, `trigger_amendments`, `get_debate_state`, and `complete`. Loop guards enforce budget limits (max 4 rounds, 12 specialist calls, 20 tool calls, 20-minute timeout).

---

## The Six Agents

| Agent | Model | Role |
|-------|-------|------|
| **Neurologist** | Claude Opus 4.6 | Neurological and neurodegenerative expertise |
| **Internist** | Claude Opus 4.6 | General internal medicine (repurposed as Dev. Pediatrician or other specialists via role override) |
| **Cardiologist** | Claude Opus 4.6 | Cardiovascular expertise (repurposed as Geneticist via role override) |
| **Metacognitive Observer** | Claude Opus 4.6 | Bias detection, reasoning quality monitoring, orchestration (agentic mode) |
| **Patient Translator** | Claude Sonnet 4.5 | Translates clinical reasoning into family-friendly language |
| **Constitution Amender** | Claude Opus 4.6 | Proposes institutional learning after each case |

Agents are defined as Markdown files with YAML frontmatter in `agents/`. The system prompt, model, thinking configuration, and output schema are all specified per agent.

---

## Evaluation Cases

| # | Case | Diagnosis | Key Challenge |
|---|------|-----------|---------------|
| 1 | Eli Reeves — 14 Years of "We Don't Know" | CLN2 Disease (Batten) | ASD misdiagnosis masking neurodegeneration |
| 2 | Sofia Chen — The Institution Evolves | Anti-NMDA Receptor Encephalitis | Psychiatric presentation hiding autoimmune cause |
| 3 | Maria Santos — The Silent Fractures | Cushing's Syndrome | Subtle endocrine disorder mimicking metabolic syndrome |
| 4 | Harold Kimura — The Forgetting | Neurosyphilis | Rare infectious cause of cognitive decline |
| 5 | Baby Amara — 72 Hours | Truncus Arteriosus | Time-critical neonatal cardiac diagnosis |
| 6 | Nina Okafor — The Unraveling | Systemic Lupus Erythematosus | Multi-system autoimmune disease with psychiatric features |

---

## Tech Stack

- **Backend**: Python 3.12, Anthropic SDK, asyncio
- **Frontend**: React 18, Tailwind CSS, Framer Motion, Vite
- **Server**: Express.js with SSE (Server-Sent Events) for real-time pipeline progress
- **AI**: Claude Opus 4.6 (specialists, observer, amender), Claude Sonnet 4.5 (translator)
- **Deployment**: Railway (Docker, Node.js + Python dual runtime)

---

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+
- An Anthropic API key

### Setup

```bash
# Clone the repository
git clone https://github.com/tolaniomitokun/emergent-diagnostic-institution.git
cd emergent-diagnostic-institution

# Install Python dependencies
pip install anthropic pyyaml

# Install frontend dependencies
cd visualization
npm install
cd ..

# Set your API key
export ANTHROPIC_API_KEY=sk-ant-...
```

### Run a Diagnosis (CLI)

```bash
# Legacy mode (fixed pipeline)
python orchestrator.py cases/case_001_diagnostic_odyssey.json

# Agentic mode (Observer-as-Orchestrator)
python orchestrator.py --mode=agentic cases/case_001_diagnostic_odyssey.json
```

### Run the Web Interface

```bash
cd visualization

# Set environment variables
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
echo "ACCESS_CODES=YOUR_CODE" >> .env

# Start the dev server
npm run dev
```

The app will be available at `http://localhost:3001`.

---

## Project Structure

```
emergent-diagnosis/
├── agents/                          # Agent definitions (Markdown + YAML frontmatter)
│   ├── neurologist.md
│   ├── internist.md
│   ├── cardiologist.md
│   ├── metacognitive_observer.md
│   ├── patient_translator.md
│   └── constitution_amender.md
├── orchestrator.py                  # Entrypoint — delegates to legacy or agentic mode
├── orchestrator_legacy.py           # Legacy fixed 10-step pipeline
├── orchestrator/                    # Agentic pipeline package
│   ├── observer_orchestrator.py     # Main agentic loop (Observer-as-Orchestrator)
│   ├── tools.py                     # 7 tool definitions + ToolHandler
│   ├── specialist_caller.py         # Specialist prompt builders + API caller
│   ├── observer_caller.py           # Observer prompt builder + API caller
│   ├── synthesis_caller.py          # Chief Diagnostician synthesis
│   ├── translator_caller.py         # Patient Translator caller
│   ├── amender_caller.py            # Constitution Amender caller
│   ├── loop_guards.py               # Budget limits and safety mechanisms
│   ├── context_manager.py           # Token tracking and conversation compression
│   ├── progress_reporter.py         # Structured SSE event emission
│   └── utils.py                     # Paths, config, shared helpers
├── cases/                           # Evaluation case files (JSON)
├── shared/                          # Runtime shared state (file-based)
│   ├── debate/                      # Specialist outputs per round
│   ├── observer/                    # Observer bias analyses
│   ├── constitution/                # Living constitution + amendments log
│   └── output/                      # Final diagnosis + patient explanation
├── visualization/                   # React frontend + Express server
│   ├── server.js                    # Express API, SSE pipeline progress, access codes
│   ├── src/
│   │   ├── App.jsx                  # Routes and main layout
│   │   ├── sections/
│   │   │   ├── RunDiagnosis.jsx     # Interactive diagnosis runner (file upload, live progress)
│   │   │   ├── PatientTimeline.jsx  # Patient medical history visualization
│   │   │   ├── InstitutionAtWork.jsx # Debate rounds visualization
│   │   │   ├── Diagnosis.jsx        # Final diagnosis display
│   │   │   └── ...
│   │   └── pages/
│   │       ├── CaseResults.jsx      # Individual case results
│   │       ├── EvalSummary.jsx      # Cross-case evaluation
│   │       └── TitleCards.jsx       # Cinematic title cards for video
│   └── public/
│       ├── data/                    # Curated showcase data
│       └── test-files/              # Demo medical record files
└── Dockerfile                       # Multi-stage build for Railway deployment
```

---

## The Clinical Constitution

The institution operates under a living clinical constitution (`shared/constitution/constitution.md`) with four articles:

- **Article I: Diagnostic Integrity** — evidence-based reasoning, minimum 3 differential diagnoses, calibrated confidence
- **Article II: Cognitive Safety** — independent analysis before debate, premature convergence prevention, bias acknowledgment
- **Article III: Patient Safety** — "don't miss" diagnoses, regression red flags, diagnostic overshadowing detection
- **Article IV: Institutional Evolution** — constitutional amendments, team topology changes, continuous learning

After every case, the Constitution Amender proposes amendments based on lessons learned. The constitution has accumulated 40+ amendments across 6 cases.

---

## How Agents Are Built

Each agent is a Markdown file with YAML frontmatter:

```yaml
---
name: Neurologist
role: specialist
model: claude-opus-4-6
thinking:
  type: adaptive
  effort: high
output_path: /shared/debate/round_{N}/neurologist.json
---

# Neurologist Agent

## Role
You are a board-certified neurologist specializing in...

## Output Schema
{...}
```

The orchestrator parses these files, constructs system prompts by combining the agent's role definition with the clinical constitution and case-specific instructions, and makes individual API calls. Each specialist call is a single `messages.create()` — no agent memory, no tool use, no loops. The intelligence comes from the prompts and the multi-agent debate structure.

---

## License

This project is licensed under the [MIT License](LICENSE).

---

## Author

**Tolani Omitokun** — [@tolatokuns](https://x.com/tolatokuns)

Built in 8 days with Claude Opus 4.6 and Claude Code.
