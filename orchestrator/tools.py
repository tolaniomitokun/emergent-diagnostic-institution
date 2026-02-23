"""
Tool Definitions & Handler — Observer-as-Orchestrator tool dispatch
===================================================================
Defines the 7 tools available to the Observer-orchestrator and a
ToolHandler class that dispatches tool calls to the appropriate
backend caller functions.
"""

import json
from pathlib import Path

from anthropic import AsyncAnthropic

from orchestrator.specialist_caller import (
    build_specialist_system_prompt,
    build_round_2_specialist_system_prompt,
    call_specialist,
)
from orchestrator.synthesis_caller import run_synthesis
from orchestrator.translator_caller import run_patient_translator
from orchestrator.amender_caller import run_constitution_amender
from orchestrator.utils import DEBATE_DIR, OUTPUT_DIR


# ── Tool Definitions (Anthropic API format) ─────────────────────────────────

TOOL_DEFINITIONS = [
    {
        "name": "call_specialist",
        "description": (
            "Call a specialist agent to analyze the case. Each specialist provides "
            "an independent diagnostic assessment in Round 1, or a debate-informed "
            "revised assessment in Round 2+. The specialist writes structured JSON "
            "output including diagnosis_hypothesis, confidence, key_evidence, and "
            "dissenting_considerations."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "specialist_type": {
                    "type": "string",
                    "enum": [
                        "neurologist",
                        "internist",
                        "cardiologist",
                        "geneticist",
                        "developmental_pediatrician",
                        "immunologist",
                        "endocrinologist",
                        "rheumatologist",
                    ],
                    "description": (
                        "The type of specialist to call. Standard types map to agent "
                        "definition files in agents/. Non-standard types (geneticist, "
                        "developmental_pediatrician, etc.) require a role_override."
                    ),
                },
                "round": {
                    "type": "integer",
                    "description": "The debate round number (1 for independent analysis, 2+ for debate rounds).",
                },
                "focus_instructions": {
                    "type": "string",
                    "description": (
                        "Specific instructions for what this specialist should focus on "
                        "in their analysis. Be detailed about which aspects of the case "
                        "require this specialist's expertise."
                    ),
                },
                "role_override": {
                    "type": "string",
                    "description": (
                        "Optional. Custom role description for specialists not defined "
                        "in agents/ (e.g., geneticist, developmental_pediatrician). "
                        "Provide a full role description including expertise and focus areas."
                    ),
                },
            },
            "required": ["specialist_type", "round", "focus_instructions"],
        },
    },
    {
        "name": "review_round",
        "description": (
            "Read all specialist outputs from a given debate round and return them "
            "formatted for review. Use this after all specialists in a round have "
            "completed to review their analyses before deciding next steps."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "round_number": {
                    "type": "integer",
                    "description": "The round number to review (e.g., 1 for Round 1 outputs).",
                },
            },
            "required": ["round_number"],
        },
    },
    {
        "name": "trigger_synthesis",
        "description": (
            "Trigger the Chief Diagnostician to synthesize all debate rounds into "
            "a final institutional diagnosis. Call this when sufficient convergence "
            "has been reached or the debate has produced enough signal. The synthesis "
            "weighs consensus, dissent, evidence quality, and bias corrections."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "convergence_assessment": {
                    "type": "string",
                    "description": (
                        "Your assessment of the convergence state: which specialists "
                        "agree, where dissent remains, and why you believe synthesis "
                        "is appropriate now."
                    ),
                },
            },
            "required": ["convergence_assessment"],
        },
    },
    {
        "name": "trigger_translation",
        "description": (
            "Trigger the Patient Translator to convert the final diagnosis into "
            "a plain-language explanation for the patient's family. Call this after "
            "synthesis is complete."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "translation_guidance": {
                    "type": "string",
                    "description": (
                        "Optional guidance for the translator — e.g., specific aspects "
                        "to emphasize, tone adjustments, or particular concerns the "
                        "family may have."
                    ),
                },
            },
            "required": [],
        },
    },
    {
        "name": "trigger_amendments",
        "description": (
            "Trigger the Constitution Amender to propose amendments to the clinical "
            "constitution based on lessons learned from this case. Call this after "
            "synthesis is complete."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "process_observations": {
                    "type": "string",
                    "description": (
                        "Optional observations about the diagnostic process that should "
                        "inform constitutional amendments — e.g., biases detected, "
                        "systemic failures, team composition gaps."
                    ),
                },
            },
            "required": [],
        },
    },
    {
        "name": "get_debate_state",
        "description": (
            "Return a compressed summary of the entire debate state so far: all "
            "rounds, specialist outputs, observer analyses, and current diagnosis "
            "status. Useful for orienting yourself or recovering context."
        ),
        "input_schema": {
            "type": "object",
            "properties": {},
            "required": [],
        },
    },
    {
        "name": "complete",
        "description": (
            "Signal that the diagnostic pipeline is complete. Call this as the final "
            "tool invocation after synthesis, translation, and amendments are done."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "summary": {
                    "type": "string",
                    "description": (
                        "A brief summary of the completed diagnostic process: "
                        "how many rounds, key findings, final diagnosis, and any "
                        "constitutional amendments proposed."
                    ),
                },
            },
            "required": ["summary"],
        },
    },
]


# ── Specialist Type → Agent File Mapping ────────────────────────────────────

# Standard specialists that have their own agent .md files
_STANDARD_AGENT_MAP = {
    "neurologist": "neurologist.md",
    "internist": "internist.md",
    "cardiologist": "cardiologist.md",
}

# Non-standard specialists that reuse an existing agent file + role_override
_OVERRIDE_AGENT_MAP = {
    "geneticist": "cardiologist.md",
    "developmental_pediatrician": "internist.md",
    "immunologist": "internist.md",
    "endocrinologist": "internist.md",
    "rheumatologist": "internist.md",
}


# ── ToolHandler ─────────────────────────────────────────────────────────────

class ToolHandler:
    """Dispatches tool calls from the Observer-orchestrator to backend functions."""

    def __init__(
        self,
        client: AsyncAnthropic,
        case_data: dict,
        constitution: str,
        agent_defs: dict,
        progress_reporter,
        context_manager,
    ):
        self.client = client
        self.case_data = case_data
        self.constitution = constitution
        self.agent_defs = agent_defs
        self.progress_reporter = progress_reporter
        self.context_manager = context_manager

        # Debate state tracking
        self.debate_state: dict[int, dict[str, dict]] = {}  # {round: {specialist: output}}
        self.observer_analyses: dict[int, dict] = {}  # {round: observer_output}
        self.diagnosis: dict | None = None
        self.translation: str | None = None
        self.amendments: list[dict] | None = None

    async def handle(self, tool_name: str, tool_input: dict) -> str:
        """Dispatch a tool call and return the result as a string."""
        # Emit progress event for the frontend
        self.progress_reporter.emit_tool_progress(tool_name, tool_input)

        dispatch = {
            "call_specialist": self._handle_call_specialist,
            "review_round": self._handle_review_round,
            "trigger_synthesis": self._handle_trigger_synthesis,
            "trigger_translation": self._handle_trigger_translation,
            "trigger_amendments": self._handle_trigger_amendments,
            "get_debate_state": self._handle_get_debate_state,
            "complete": self._handle_complete,
        }

        handler = dispatch.get(tool_name)
        if not handler:
            return f"ERROR: Unknown tool '{tool_name}'. Available tools: {list(dispatch.keys())}"

        try:
            return await handler(tool_input)
        except Exception as e:
            return f"ERROR in {tool_name}: {type(e).__name__}: {e}"

    # ── Tool Handlers ───────────────────────────────────────────────────────

    async def _handle_call_specialist(self, input: dict) -> str:
        """Call a specialist agent and return a summarized result."""
        specialist_type = input["specialist_type"]
        round_num = input["round"]
        focus_instructions = input["focus_instructions"]
        role_override = input.get("role_override")

        # 1. Determine agent definition and display name
        agent_file, agent_def, display_name = self._resolve_agent(
            specialist_type, role_override
        )

        # 2. Build the system prompt
        if round_num == 1:
            system_prompt = build_specialist_system_prompt(
                agent_def=agent_def,
                display_name=display_name,
                role_override=role_override,
                focus=focus_instructions,
                constitution=self.constitution,
            )
        else:
            system_prompt = build_round_2_specialist_system_prompt(
                agent_def=agent_def,
                display_name=display_name,
                role_override=role_override,
                focus=focus_instructions,
                constitution=self.constitution,
            )

        # 3. Build case JSON — for Round 2+, include prior round context
        case_json = json.dumps(self.case_data, indent=2)
        if round_num > 1:
            prior_context = self._build_prior_round_context(specialist_type, round_num)
            if prior_context:
                case_json += "\n\n" + prior_context

        # 4. Call the specialist
        result = await call_specialist(
            client=self.client,
            agent_def=agent_def,
            display_name=display_name,
            system_prompt=system_prompt,
            case_json=case_json,
        )

        # 5. Write output to disk
        round_dir = DEBATE_DIR / f"round_{round_num}"
        round_dir.mkdir(parents=True, exist_ok=True)
        output_path = round_dir / f"{specialist_type}.json"
        output_path.write_text(json.dumps(result, indent=2))

        # 6. Store in debate state
        if round_num not in self.debate_state:
            self.debate_state[round_num] = {}
        self.debate_state[round_num][specialist_type] = result

        # 7. Return summarized output to keep context compact
        summary = self.context_manager.summarize_specialist_output(result)
        return (
            f"Specialist '{specialist_type}' Round {round_num} complete.\n"
            f"Output summary:\n{summary}\n"
            f"(Full output saved to {output_path})"
        )

    async def _handle_review_round(self, input: dict) -> str:
        """Read all specialist outputs for a round and return them formatted."""
        round_number = input["round_number"]
        round_dir = DEBATE_DIR / f"round_{round_number}"

        # Collect outputs from disk (authoritative source)
        outputs = {}
        if round_dir.exists():
            for json_file in sorted(round_dir.glob("*.json")):
                try:
                    data = json.loads(json_file.read_text())
                    specialist_name = json_file.stem
                    outputs[specialist_name] = data
                except (json.JSONDecodeError, ValueError) as e:
                    outputs[json_file.stem] = {"error": f"Failed to parse: {e}"}

        if not outputs:
            return f"No specialist outputs found for Round {round_number} in {round_dir}."

        # Format into a structured review
        lines = [f"## Round {round_number} Specialist Outputs ({len(outputs)} specialists)\n"]

        for name, output in outputs.items():
            display = name.replace("_", " ").title()
            hypothesis = output.get("diagnosis_hypothesis", "N/A")
            confidence = output.get("confidence", "N/A")
            evidence = output.get("key_evidence", [])
            dissent = output.get("dissenting_considerations", [])
            bias_ack = output.get("bias_acknowledgment", "")

            lines.append(f"### {display}")
            lines.append(f"- **Hypothesis:** {hypothesis}")
            lines.append(f"- **Confidence:** {confidence}")

            if evidence:
                lines.append(f"- **Key Evidence:**")
                for e in evidence[:5]:
                    lines.append(f"  - {e}")

            if dissent:
                lines.append(f"- **Dissenting Considerations:**")
                for d in dissent[:3]:
                    lines.append(f"  - {d}")

            if bias_ack:
                lines.append(f"- **Bias Acknowledgment:** {bias_ack[:300]}")

            lines.append("")

        # Summary statistics
        hypotheses = [
            o.get("diagnosis_hypothesis", "N/A")
            for o in outputs.values()
            if isinstance(o, dict)
        ]
        confidences = [
            o.get("confidence", 0)
            for o in outputs.values()
            if isinstance(o, dict) and isinstance(o.get("confidence"), (int, float))
        ]

        lines.append("### Summary Statistics")
        lines.append(f"- Specialists reporting: {len(outputs)}")
        if confidences:
            lines.append(f"- Confidence range: {min(confidences):.2f} - {max(confidences):.2f}")
            lines.append(f"- Mean confidence: {sum(confidences) / len(confidences):.2f}")

        # Check for convergence
        unique_hypotheses = set(h.lower().strip() for h in hypotheses if h != "N/A")
        lines.append(f"- Unique hypotheses: {len(unique_hypotheses)}")
        if len(unique_hypotheses) == 1:
            lines.append("- **STATUS: Full convergence** — all specialists agree")
        elif len(unique_hypotheses) <= 2:
            lines.append("- **STATUS: Near convergence** — minor disagreement remains")
        else:
            lines.append("- **STATUS: Divergent** — significant disagreement across specialists")

        return "\n".join(lines)

    async def _handle_trigger_synthesis(self, input: dict) -> str:
        """Trigger the Chief Diagnostician to produce a final diagnosis."""
        convergence_assessment = input["convergence_assessment"]

        # Build r1 and r2 specialist dicts for the synthesis caller.
        # The synthesis caller expects exactly r1_specialists, r2_specialists,
        # r1_observer, and r2_observer. If we ran more than 2 rounds, we map:
        #   - Round 1 -> r1
        #   - Latest round -> r2
        sorted_rounds = sorted(self.debate_state.keys())

        if not sorted_rounds:
            return "ERROR: No debate rounds recorded. Call specialists before triggering synthesis."

        r1_round = sorted_rounds[0]
        r2_round = sorted_rounds[-1] if len(sorted_rounds) > 1 else sorted_rounds[0]

        r1_specialists = self.debate_state.get(r1_round, {})
        r2_specialists = self.debate_state.get(r2_round, {})

        r1_observer = self.observer_analyses.get(r1_round, {
            "note": "Observer analysis embedded in orchestrator reasoning (agentic mode)"
        })
        r2_observer = self.observer_analyses.get(r2_round, {
            "note": "Observer analysis embedded in orchestrator reasoning (agentic mode)"
        })

        # Include the convergence assessment in the observer data so the
        # Chief Diagnostician has access to the Observer's overall judgment.
        if isinstance(r2_observer, dict) and "convergence_assessment" not in r2_observer:
            r2_observer = dict(r2_observer)
            r2_observer["convergence_assessment"] = convergence_assessment

        print(f"\n  Observer convergence assessment: {convergence_assessment[:200]}")

        # Call synthesis
        self.diagnosis = await run_synthesis(
            client=self.client,
            case_data=self.case_data,
            r1_specialists=r1_specialists,
            r2_specialists=r2_specialists,
            r1_observer=r1_observer,
            r2_observer=r2_observer,
        )

        # Return summary
        primary = self.diagnosis.get("primary_diagnosis", "N/A")
        confidence = self.diagnosis.get("confidence", "N/A")
        differentials = self.diagnosis.get("differential_diagnoses", [])

        lines = [
            "## Synthesis Complete",
            f"- **Primary Diagnosis:** {primary}",
            f"- **Institutional Confidence:** {confidence}",
        ]
        if differentials:
            lines.append("- **Differential Diagnoses:**")
            for d in differentials[:5]:
                diag = d.get("diagnosis", "?")
                prob = d.get("probability", "?")
                lines.append(f"  - {diag} (p={prob})")

        next_steps = self.diagnosis.get("recommended_next_steps", [])
        if next_steps:
            lines.append("- **Recommended Next Steps:**")
            for step in next_steps[:5]:
                lines.append(f"  - {step}")

        dissent = self.diagnosis.get("dissenting_opinions", "")
        if dissent:
            lines.append(f"- **Dissenting Opinions:** {dissent[:300]}")

        lines.append(f"\n(Full diagnosis saved to {OUTPUT_DIR / 'final_diagnosis.json'})")
        return "\n".join(lines)

    async def _handle_trigger_translation(self, input: dict) -> str:
        """Trigger the Patient Translator to produce a plain-language explanation."""
        if not self.diagnosis:
            return "ERROR: No diagnosis available. Run trigger_synthesis first."

        _guidance = input.get("translation_guidance", "")

        self.translation = await run_patient_translator(
            client=self.client,
            case_data=self.case_data,
            diagnosis=self.diagnosis,
        )

        char_count = len(self.translation) if self.translation else 0
        preview_lines = (self.translation or "").strip().splitlines()[:10]
        preview = "\n".join(preview_lines)

        return (
            f"## Patient Translation Complete\n"
            f"- Length: {char_count} characters\n"
            f"- Preview:\n{preview}\n"
            f"...\n"
            f"(Full explanation saved to {OUTPUT_DIR / 'patient_explanation.md'})"
        )

    async def _handle_trigger_amendments(self, input: dict) -> str:
        """Trigger the Constitution Amender to propose amendments."""
        if not self.diagnosis:
            return "ERROR: No diagnosis available. Run trigger_synthesis first."

        _process_observations = input.get("process_observations", "")

        # Build observer analyses for r1 and r2.
        # Same mapping logic as synthesis: first round and latest round.
        sorted_rounds = sorted(self.observer_analyses.keys()) if self.observer_analyses else []

        if sorted_rounds:
            r1_round = sorted_rounds[0]
            r2_round = sorted_rounds[-1] if len(sorted_rounds) > 1 else sorted_rounds[0]
            r1_observer = self.observer_analyses.get(r1_round, {})
            r2_observer = self.observer_analyses.get(r2_round, {})
        else:
            # In agentic mode, the Observer's analyses are embedded in its
            # reasoning rather than stored as separate JSON. Provide context
            # from process_observations instead.
            r1_observer = {
                "note": "Observer analysis embedded in orchestrator reasoning (agentic mode)",
                "process_observations": _process_observations,
            }
            r2_observer = {
                "note": "Observer analysis embedded in orchestrator reasoning (agentic mode)",
                "process_observations": _process_observations,
            }

        self.amendments = await run_constitution_amender(
            client=self.client,
            agent_defs=self.agent_defs,
            case_data=self.case_data,
            constitution=self.constitution,
            r1_observer=r1_observer,
            r2_observer=r2_observer,
            diagnosis=self.diagnosis,
        )

        count = len(self.amendments) if self.amendments else 0
        lines = [f"## Constitution Amendments Complete", f"- {count} amendment(s) proposed"]

        if self.amendments:
            for a in self.amendments[:6]:
                aid = a.get("amendment_id", "?")
                atype = a.get("type", "?")
                section = a.get("affected_section", "?")
                proposal = a.get("proposal", "")
                lines.append(f"  - **{aid}** [{atype}] {section}: {proposal[:150]}")

        return "\n".join(lines)

    async def _handle_get_debate_state(self, input: dict) -> str:
        """Return a compressed summary of the entire debate state."""
        lines = ["## Debate State Summary\n"]

        # Rounds and specialist outputs
        if not self.debate_state:
            lines.append("No debate rounds recorded yet.")
        else:
            for round_num in sorted(self.debate_state.keys()):
                specialists = self.debate_state[round_num]
                lines.append(f"### Round {round_num} ({len(specialists)} specialists)")
                for name, output in specialists.items():
                    display = name.replace("_", " ").title()
                    hypothesis = output.get("diagnosis_hypothesis", "N/A")
                    confidence = output.get("confidence", "N/A")
                    lines.append(f"  - {display}: {hypothesis} (conf: {confidence})")
                lines.append("")

        # Observer analyses
        if self.observer_analyses:
            lines.append("### Observer Analyses")
            for round_num in sorted(self.observer_analyses.keys()):
                obs = self.observer_analyses[round_num]
                n_biases = len(obs.get("biases_detected", []))
                interrupt = obs.get("interrupt_recommended", False)
                quality = obs.get("reasoning_quality", {}).get("overall_score", "N/A")
                lines.append(
                    f"  - Round {round_num}: {n_biases} bias(es), "
                    f"quality={quality}, interrupt={'YES' if interrupt else 'no'}"
                )
            lines.append("")

        # Diagnosis status
        if self.diagnosis:
            lines.append("### Diagnosis")
            lines.append(f"  - Primary: {self.diagnosis.get('primary_diagnosis', 'N/A')}")
            lines.append(f"  - Confidence: {self.diagnosis.get('confidence', 'N/A')}")
        else:
            lines.append("### Diagnosis: Not yet synthesized")

        # Translation and amendments status
        lines.append(f"\n### Pipeline Status")
        lines.append(f"  - Translation: {'Complete' if self.translation else 'Pending'}")
        lines.append(f"  - Amendments: {'Complete' if self.amendments is not None else 'Pending'}")

        return "\n".join(lines)

    async def _handle_complete(self, input: dict) -> str:
        """Signal pipeline completion."""
        summary = input["summary"]

        # Write a completion summary to disk
        completion_record = {
            "status": "complete",
            "summary": summary,
            "rounds_completed": len(self.debate_state),
            "specialists_called": sum(len(s) for s in self.debate_state.values()),
            "diagnosis_produced": self.diagnosis is not None,
            "translation_produced": self.translation is not None,
            "amendments_proposed": len(self.amendments) if self.amendments else 0,
        }

        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        completion_path = OUTPUT_DIR / "pipeline_completion.json"
        completion_path.write_text(json.dumps(completion_record, indent=2))

        return (
            f"Pipeline complete. Summary recorded.\n"
            f"Rounds: {completion_record['rounds_completed']} | "
            f"Specialists: {completion_record['specialists_called']} | "
            f"Diagnosis: {'Yes' if completion_record['diagnosis_produced'] else 'No'} | "
            f"Translation: {'Yes' if completion_record['translation_produced'] else 'No'} | "
            f"Amendments: {completion_record['amendments_proposed']}"
        )

    # ── Internal Helpers ────────────────────────────────────────────────────

    def _resolve_agent(
        self, specialist_type: str, role_override: str | None
    ) -> tuple[str, dict, str]:
        """Resolve specialist_type to (agent_file, agent_def, display_name).

        Returns:
            agent_file: The .md filename used for the agent definition.
            agent_def: The parsed agent definition dict.
            display_name: Human-readable display name for the specialist.
        """
        display_name = specialist_type.replace("_", " ").title()

        # Standard specialist with its own agent file
        if specialist_type in _STANDARD_AGENT_MAP:
            agent_file = _STANDARD_AGENT_MAP[specialist_type]
            agent_def = self.agent_defs[agent_file]
            return agent_file, agent_def, display_name

        # Non-standard specialist that reuses an existing agent file
        if specialist_type in _OVERRIDE_AGENT_MAP:
            agent_file = _OVERRIDE_AGENT_MAP[specialist_type]
            agent_def = self.agent_defs[agent_file]
            # The role_override is required for non-standard specialists;
            # if not provided, construct a minimal one.
            if not role_override:
                role_override = (
                    f"You are a {display_name} specialist. Apply your domain expertise "
                    f"in {display_name.lower()} to analyze this case."
                )
            return agent_file, agent_def, display_name

        # Completely custom specialist — fall back to internist.md as base
        agent_file = "internist.md"
        agent_def = self.agent_defs.get(agent_file, self.agent_defs.get("neurologist.md"))
        if not role_override:
            role_override = (
                f"You are a {display_name} specialist. Apply your domain expertise "
                f"in {display_name.lower()} to analyze this case."
            )
        return agent_file, agent_def, display_name

    def _build_prior_round_context(self, specialist_type: str, current_round: int) -> str:
        """Build prior round context for Round 2+ specialists.

        Includes:
        - This specialist's own prior output (if any)
        - All other specialists' prior outputs
        - Observer analyses from prior rounds
        """
        parts = []

        # Gather all prior rounds
        prior_rounds = sorted(r for r in self.debate_state.keys() if r < current_round)

        if not prior_rounds:
            return ""

        # This specialist's own prior output
        for r in prior_rounds:
            own_output = self.debate_state.get(r, {}).get(specialist_type)
            if own_output:
                parts.append(
                    f"## Your Round {r} Analysis\n"
                    f"```json\n{json.dumps(own_output, indent=2)}\n```"
                )

        # Other specialists' prior outputs (from the most recent prior round)
        latest_prior = prior_rounds[-1]
        other_outputs = {
            name: output
            for name, output in self.debate_state.get(latest_prior, {}).items()
            if name != specialist_type
        }
        if other_outputs:
            parts.append(f"## Other Specialists' Round {latest_prior} Analyses")
            for name, output in other_outputs.items():
                display = name.replace("_", " ").title()
                parts.append(
                    f"### {display}\n"
                    f"```json\n{json.dumps(output, indent=2)}\n```"
                )

        # Observer analyses from prior rounds
        for r in prior_rounds:
            obs = self.observer_analyses.get(r)
            if obs:
                parts.append(
                    f"## Observer Round {r} Bias Report\n"
                    f"```json\n{json.dumps(obs, indent=2)}\n```"
                )

        return "\n\n".join(parts)

    def store_observer_analysis(self, round_num: int, analysis: dict):
        """Store an observer analysis for a given round.

        Called by the orchestrator loop when the Observer produces bias
        analyses as part of its reasoning (since in agentic mode, the
        Observer IS the orchestrator, its analyses may be stored
        explicitly via this method).
        """
        self.observer_analyses[round_num] = analysis
