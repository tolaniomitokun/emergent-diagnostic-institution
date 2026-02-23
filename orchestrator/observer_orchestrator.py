"""
Observer-as-Orchestrator — Agentic Pipeline
============================================
The Observer becomes the orchestrator: it triages the case, selects which
specialists to call, decides how many debate rounds to run, reviews for
biases in its own reasoning, triggers synthesis, translation, and
constitutional amendments — all via Anthropic tool_use.

This replaces the fixed 10-step pipeline with a dynamic, case-adaptive loop.
"""

import asyncio
import json
import sys
from pathlib import Path

from anthropic import AsyncAnthropic

from orchestrator.tools import TOOL_DEFINITIONS, ToolHandler
from orchestrator.loop_guards import LoopGuards
from orchestrator.context_manager import ContextManager
from orchestrator.progress_reporter import ProgressReporter
from orchestrator.utils import (
    load_case,
    load_constitution,
    load_agent_definitions,
    load_team_topology,
    SHARED_DIR,
    DEBATE_DIR,
    OBSERVER_DIR,
    OUTPUT_DIR,
)


# ── Observer-Orchestrator System Prompt ────────────────────────────────────

def _build_observer_orchestrator_prompt(
    observer_def: dict,
    constitution: str,
    team_topology: dict,
    case_data: dict,
) -> str:
    """Build the full system prompt for the Observer-as-Orchestrator.

    The Observer now has three responsibilities:
    1. Orchestration — decide which specialists to call, how many rounds, when to stop
    2. Bias detection — review specialist outputs for cognitive biases
    3. Quality control — ensure reasoning quality meets constitutional standards
    """
    # Available specialists from topology
    available_specialists = team_topology.get("available_specialists", [
        "neurologist", "internist", "cardiologist",
        "geneticist", "developmental_pediatrician",
        "immunologist", "endocrinologist", "rheumatologist",
    ])
    specialists_list = "\n".join(f"  - {s}" for s in available_specialists)

    # Any proposed topology changes from prior cases
    proposed_changes = team_topology.get("proposed_changes", [])
    topology_notes = ""
    if proposed_changes:
        topology_notes = "\n### Proposed Topology Changes (from prior cases)\n"
        for change in proposed_changes[-5:]:  # Last 5
            topology_notes += (
                f"  - {change.get('action', '?').upper()}: "
                f"{change.get('agent', '?')} — {change.get('rationale', '')[:150]}\n"
            )

    # Case summary for the prompt
    patient = case_data.get("patient", {})
    patient_summary = (
        f"Patient: {patient.get('name', 'Unknown')}, "
        f"Age {patient.get('age', '?')}, "
        f"{patient.get('sex', '?')}"
    )
    case_title = case_data.get("case_title", "Untitled Case")
    case_id = case_data.get("case_id", "unknown")

    return f"""You are the Metacognitive Observer AND Orchestrator for The Emergent Diagnostic Institution.

{observer_def['system_prompt']}

---

## Your Dual Role

### 1. Orchestrator
You decide the diagnostic strategy for each case:
- **Triage**: Analyze the case and determine which specialists are needed
- **Team selection**: Choose 2-4 specialists based on the presenting symptoms
- **Round management**: Run 1-4 debate rounds, deciding after each review whether more rounds are needed
- **Convergence detection**: Determine when sufficient diagnostic convergence has been reached
- **Pipeline control**: Trigger synthesis, translation, and amendments at the right time

### 2. Metacognitive Observer
After each debate round, you review the specialist outputs for:
- Cognitive biases (anchoring, premature closure, confirmation bias, etc.)
- Reasoning quality and evidence utilization
- Diagnostic breadth and whether dangerous conditions have been considered
- Whether specialists are engaging genuinely with feedback or just going through the motions

---

## Clinical Constitution
{constitution}

---

## Available Specialists
{specialists_list}
{topology_notes}

When calling non-standard specialists (geneticist, developmental_pediatrician, immunologist, endocrinologist, rheumatologist), provide a `role_override` describing their expertise.

---

## Orchestration Protocol

Follow this protocol for every case:

### Phase 1: Triage & Team Selection
1. Read the case carefully. Identify the key clinical features, red flags, and diagnostic puzzles.
2. Select 2-4 specialists whose expertise is most relevant.
3. Formulate specific focus instructions for each specialist — tell them exactly what aspects of the case require their domain expertise.

### Phase 2: Debate Rounds
4. Call your selected specialists for Round 1 (independent analysis).
5. After all Round 1 specialists complete, use `review_round` to see their outputs.
6. In your response after reviewing, provide your bias analysis — identify cognitive biases, reasoning quality issues, and whether the differential is broad enough.
7. Decide: Is another round needed?
   - **YES** if: significant biases detected, narrow differentials, low confidence, important conditions not considered
   - **NO** if: good convergence, broad differentials considered, high evidence quality
8. If YES: Call specialists for Round 2+ with focus instructions that address the biases you detected.
9. Review again. Repeat up to 4 rounds maximum.

### Phase 3: Synthesis & Completion
10. When ready, call `trigger_synthesis` with your convergence assessment.
11. Call `trigger_translation` to generate the patient-facing explanation.
12. Call `trigger_amendments` to propose constitutional improvements.
13. Call `complete` with a summary of the entire process.

---

## Budget Constraints
- Maximum 4 debate rounds
- Maximum 12 specialist calls total
- Maximum 20 tool calls total
- You MUST eventually call `trigger_synthesis`, `trigger_translation`, `trigger_amendments`, and `complete`

---

## Case Information
- **Case ID**: {case_id}
- **Title**: {case_title}
- **{patient_summary}**

Think carefully about the diagnostic strategy. The quality of the institution's diagnosis depends on YOUR orchestration decisions."""


# ── Main Agentic Loop ─────────────────────────────────────────────────────

async def run_observer_orchestrator(case_path: Path):
    """Run the Observer-as-Orchestrator agentic pipeline.

    The Observer receives tools and autonomously decides:
    - Which specialists to call
    - How many rounds to run
    - When to synthesize, translate, amend, and complete
    """
    client = AsyncAnthropic()

    # ── Setup ──────────────────────────────────────────────────────────
    print("\n" + "=" * 60)
    print("  THE EMERGENT DIAGNOSTIC INSTITUTION")
    print("  Mode: Agentic (Observer-as-Orchestrator)")
    print("=" * 60)

    # Initialize components
    progress = ProgressReporter(structured=True)
    guards = LoopGuards()
    context_mgr = ContextManager()

    # Load case data
    progress.emit_loading()
    print("\n[1] Loading case and resources...")

    case_data = load_case(case_path)
    case_id = case_data.get("case_id", "unknown")
    print(f"   Case: {case_data.get('case_title', 'Unknown')}")
    print(f"   Patient: {case_data.get('patient', {}).get('name', 'Unknown')}")

    constitution = load_constitution()
    print(f"   Constitution loaded ({len(constitution):,} chars)")

    agent_defs = load_agent_definitions()
    print(f"   Agent definitions loaded ({len(agent_defs)} agents)")

    # Load team topology (create default if missing)
    try:
        team_topology = load_team_topology()
    except FileNotFoundError:
        team_topology = {
            "available_specialists": [
                "neurologist", "internist", "cardiologist",
                "geneticist", "developmental_pediatrician",
                "immunologist", "endocrinologist", "rheumatologist",
            ],
            "proposed_changes": [],
        }
    print(f"   Team topology: {len(team_topology.get('available_specialists', []))} specialists available")

    # Ensure output directories exist
    for d in [DEBATE_DIR, OBSERVER_DIR, OUTPUT_DIR]:
        d.mkdir(parents=True, exist_ok=True)

    # ── Build system prompt ────────────────────────────────────────────
    observer_def = agent_defs.get("metacognitive_observer.md", {})
    system_prompt = _build_observer_orchestrator_prompt(
        observer_def=observer_def,
        constitution=constitution,
        team_topology=team_topology,
        case_data=case_data,
    )

    # ── Initialize tool handler ────────────────────────────────────────
    tool_handler = ToolHandler(
        client=client,
        case_data=case_data,
        constitution=constitution,
        agent_defs=agent_defs,
        progress_reporter=progress,
        context_manager=context_mgr,
    )

    # ── Build initial message with full case data ──────────────────────
    progress.emit_triage()

    # Remove full_medical_records from the case JSON to keep it manageable
    # in the initial message — the specialists get the full records directly
    case_summary = dict(case_data)
    full_records = case_summary.pop("full_medical_records", None)

    initial_message = (
        "## New Case Submitted for Diagnostic Review\n\n"
        f"```json\n{json.dumps(case_summary, indent=2)}\n```\n\n"
    )

    if full_records:
        # Include records but cap for the Observer's context
        records_preview = full_records[:50_000]
        if len(full_records) > 50_000:
            records_preview += f"\n\n[... {len(full_records) - 50_000:,} more characters in full records — specialists will receive the complete records ...]"
        initial_message += (
            "## Full Medical Records\n\n"
            f"```\n{records_preview}\n```\n\n"
        )

    initial_message += (
        "Please triage this case:\n"
        "1. Identify the key clinical features and diagnostic puzzles\n"
        "2. Select 2-4 specialists and explain your team composition rationale\n"
        "3. Call each specialist with targeted focus instructions\n"
    )

    messages = [{"role": "user", "content": initial_message}]

    # ── Agentic Loop ──────────────────────────────────────────────────
    print("\n" + "─" * 60)
    print("  Observer-Orchestrator loop starting...")
    print("─" * 60 + "\n")

    pipeline_complete = False

    while not pipeline_complete:
        guards.increment_iteration()

        # ── Check loop guards ──────────────────────────────────────────
        guard_result = guards.check()

        if guard_result.should_force_complete:
            print(f"\n  [GUARD] Forcing completion: {guard_result.reason}")
            progress.emit_complete()

            # If we have a diagnosis, wrap up; otherwise force synthesis first
            if not tool_handler.diagnosis:
                print("  [GUARD] No diagnosis yet — forcing synthesis...")
                try:
                    await tool_handler.handle("trigger_synthesis", {
                        "convergence_assessment": f"Forced by guard: {guard_result.reason}"
                    })
                except Exception as e:
                    print(f"  [GUARD] Forced synthesis failed: {e}")

            pipeline_complete = True
            break

        if guard_result.should_force_synthesis:
            print(f"\n  [GUARD] Forcing synthesis: {guard_result.reason}")
            # Inject a system message telling the Observer to synthesize
            messages.append({
                "role": "user",
                "content": (
                    f"[SYSTEM] Budget limit reached: {guard_result.reason}\n"
                    "You must now call `trigger_synthesis` to produce the final diagnosis, "
                    "then `trigger_translation`, `trigger_amendments`, and `complete`."
                ),
            })

        # ── Context compression ────────────────────────────────────────
        if context_mgr.approaching_limit(messages):
            print("  [CONTEXT] Compressing conversation history...")
            messages = context_mgr.compress(messages)

        # ── Call the Observer-Orchestrator ──────────────────────────────
        print(f"  [Loop {guards.iterations}] Calling Observer-Orchestrator... ({guards.summary()})")

        try:
            response = await client.messages.create(
                model=observer_def.get("model", "claude-opus-4-6"),
                max_tokens=16_000,
                thinking={"type": "adaptive"},
                system=system_prompt,
                tools=TOOL_DEFINITIONS,
                messages=messages,
            )
        except Exception as e:
            print(f"\n  [ERROR] API call failed: {type(e).__name__}: {e}")
            if guards.iterations >= 3:
                print("  [ERROR] Multiple failures — aborting pipeline.")
                pipeline_complete = True
                break
            # Wait briefly and retry
            await asyncio.sleep(2)
            continue

        # ── Process response ───────────────────────────────────────────

        # Append assistant message to conversation
        messages.append({"role": "assistant", "content": response.content})

        # Extract and print any text reasoning from the Observer
        for block in response.content:
            if hasattr(block, "text") and block.type == "text":
                text = block.text.strip()
                if text:
                    # Print the Observer's reasoning (truncated for readability)
                    preview = text[:500]
                    if len(text) > 500:
                        preview += f"\n    ...({len(text) - 500} more chars)"
                    print(f"\n  [Observer] {preview}\n")

        # ── Handle tool calls ──────────────────────────────────────────
        tool_use_blocks = [
            block for block in response.content
            if hasattr(block, "type") and block.type == "tool_use"
        ]

        if tool_use_blocks:
            tool_results = []

            for block in tool_use_blocks:
                tool_name = block.name
                tool_input = block.input

                print(f"  [Tool] {tool_name}({json.dumps(tool_input)[:200]})")

                # Record in guards
                guards.record_tool_call(tool_name, tool_input)

                # Execute the tool
                result = await tool_handler.handle(tool_name, tool_input)

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": block.id,
                    "content": result,
                })

                # Check for pipeline completion
                if tool_name == "complete":
                    pipeline_complete = True

            # Append tool results to conversation
            messages.append({"role": "user", "content": tool_results})

        elif response.stop_reason == "end_turn":
            # The Observer finished without calling any tools.
            # This might be a reasoning-only turn, or it might mean
            # the Observer is stuck. Nudge it to continue.
            print("  [Loop] Observer ended turn without tool calls — nudging...")
            messages.append({
                "role": "user",
                "content": (
                    "You ended your turn without calling any tools. "
                    "Please continue the diagnostic pipeline by calling the appropriate tool. "
                    "If you haven't started yet, call `call_specialist` for your selected specialists. "
                    "If debate rounds are done, call `trigger_synthesis`. "
                    "If everything is done, call `complete`."
                ),
            })

    # ── Pipeline Complete ──────────────────────────────────────────────
    elapsed = guards.elapsed_seconds()

    print("\n" + "=" * 60)
    print("  PIPELINE COMPLETE")
    print("=" * 60)
    print(f"  Duration: {elapsed:.0f}s ({elapsed/60:.1f} minutes)")
    print(f"  {guards.summary()}")

    if tool_handler.diagnosis:
        primary = tool_handler.diagnosis.get("primary_diagnosis", "N/A")
        confidence = tool_handler.diagnosis.get("confidence", "N/A")
        print(f"\n  Primary Diagnosis: {primary}")
        print(f"  Confidence: {confidence}")

        differentials = tool_handler.diagnosis.get("differential_diagnoses", [])
        if differentials:
            print(f"\n  Differential Diagnoses:")
            for d in differentials[:5]:
                print(f"    - {d.get('diagnosis', '?')} (p={d.get('probability', '?')})")

    if tool_handler.amendments:
        print(f"\n  Constitutional Amendments: {len(tool_handler.amendments)}")

    print(f"\n  Output files:")
    print(f"    Debate:      {DEBATE_DIR}")
    print(f"    Diagnosis:   {OUTPUT_DIR / 'final_diagnosis.json'}")
    print(f"    Translation: {OUTPUT_DIR / 'patient_explanation.md'}")
    print(f"    Amendments:  {SHARED_DIR / 'constitution' / 'amendments_log.json'}")
    print(f"    Completion:  {OUTPUT_DIR / 'pipeline_completion.json'}")
    print("=" * 60 + "\n")
