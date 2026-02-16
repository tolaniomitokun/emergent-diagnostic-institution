# The Emergent Diagnostic Institution

A self-governing AI diagnostic institution that debates complex medical cases through specialist agents, detects its own cognitive biases in real-time, evolves its team structure, and amends its clinical reasoning constitution.

Built for the **"Built with Opus 4.6: Claude Code Hackathon"** (Anthropic/Cerebral Valley, Feb 10-18, 2026).

## Quick Start

```bash
# Set environment variable for Agent Teams
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1

# Run a case through the institution
python orchestrator.py cases/case_001_diagnostic_odyssey.json
```

## Project Structure

```
emergent-diagnosis/
├── agents/                      # Agent definitions (Markdown + YAML frontmatter)
│   ├── cardiologist.md
│   ├── neurologist.md
│   ├── internist.md
│   ├── metacognitive_observer.md
│   ├── patient_translator.md
│   └── constitution_amender.md
├── shared/                      # File-based shared state
│   ├── cases/                   # Case input/history
│   ├── debate/                  # Specialist debate rounds (JSON)
│   ├── observer/                # Observer analysis + interrupts
│   ├── constitution/            # Living constitution + team topology
│   ├── output/                  # Final diagnosis + patient explanation
│   └── visualization/           # Frontend state polling
├── cases/                       # Demo case files
│   ├── case_001_diagnostic_odyssey.json
│   └── case_002_institution_evolves.json
└── orchestrator.py              # Main pipeline
```

## Architecture

- **Specialist Agents** run in parallel via Agent Teams, each analyzing the case through their domain lens
- **Metacognitive Observer** monitors reasoning quality and detects cognitive biases in real-time
- **Patient Translator** converts clinical reasoning into plain-language explanations
- **Constitution Amender** reviews outcomes and proposes institutional learning

## Key Features

- Real-time bias detection (anchoring, premature closure, confirmation bias)
- Observer can interrupt debate rounds when critical biases are detected
- Self-amending Clinical Constitution
- Team topology evolution based on case patterns
- Full audit trail for every diagnostic decision
