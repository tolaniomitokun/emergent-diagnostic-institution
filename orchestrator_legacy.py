"""
Emergent Diagnostic Institution — Full Pipeline Orchestrator
=============================================================
Round 1:  Independent specialist analysis → Observer bias detection
Round 2:  Debate with peer review + Observer feedback → Observer re-evaluation
Synthesis: Final diagnosis from debate record
Patient Translator: Plain-language explanation for family
Constitution Amender: Propose & apply institutional learning amendments

Usage:
    python orchestrator.py cases/case_001_diagnostic_odyssey.json
"""

import asyncio
import base64
import datetime
import json
import os
import re
import sys
from pathlib import Path

import yaml
from anthropic import AsyncAnthropic

# ── Paths ────────────────────────────────────────────────────────────────────

BASE_DIR = Path(__file__).resolve().parent
AGENTS_DIR = BASE_DIR / "agents"
SHARED_DIR = BASE_DIR / "shared"
DEBATE_DIR = SHARED_DIR / "debate"
OBSERVER_DIR = SHARED_DIR / "observer"
CONSTITUTION_PATH = SHARED_DIR / "constitution" / "constitution.md"
CURRENT_CASE_PATH = SHARED_DIR / "cases" / "current_case.json"
OUTPUT_DIR = SHARED_DIR / "output"
VISUALIZATION_STATE_PATH = SHARED_DIR / "visualization" / "state.json"

# ── Config ───────────────────────────────────────────────────────────────────

THINKING_BUDGET = {"high": 10_000, "max": 32_000}
TRANSLATOR_MODEL = "claude-sonnet-4-20250514"

ROUND_1_SPECIALISTS = [
    {
        "agent_file": "neurologist.md",
        "display_name": "Neurologist",
        "role_override": None,
        "focus": (
            "Focus on the neurological trajectory: seizure history (staring "
            "spells from age 2, EEG-confirmed epileptiform activity at age 9), "
            "progressive cerebellar atrophy across 4 MRI scans, motor "
            "regression pattern (walking → AFOs → wheelchair), and whether "
            "this is consistent with a neurodegenerative process vs. ASD."
        ),
    },
    {
        "agent_file": "internist.md",
        "display_name": "Developmental Pediatrician",
        "role_override": (
            "You are a board-certified developmental pediatrician. You "
            "specialize in childhood developmental disorders, autism spectrum "
            "diagnosis and differential, and recognizing when developmental "
            "regression indicates something other than ASD. You evaluate "
            "milestone trajectories, distinguish true autism from conditions "
            "that mimic it, and identify red flags for neurodegenerative "
            "processes masquerading as developmental disorders."
        ),
        "focus": (
            "Focus on the developmental timeline: milestone acquisition and "
            "loss, whether the ASD diagnosis at age 3.5 was justified given "
            "the full longitudinal history, and what the pattern of skill "
            "regression (buttoning, walking, speech) tells you about the "
            "true underlying condition. Specifically evaluate whether this "
            "trajectory is consistent with autism or with a progressive "
            "neurodegenerative disorder."
        ),
    },
    {
        "agent_file": "cardiologist.md",
        "display_name": "Geneticist",
        "role_override": (
            "You are a board-certified medical geneticist. You specialize in "
            "inherited metabolic disorders, neurogenetic conditions, and the "
            "genetic basis of neurodegenerative diseases in children. You "
            "evaluate biochemical markers, inheritance patterns, and "
            "genotype-phenotype correlations to identify rare genetic "
            "conditions that may be missed by other specialties."
        ),
        "focus": (
            "Focus on the metabolic and genetic findings: elevated lactate "
            "(2.8 mmol/L), mitochondrial DNA variant of uncertain "
            "significance, progressive cerebellar atrophy pattern, and which "
            "inherited neurometabolic or neurodegenerative conditions fit "
            "this trajectory. Consider NCL/Batten disease, mitochondrial "
            "disorders, Rett-like syndromes, and other storage diseases. "
            "Evaluate the autosomal recessive inheritance implications."
        ),
    },
]


# ── Utility Functions ────────────────────────────────────────────────────────

def parse_agent_definition(filepath: Path) -> dict:
    """Parse a .md agent file: extract YAML frontmatter + markdown body."""
    text = filepath.read_text()
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)", text, re.DOTALL)
    if not match:
        raise ValueError(f"No YAML frontmatter found in {filepath}")
    frontmatter = yaml.safe_load(match.group(1))
    frontmatter["system_prompt"] = match.group(2).strip()
    return frontmatter


def load_case(case_path: Path) -> dict:
    """Load a case JSON file and copy it to the shared current-case slot.

    If the case data contains a 'full_records_path' field, reads that file
    and embeds its contents into the case data under 'full_medical_records'.
    """
    if not case_path.exists():
        raise FileNotFoundError(f"Case file not found: {case_path}")
    case_data = json.loads(case_path.read_text())

    # Load expanded medical records if path is specified
    # Cap at ~400K chars to stay within the 200K token context window
    MAX_RECORDS_CHARS = 400_000
    full_records_path = case_data.get("full_records_path")
    if full_records_path:
        records_file = case_path.parent / full_records_path
        if not records_file.exists():
            # Try as absolute path
            records_file = Path(full_records_path)
        if records_file.exists():
            records_text = records_file.read_text()
            full_size = len(records_text)
            if full_size > MAX_RECORDS_CHARS:
                records_text = records_text[:MAX_RECORDS_CHARS]
                records_text += f"\n\n[... RECORDS TRUNCATED — showing {MAX_RECORDS_CHARS:,} of {full_size:,} total characters ...]"
                print(f"   📄 Loaded expanded records: {records_file.name} (truncated to {MAX_RECORDS_CHARS:,} of {full_size:,} chars)")
            else:
                print(f"   📄 Loaded expanded records: {records_file.name} ({full_size:,} chars)")
            case_data["full_medical_records"] = records_text
        else:
            print(f"   ⚠️  Full records file not found: {full_records_path}")

    CURRENT_CASE_PATH.write_text(json.dumps(case_data, indent=2))
    return case_data


def load_constitution() -> str:
    """Load the clinical constitution as plain text."""
    if not CONSTITUTION_PATH.exists():
        raise FileNotFoundError(f"Constitution not found: {CONSTITUTION_PATH}")
    return CONSTITUTION_PATH.read_text()


def extract_json(text: str) -> dict:
    """Extract JSON from a model response, handling code fences and preamble."""
    text = text.strip()

    # 1) Direct parse
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # 2) Extract from ```json ... ``` or ``` ... ```
    fence_match = re.search(r"```(?:json)?\s*\n?(.*?)\n?\s*```", text, re.DOTALL)
    if fence_match:
        try:
            return json.loads(fence_match.group(1).strip())
        except json.JSONDecodeError:
            pass

    # 3) Find outermost { ... }
    brace_start = text.find("{")
    brace_end = text.rfind("}")
    if brace_start != -1 and brace_end > brace_start:
        try:
            return json.loads(text[brace_start : brace_end + 1])
        except json.JSONDecodeError:
            pass

    raise ValueError(f"Could not extract JSON from response:\n{text[:500]}")


def normalize_specialist_output(parsed: dict, agent_key: str) -> dict:
    """Normalize specialist output to the simplified schema, handling cases
    where the model used the full schema from the agent .md file."""
    # Already in simplified format
    if "diagnosis_hypothesis" in parsed:
        return parsed

    # Map from the full nested schema (analysis.primary_hypothesis, etc.)
    analysis = parsed.get("analysis", {})
    if analysis and "primary_hypothesis" in analysis:
        return {
            "agent": agent_key,
            "round": parsed.get("round", 1),
            "timestamp": parsed.get("timestamp", ""),
            "diagnosis_hypothesis": analysis.get("primary_hypothesis", ""),
            "confidence": analysis.get("confidence", 0.0),
            "key_evidence": analysis.get("supporting_evidence", []),
            "dissenting_considerations": (
                analysis.get("contradicting_evidence", [])
                + [f"Alt: {d}" for d in analysis.get("differential", [])[1:4]]
            ),
        }

    return parsed


def update_visualization_state(status: str, case_id: str, round_num: int, phase: str):
    """Update shared/visualization/state.json."""
    state = {
        "status": status,
        "current_case": case_id,
        "current_round": round_num,
        "phase": phase,
        "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    }
    VISUALIZATION_STATE_PATH.write_text(json.dumps(state, indent=2))


# ── Prompt Builders ──────────────────────────────────────────────────────────

def build_specialist_system_prompt(
    agent_def: dict,
    display_name: str,
    role_override: str | None,
    focus: str,
    constitution: str,
) -> str:
    """Build the full system prompt for a specialist agent."""
    role_section = role_override if role_override else agent_def["system_prompt"]
    agent_key = display_name.lower().replace(" ", "_")

    return f"""You are participating in a multi-specialist diagnostic consultation as part of The Emergent Diagnostic Institution.

## Your Role
{role_section}

## Your Specific Focus for This Case
{focus}

## Clinical Constitution (You MUST follow these principles)
{constitution}

## CRITICAL: Round 1 Rules (Article 1.1)
This is Round 1. You MUST form your analysis INDEPENDENTLY. You have NOT seen any other specialist's output. Do not speculate about what others might think. Focus entirely on your own domain expertise applied to the case data.

## Required Output Format
Respond with ONLY valid JSON — no markdown fences, no preamble, no commentary outside the JSON object. Use exactly this schema:

{{
  "agent": "{agent_key}",
  "round": 1,
  "timestamp": "<current ISO-8601 timestamp>",
  "diagnosis_hypothesis": "<your primary diagnostic hypothesis>",
  "confidence": <float between 0.0 and 1.0>,
  "key_evidence": [
    "<specific evidence item citing ages, test values, imaging findings>"
  ],
  "dissenting_considerations": [
    "<alternative diagnoses or uncertainties you considered>"
  ]
}}

Be thorough. Cite specific data points from the case (ages, test results, imaging findings, timeline events). Your confidence score must reflect genuine uncertainty — per Article 1.4, overconfidence (>0.9) without definitive evidence triggers Observer review."""


def build_round_2_specialist_system_prompt(
    agent_def: dict,
    display_name: str,
    role_override: str | None,
    focus: str,
    constitution: str,
) -> str:
    """Build the system prompt for a Round 2 specialist (debate round)."""
    role_section = role_override if role_override else agent_def["system_prompt"]
    agent_key = display_name.lower().replace(" ", "_")

    return f"""You are participating in Round 2 of a multi-specialist diagnostic consultation as part of The Emergent Diagnostic Institution.

## Your Role
{role_section}

## Your Specific Focus for This Case
{focus}

## Clinical Constitution (You MUST follow these principles)
{constitution}

## CRITICAL: Round 2 Rules (Debate Phase)
This is Round 2. You have now seen:
- Your own Round 1 analysis
- All other specialists' Round 1 analyses
- The Metacognitive Observer's bias report and interrupt recommendation

The Metacognitive Observer has flagged potential biases in Round 1. You MUST:
1. **Acknowledge** which biases may have affected your reasoning in Round 1
2. **Either defend** your hypothesis with NEW evidence or reasoning not cited in Round 1, **or revise** your hypothesis based on colleagues' insights and the Observer's feedback
3. **Expand your differential** if the Observer flagged narrow thinking (Article 1.3 requires at least 3 differentials)
4. If you change your diagnosis, explain clearly WHY

You may now reference other specialists' findings. Collaboration is encouraged in Round 2, but do not simply agree — engage critically with their evidence.

## Required Output Format
Respond with ONLY valid JSON — no markdown fences, no preamble, no commentary outside the JSON object. Use exactly this schema:

{{
  "agent": "{agent_key}",
  "round": 2,
  "timestamp": "<current ISO-8601 timestamp>",
  "diagnosis_hypothesis": "<your primary diagnostic hypothesis — may be same or revised>",
  "confidence": <float between 0.0 and 1.0>,
  "key_evidence": [
    "<evidence items — include NEW evidence or reasoning not in Round 1>"
  ],
  "dissenting_considerations": [
    "<alternative diagnoses or uncertainties>"
  ],
  "bias_acknowledgment": "<which biases from the Observer's report may have affected your Round 1 reasoning, and what you did differently in Round 2>"
}}

Your confidence may go UP (if peer analyses reinforce your hypothesis) or DOWN (if valid challenges emerged). Be honest about uncertainty."""


def build_observer_system_prompt(observer_def: dict, constitution: str, round_num: int = 1) -> str:
    """Build the full system prompt for the Metacognitive Observer."""
    round_context = ""
    if round_num >= 2:
        round_context = """

## Round 2 Context
This is Round 2. The specialists have now seen each other's Round 1 analyses and your Round 1 bias report. Evaluate whether they:
- Genuinely engaged with the bias feedback or merely acknowledged it superficially
- Provided NEW evidence or reasoning (not just restated Round 1)
- Appropriately adjusted confidence levels
- Expanded their differentials where you recommended it
- Showed improved independence or just converged further"""

    return f"""You are the Metacognitive Observer for The Emergent Diagnostic Institution.

{observer_def['system_prompt']}

## Clinical Constitution
{constitution}{round_context}

## Required Output Format
Respond with ONLY valid JSON — no markdown fences, no preamble. Use exactly this schema:

{{
  "agent": "metacognitive_observer",
  "round": {round_num},
  "timestamp": "<ISO-8601>",
  "biases_detected": [
    {{
      "bias_type": "<anchoring|premature_closure|confirmation|availability|framing|bandwagon|diagnostic_momentum>",
      "agent": "<which specialist exhibited this>",
      "evidence": "<specific quote or reasoning pattern>",
      "severity": "<low|medium|high|critical>",
      "recommendation": "<what the team should do>"
    }}
  ],
  "reasoning_quality": {{
    "independence_score": <0.0-1.0>,
    "evidence_utilization": <0.0-1.0>,
    "differential_breadth": <0.0-1.0>,
    "overall_score": <0.0-1.0>
  }},
  "interrupt_recommended": <true or false>,
  "interrupt_reason": "<reason if true, empty string if false>"
}}"""


# ── API Calls ────────────────────────────────────────────────────────────────

async def call_specialist(
    client: AsyncAnthropic,
    agent_def: dict,
    display_name: str,
    system_prompt: str,
    case_json: str,
    attached_images: list[dict] | None = None,
) -> dict:
    """Call a single specialist via the Anthropic API and return parsed JSON."""
    print(f"  ⏳ Launching {display_name}...")

    effort = agent_def.get("thinking", {}).get("effort", "high")
    budget = THINKING_BUDGET.get(effort, 10_000)

    text_content_msg = (
        "## Case Data\n\n"
        "Analyze the following case and provide your independent diagnostic assessment.\n\n"
        f"```json\n{case_json}\n```\n\n"
    )
    if attached_images:
        text_content_msg += "The above images are attached medical records/scans for this case. Include observations from these images in your analysis.\n\n"
    text_content_msg += "Respond with ONLY the JSON object described in your instructions."

    # Build content blocks — include images if present
    content_blocks = []
    if attached_images:
        for img in attached_images:
            img_path = Path(img["path"])
            if img_path.exists():
                image_data = base64.b64encode(img_path.read_bytes()).decode("utf-8")
                content_blocks.append({
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": img["mime_type"],
                        "data": image_data,
                    },
                })
    content_blocks.append({"type": "text", "text": text_content_msg})

    async with client.messages.stream(
        model=agent_def["model"],
        max_tokens=16_000,
        thinking={"type": "adaptive"},
        system=system_prompt,
        messages=[{"role": "user", "content": content_blocks}],
    ) as stream:
        response = await stream.get_final_message()

    text_content = "".join(
        block.text for block in response.content if block.type == "text"
    )

    raw = extract_json(text_content)
    agent_key = display_name.lower().replace(" ", "_")
    parsed = normalize_specialist_output(raw, agent_key)
    hypothesis = parsed.get("diagnosis_hypothesis", "N/A")
    confidence = parsed.get("confidence", "N/A")
    print(f"  ✅ {display_name} complete — {hypothesis[:80]} (confidence: {confidence})")
    return parsed


async def call_observer(
    client: AsyncAnthropic,
    observer_def: dict,
    system_prompt: str,
    specialist_outputs: dict,
    case_data: dict,
    round_num: int = 1,
    prior_observer: dict | None = None,
) -> dict:
    """Call the Metacognitive Observer on specialist outputs for any round."""
    print(f"  ⏳ Launching Metacognitive Observer (Round {round_num})...")

    effort = observer_def.get("thinking", {}).get("effort", "max")
    budget = THINKING_BUDGET.get(effort, 32_000)

    specialist_text = ""
    for name, output in specialist_outputs.items():
        specialist_text += f"\n### {name}\n```json\n{json.dumps(output, indent=2)}\n```\n"

    prior_section = ""
    if prior_observer:
        prior_section = (
            f"\n## Your Round {round_num - 1} Analysis (for reference)\n"
            f"```json\n{json.dumps(prior_observer, indent=2)}\n```\n"
        )

    user_message = (
        "## Case Data\n"
        f"```json\n{json.dumps(case_data, indent=2)}\n```\n\n"
        f"## Round {round_num} Specialist Outputs\n"
        f"{specialist_text}\n"
        f"{prior_section}"
        "Analyze the reasoning quality and potential biases. Pay special attention to:\n"
        "1. Whether any specialist is anchoring on the existing ASD diagnosis\n"
        "2. Whether the differentials are broad enough (Article 1.3)\n"
        "3. Whether confidence scores are calibrated (Article 1.4)\n"
        f"4. Whether specialists {'independently ' if round_num == 1 else ''}converged (Article 2.3)\n"
        "5. Whether life-threatening conditions have been addressed (Article 3.1)\n\n"
        "Respond with ONLY the JSON object."
    )

    async with client.messages.stream(
        model=observer_def["model"],
        max_tokens=16_000,
        thinking={"type": "adaptive"},
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
    ) as stream:
        response = await stream.get_final_message()

    text_content = "".join(
        block.text for block in response.content if block.type == "text"
    )

    parsed = extract_json(text_content)
    n_biases = len(parsed.get("biases_detected", []))
    print(f"  ✅ Observer complete — {n_biases} bias(es) detected")
    return parsed


# ── Summary ──────────────────────────────────────────────────────────────────

def print_summary(specialist_outputs: dict, observer_result: dict, round_num: int = 1):
    """Print a human-readable summary of any round's results."""
    print("\n" + "=" * 70)
    print(f"  ROUND {round_num} SUMMARY — The Emergent Diagnostic Institution")
    print("=" * 70)

    # Specialists
    print("\n─── Specialist Analyses ───\n")
    for name, output in specialist_outputs.items():
        label = name.upper().replace("_", " ")
        if "error" in output:
            print(f"  {label}: FAILED — {output['error']}\n")
            continue

        hypothesis = output.get("diagnosis_hypothesis", "N/A")
        confidence = output.get("confidence", "N/A")
        evidence = output.get("key_evidence", [])
        dissenting = output.get("dissenting_considerations", [])

        print(f"  {label}")
        print(f"    Hypothesis:  {hypothesis}")
        print(f"    Confidence:  {confidence}")
        print(f"    Key Evidence:")
        for item in evidence[:4]:
            print(f"      • {item}")
        if len(evidence) > 4:
            print(f"      … and {len(evidence) - 4} more")
        print(f"    Dissenting Considerations:")
        for item in dissenting[:3]:
            print(f"      • {item}")
        print()

    # Observer
    print("─── Metacognitive Observer ───\n")
    biases = observer_result.get("biases_detected", [])
    quality = observer_result.get("reasoning_quality", {})
    interrupt = observer_result.get("interrupt_recommended", False)

    print(f"  Biases Detected: {len(biases)}")
    for b in biases:
        severity = b.get("severity", "unknown").upper()
        marker = " ⚠️" if severity in ("HIGH", "CRITICAL") else ""
        print(
            f"    [{severity}]{marker} {b.get('bias_type', '?')} "
            f"in {b.get('agent', '?')}"
        )
        print(f"      {b.get('evidence', '')[:120]}")
        print(f"      → {b.get('recommendation', '')[:120]}")

    print(f"\n  Reasoning Quality:")
    print(f"    Independence:     {quality.get('independence_score', 'N/A')}")
    print(f"    Evidence Use:     {quality.get('evidence_utilization', 'N/A')}")
    print(f"    Diff. Breadth:    {quality.get('differential_breadth', 'N/A')}")
    print(f"    Overall:          {quality.get('overall_score', 'N/A')}")

    if interrupt:
        print(f"\n  *** INTERRUPT RECOMMENDED ***")
        print(f"  Reason: {observer_result.get('interrupt_reason', 'N/A')}")
    else:
        print(f"\n  No interrupt recommended.")

    print("\n" + "=" * 70)


def print_round_comparison(r1_specialists: dict, r2_specialists: dict, r1_observer: dict, r2_observer: dict):
    """Print a side-by-side comparison of Round 1 vs Round 2."""
    print("\n" + "=" * 70)
    print("  ROUND 1 → ROUND 2 COMPARISON")
    print("=" * 70)

    # Specialist comparison
    print("\n─── Diagnosis & Confidence Changes ───\n")
    all_keys = list(r1_specialists.keys())
    for key in all_keys:
        label = key.upper().replace("_", " ")
        r1 = r1_specialists.get(key, {})
        r2 = r2_specialists.get(key, {})

        r1_hyp = r1.get("diagnosis_hypothesis", "N/A")
        r2_hyp = r2.get("diagnosis_hypothesis", "N/A")
        r1_conf = r1.get("confidence", "N/A")
        r2_conf = r2.get("confidence", "N/A")

        # Determine if hypothesis changed
        changed = "REVISED" if r1_hyp[:40] != r2_hyp[:40] else "maintained"

        # Confidence delta
        conf_delta = ""
        if isinstance(r1_conf, (int, float)) and isinstance(r2_conf, (int, float)):
            delta = r2_conf - r1_conf
            arrow = "↑" if delta > 0 else "↓" if delta < 0 else "→"
            conf_delta = f" ({arrow}{abs(delta):+.2f})"

        print(f"  {label}")
        print(f"    R1: {r1_hyp[:80]}")
        print(f"        confidence: {r1_conf}")
        print(f"    R2: {r2_hyp[:80]}")
        print(f"        confidence: {r2_conf}{conf_delta}  [{changed}]")

        # Bias acknowledgment
        ack = r2.get("bias_acknowledgment", "")
        if ack:
            print(f"    Bias response: {ack[:120]}")
        print()

    # Observer quality comparison
    print("─── Reasoning Quality: Round 1 → Round 2 ───\n")
    r1_q = r1_observer.get("reasoning_quality", {})
    r2_q = r2_observer.get("reasoning_quality", {})
    for metric in ["independence_score", "evidence_utilization", "differential_breadth", "overall_score"]:
        v1 = r1_q.get(metric, "N/A")
        v2 = r2_q.get(metric, "N/A")
        delta = ""
        if isinstance(v1, (int, float)) and isinstance(v2, (int, float)):
            d = v2 - v1
            arrow = "↑" if d > 0 else "↓" if d < 0 else "→"
            delta = f"  {arrow} ({d:+.2f})"
        label = metric.replace("_", " ").title()
        print(f"    {label:24s}  {v1}  →  {v2}{delta}")

    # Bias count comparison
    r1_biases = len(r1_observer.get("biases_detected", []))
    r2_biases = len(r2_observer.get("biases_detected", []))
    print(f"\n    Biases Detected:          {r1_biases}  →  {r2_biases}")

    r2_interrupt = r2_observer.get("interrupt_recommended", False)
    if r2_interrupt:
        print(f"\n  *** ROUND 2 INTERRUPT RECOMMENDED ***")
        print(f"  Reason: {r2_observer.get('interrupt_reason', 'N/A')}")
    else:
        print(f"\n  No further interrupt recommended — debate may proceed to synthesis.")

    print("\n" + "=" * 70)


# ── Main Pipeline ────────────────────────────────────────────────────────────

async def run_round_2(
    client: AsyncAnthropic,
    agent_defs: dict,
    case_data: dict,
    constitution: str,
    r1_specialists: dict,
    r1_observer: dict,
) -> dict:
    """Execute Round 2: debate with peer review + Observer re-evaluation."""
    case_id = case_data.get("case_id", "unknown")
    case_json = json.dumps(case_data, indent=2)

    # Create output directory
    round_2_dir = DEBATE_DIR / "round_2"
    round_2_dir.mkdir(parents=True, exist_ok=True)

    update_visualization_state("running", case_id, 2, "specialist_debate")

    # Build specialist tasks
    tasks = []
    print("[STAGE] round2_specialists")
    print("\n🩺 Round 2: Specialist Debate (with Observer feedback)")
    print("─" * 50)

    for spec in ROUND_1_SPECIALISTS:
        agent_def = agent_defs[spec["agent_file"]]
        display_name = spec["display_name"]
        agent_key = display_name.lower().replace(" ", "_")

        system_prompt = build_round_2_specialist_system_prompt(
            agent_def=agent_def,
            display_name=display_name,
            role_override=spec["role_override"],
            focus=spec["focus"],
            constitution=constitution,
        )

        # Build the Round 2 user message with full context
        own_r1 = r1_specialists.get(agent_key, {})
        other_r1 = {
            k: v for k, v in r1_specialists.items() if k != agent_key
        }

        others_text = ""
        for name, output in other_r1.items():
            others_text += f"\n### {name}\n```json\n{json.dumps(output, indent=2)}\n```\n"

        user_message_text = (
            "## Case Data\n\n"
            f"```json\n{case_json}\n```\n\n"
            "## Your Round 1 Analysis\n"
            f"```json\n{json.dumps(own_r1, indent=2)}\n```\n\n"
            "## Other Specialists' Round 1 Analyses\n"
            f"{others_text}\n"
            "## Metacognitive Observer's Round 1 Bias Report\n"
            f"```json\n{json.dumps(r1_observer, indent=2)}\n```\n\n"
            "Now provide your Round 2 analysis. Respond with ONLY the JSON object."
        )

        # Build content blocks with images if present
        r2_attached = case_data.get("attached_images")
        r2_content = []
        if r2_attached:
            for img in r2_attached:
                img_path = Path(img["path"])
                if img_path.exists():
                    image_data = base64.b64encode(img_path.read_bytes()).decode("utf-8")
                    r2_content.append({
                        "type": "image",
                        "source": {"type": "base64", "media_type": img["mime_type"], "data": image_data},
                    })
        r2_content.append({"type": "text", "text": user_message_text})

        print(f"  ⏳ Launching {display_name} (Round 2)...")

        async def _call(ad=agent_def, sp=system_prompt, um=r2_content, dn=display_name):
            async with client.messages.stream(
                model=ad["model"],
                max_tokens=16_000,
                thinking={"type": "adaptive"},
                system=sp,
                messages=[{"role": "user", "content": um}],
            ) as stream:
                response = await stream.get_final_message()

            text_content = "".join(
                block.text for block in response.content if block.type == "text"
            )
            raw = extract_json(text_content)
            ak = dn.lower().replace(" ", "_")
            parsed = normalize_specialist_output(raw, ak)
            # Preserve bias_acknowledgment if present in raw but lost in normalize
            if "bias_acknowledgment" in raw and "bias_acknowledgment" not in parsed:
                parsed["bias_acknowledgment"] = raw["bias_acknowledgment"]
            hyp = parsed.get("diagnosis_hypothesis", "N/A")
            conf = parsed.get("confidence", "N/A")
            print(f"  ✅ {dn} complete — {hyp[:80]} (confidence: {conf})")
            return parsed

        tasks.append(_call())

    # Execute all specialists in parallel
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Write results to disk
    r2_specialists = {}
    for i, result in enumerate(results):
        display_name = ROUND_1_SPECIALISTS[i]["display_name"]
        file_key = display_name.lower().replace(" ", "_")
        output_path = round_2_dir / f"{file_key}.json"

        if isinstance(result, Exception):
            print(f"  ❌ {display_name} failed: {result}")
            error_output = {
                "agent": file_key,
                "round": 2,
                "error": str(result),
                "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            }
            output_path.write_text(json.dumps(error_output, indent=2))
            r2_specialists[file_key] = error_output
        else:
            output_path.write_text(json.dumps(result, indent=2))
            r2_specialists[file_key] = result

    # Run Observer on Round 2
    print("[STAGE] round2_observer")
    print("\n🧠 Metacognitive Observer Analysis (Round 2)")
    print("─" * 50)
    update_visualization_state("running", case_id, 2, "observer_analysis")

    observer_def = agent_defs["metacognitive_observer.md"]
    observer_system_prompt = build_observer_system_prompt(observer_def, constitution, round_num=2)
    r2_observer = await call_observer(
        client, observer_def, observer_system_prompt,
        r2_specialists, case_data, round_num=2, prior_observer=r1_observer,
    )

    # Write observer output
    observer_path = OBSERVER_DIR / "analysis_round_2.json"
    observer_path.write_text(json.dumps(r2_observer, indent=2))

    update_visualization_state("round_2_complete", case_id, 2, "observer_complete")

    # Print Round 2 summary
    print_summary(r2_specialists, r2_observer, round_num=2)

    # Print comparison
    print_round_comparison(r1_specialists, r2_specialists, r1_observer, r2_observer)

    return {"specialists": r2_specialists, "observer": r2_observer}


async def run_synthesis(
    client: AsyncAnthropic,
    case_data: dict,
    r1_specialists: dict,
    r2_specialists: dict,
    r1_observer: dict,
    r2_observer: dict,
) -> dict:
    """Synthesize all debate rounds into a final diagnosis."""
    case_id = case_data.get("case_id", "unknown")
    update_visualization_state("running", case_id, 2, "synthesis")

    print("[STAGE] synthesis")
    print("\n📊 Synthesis: Generating Final Diagnosis")
    print("─" * 50)
    print("  ⏳ Synthesizing across 2 rounds of debate...")

    # Assemble the full debate record
    debate_record = {
        "round_1_specialists": r1_specialists,
        "round_1_observer": r1_observer,
        "round_2_specialists": r2_specialists,
        "round_2_observer": r2_observer,
    }

    system_prompt = """You are the Chief Diagnostician for The Emergent Diagnostic Institution. Your role is to synthesize the multi-round specialist debate into a final institutional diagnosis.

## Your Task
Review the complete debate record — Round 1 independent analyses, the Observer's bias report, Round 2 revised analyses after debate, and the Observer's Round 2 assessment. Produce a final diagnosis that:

1. Reflects the CONSENSUS view where specialists agree
2. Honestly represents DISSENT where they disagree
3. Weighs evidence quality — new evidence introduced in Round 2 carries weight, mere repetition does not
4. Accounts for the Observer's bias findings — if biases were identified and corrected, give more weight to the corrected reasoning
5. Proposes concrete next steps for confirming the diagnosis

## Required Output Format
Respond with ONLY valid JSON — no markdown fences, no preamble. Use exactly this schema:

{
  "case_id": "<from case data>",
  "primary_diagnosis": "<the institution's primary diagnostic conclusion>",
  "confidence": <float 0.0-1.0, representing institutional confidence>,
  "differential_diagnoses": [
    {"diagnosis": "<name>", "probability": <float>, "key_discriminator": "<what would confirm or rule out>"}
  ],
  "key_evidence": [
    "<the most important evidence supporting the primary diagnosis>"
  ],
  "recommended_next_steps": [
    "<specific, actionable clinical recommendations>"
  ],
  "dissenting_opinions": "<summary of any unresolved disagreements between specialists>",
  "reasoning_chain": "<narrative showing how the institution moved from Round 1 → Round 2 → final conclusion, including how biases were detected and corrected>"
}"""

    user_message = (
        "## Case Data\n"
        f"```json\n{json.dumps(case_data, indent=2)}\n```\n\n"
        "## Complete Debate Record\n"
        f"```json\n{json.dumps(debate_record, indent=2)}\n```\n\n"
        "Synthesize the above into the institution's final diagnosis. "
        "Respond with ONLY the JSON object."
    )

    async with client.messages.stream(
        model="claude-opus-4-6",
        max_tokens=16_000,
        thinking={"type": "adaptive"},
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
    ) as stream:
        response = await stream.get_final_message()

    text_content = "".join(
        block.text for block in response.content if block.type == "text"
    )
    diagnosis = extract_json(text_content)

    # Write to disk
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    diagnosis_path = OUTPUT_DIR / "final_diagnosis.json"
    diagnosis_path.write_text(json.dumps(diagnosis, indent=2))

    update_visualization_state("synthesis_complete", case_id, 2, "synthesis_complete")

    # Print summary
    print(f"  ✅ Synthesis complete")
    print(f"\n  Primary Diagnosis: {diagnosis.get('primary_diagnosis', 'N/A')}")
    print(f"  Confidence: {diagnosis.get('confidence', 'N/A')}")
    print(f"\n  Differential:")
    for d in diagnosis.get("differential_diagnoses", []):
        print(f"    • {d.get('diagnosis', '?')} (p={d.get('probability', '?')})")
        print(f"      Discriminator: {d.get('key_discriminator', 'N/A')[:100]}")
    print(f"\n  Recommended Next Steps:")
    for step in diagnosis.get("recommended_next_steps", []):
        print(f"    → {step}")
    if diagnosis.get("dissenting_opinions"):
        print(f"\n  Dissenting Opinions: {diagnosis['dissenting_opinions'][:200]}")

    return diagnosis


async def run_patient_translator(
    client: AsyncAnthropic,
    case_data: dict,
    diagnosis: dict,
) -> str:
    """Translate the final diagnosis into a plain-language explanation for the patient's family."""
    case_id = case_data.get("case_id", "unknown")
    update_visualization_state("running", case_id, 2, "patient_translation")

    print("[STAGE] translator")
    print(f"\n💬 Patient Translator: Writing explanation for {case_data.get('patient', {}).get('name', 'the patient')}'s family")
    print("─" * 50)
    print("  ⏳ Translating clinical reasoning to plain language...")

    patient = case_data.get("patient", {})
    patient_name = patient.get("name", "your child")
    parent_context = patient.get("presenting_context", "")

    system_prompt = f"""You are the Patient Translator for The Emergent Diagnostic Institution. You convert complex clinical reasoning into clear, empathetic, plain-language explanations.

## Your Audience
You are writing directly to the mother of {patient_name}, a 14-year-old boy. She has carried a thick binder of medical records to 8 doctors across 3 states over 12 years. No one has ever looked at all of it together — until now.

## Tone & Style
- Write at a 6th-grade reading level. No medical jargon without immediate explanation.
- Be warm, empathetic, and direct. This mother has been fighting for answers for over a decade.
- VALIDATE her persistence. She was right to keep pushing. She was right to keep the binder.
- Acknowledge the pain of the journey — the dismissals, the wrong diagnoses, the years of not knowing.
- Be honest about uncertainty where it exists. Do not overstate confidence.
- Give her concrete next steps she can act on.

## Structure
Write a markdown document with these sections:
1. **What We Found** — the diagnosis in simple terms
2. **How We Know** — key evidence explained without jargon
3. **What This Means** — what the condition is, how it explains everything she's seen
4. **What Happened** — why it took so long (systemic issues, not her fault)
5. **What Comes Next** — concrete, actionable next steps
6. **Questions You Might Have** — anticipate and answer likely questions

## Critical Rules
- NEVER blame the mother or family for delays
- DO acknowledge that the medical system failed this family
- DO validate specific moments where the mother raised concerns that were dismissed
- End with a message of hope and agency — there ARE things that can be done"""

    user_message = (
        "## Patient Information\n"
        f"```json\n{json.dumps(patient, indent=2)}\n```\n\n"
        "## Final Diagnosis from The Emergent Diagnostic Institution\n"
        f"```json\n{json.dumps(diagnosis, indent=2)}\n```\n\n"
        f"Write the plain-language explanation for {patient_name}'s mother. "
        "Output ONLY the markdown document — no JSON wrapper, no code fences around the whole thing."
    )

    async with client.messages.stream(
        model=TRANSLATOR_MODEL,
        max_tokens=8_000,
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
    ) as stream:
        response = await stream.get_final_message()

    explanation = "".join(
        block.text for block in response.content if block.type == "text"
    )

    # Write to disk
    explanation_path = OUTPUT_DIR / "patient_explanation.md"
    explanation_path.write_text(explanation)

    update_visualization_state("complete", case_id, 2, "translation_complete")

    # Print preview
    lines = explanation.strip().splitlines()
    print(f"  ✅ Patient explanation written ({len(explanation)} chars)")
    print(f"\n  Preview (first 15 lines):")
    for line in lines[:15]:
        print(f"    {line}")
    if len(lines) > 15:
        print(f"    ... ({len(lines) - 15} more lines)")

    print(f"\n  Full explanation: shared/output/patient_explanation.md")

    return explanation


async def run_constitution_amender(
    client: AsyncAnthropic,
    agent_defs: dict,
    case_data: dict,
    constitution: str,
    r1_observer: dict,
    r2_observer: dict,
    diagnosis: dict,
) -> list[dict]:
    """Propose and apply constitutional amendments based on case learnings."""
    case_id = case_data.get("case_id", "unknown")
    update_visualization_state("running", case_id, 2, "constitution_amendment")

    print("[STAGE] amender")
    print("\n📜 Constitution Amender: Learning from this case")
    print("─" * 50)
    print("  ⏳ Analyzing diagnostic process for systemic improvements...")

    amender_def = agent_defs["constitution_amender.md"]

    system_prompt = f"""You are the Constitution Amender for The Emergent Diagnostic Institution.

{amender_def['system_prompt']}

## Current Constitution
{constitution}

## Your Task
Review the complete case record — the Observer's bias findings from both rounds, the final diagnosis, and the diagnostic journey. Propose constitutional amendments that would:
1. Prevent the specific diagnostic failures seen in this case from recurring
2. Codify the lessons learned into institutional policy
3. Strengthen the constitution where gaps were exposed
4. Recommend team topology changes if warranted

## Critical Context for This Case
This case involved a 14-year diagnostic odyssey where a child was misdiagnosed with autism (ASD) while actually having a progressive neurodegenerative condition. The system must learn from this — specifically, how anchoring on a common diagnosis (ASD) prevented consideration of rarer but more dangerous alternatives when red flags (regression, progressive atrophy, refractory seizures) were present.

## Required Output Format
Respond with ONLY valid JSON — no markdown fences, no preamble. Use exactly this schema:

{{
  "amendments": [
    {{
      "amendment_id": "A-001",
      "case_id": "{case_id}",
      "timestamp": "<ISO-8601>",
      "type": "new_principle|modify_principle|team_change",
      "proposal": "<the proposed amendment text — a specific, actionable rule>",
      "rationale": "<why this amendment is needed, citing specific evidence from this case>",
      "evidence_from_case": "<specific findings that triggered this amendment>",
      "affected_section": "<which Article/Section this would add to or modify>",
      "status": "proposed"
    }}
  ],
  "team_topology_changes": [
    {{
      "action": "add|remove|swap",
      "agent": "<agent role>",
      "rationale": "<why this change is needed>",
      "triggered_by_case": "{case_id}"
    }}
  ]
}}

Propose 3-6 focused, non-overlapping amendments. Each should be specific enough to be directly actionable — not vague aspirational statements. Number them sequentially (A-001, A-002, etc.)."""

    user_message = (
        "## Case Data\n"
        f"```json\n{json.dumps(case_data, indent=2)}\n```\n\n"
        "## Round 1 Observer Analysis\n"
        f"```json\n{json.dumps(r1_observer, indent=2)}\n```\n\n"
        "## Round 2 Observer Analysis\n"
        f"```json\n{json.dumps(r2_observer, indent=2)}\n```\n\n"
        "## Final Diagnosis\n"
        f"```json\n{json.dumps(diagnosis, indent=2)}\n```\n\n"
        "Propose constitutional amendments based on the above. "
        "Respond with ONLY the JSON object."
    )

    async with client.messages.stream(
        model=amender_def["model"],
        max_tokens=16_000,
        thinking={"type": "adaptive"},
        system=system_prompt,
        messages=[{"role": "user", "content": user_message}],
    ) as stream:
        response = await stream.get_final_message()

    text_content = "".join(
        block.text for block in response.content if block.type == "text"
    )
    result = extract_json(text_content)

    amendments = result.get("amendments", [])
    topology_changes = result.get("team_topology_changes", [])

    # ── Write amendments to amendments_log.json (append to existing) ──
    amendments_log_path = SHARED_DIR / "constitution" / "amendments_log.json"
    existing = []
    if amendments_log_path.exists():
        try:
            existing = json.loads(amendments_log_path.read_text())
        except (json.JSONDecodeError, ValueError):
            existing = []
    existing.extend(amendments)
    amendments_log_path.write_text(json.dumps(existing, indent=2))

    # ── Append amendments to constitution.md ──
    if amendments:
        amendment_text = "\n\n---\n"
        amendment_text += f"\n## Amendments — Case: {case_id}\n"
        amendment_text += f"_Applied {datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d')}_\n"

        for a in amendments:
            aid = a.get("amendment_id", "A-???")
            atype = a.get("type", "new_principle")
            section = a.get("affected_section", "General")
            proposal = a.get("proposal", "")
            rationale = a.get("rationale", "")

            amendment_text += f"\n### {aid} ({atype}) — {section}\n"
            amendment_text += f"{proposal}\n\n"
            amendment_text += f"_Rationale: {rationale}_\n"

        # Append to constitution
        current_text = CONSTITUTION_PATH.read_text()
        CONSTITUTION_PATH.write_text(current_text + amendment_text)

    # ── Write topology changes if any ──
    if topology_changes:
        topology_path = SHARED_DIR / "constitution" / "team_topology.json"
        if topology_path.exists():
            try:
                topology = json.loads(topology_path.read_text())
            except (json.JSONDecodeError, ValueError):
                topology = {}
        else:
            topology = {}
        topology["proposed_changes"] = topology.get("proposed_changes", []) + topology_changes
        topology_path.write_text(json.dumps(topology, indent=2))

    update_visualization_state("amendment_complete", case_id, 2, "amendment_complete")

    # ── Print summary ──
    print(f"  ✅ Constitution Amender complete — {len(amendments)} amendment(s) proposed")
    print()
    for a in amendments:
        aid = a.get("amendment_id", "?")
        atype = a.get("type", "?")
        section = a.get("affected_section", "?")
        proposal = a.get("proposal", "")
        print(f"  {aid} [{atype}] → {section}")
        print(f"    {proposal[:150]}")
        if len(proposal) > 150:
            print(f"    ...({len(proposal) - 150} more chars)")
        print()

    if topology_changes:
        print(f"  Team Topology Changes: {len(topology_changes)}")
        for tc in topology_changes:
            print(f"    {tc.get('action', '?').upper()}: {tc.get('agent', '?')}")
            print(f"      {tc.get('rationale', '')[:120]}")
        print()

    print(f"  Amendments log:   shared/constitution/amendments_log.json")
    print(f"  Updated constitution: shared/constitution/constitution.md")

    return amendments


async def run_round_1(case_path: Path) -> dict:
    """Execute Round 1: parallel specialist analysis → observer."""
    # Load inputs
    print("[STAGE] loading")
    print("\n📂 Loading case and constitution...")
    case_data = load_case(case_path)
    case_json = json.dumps(case_data, indent=2)
    constitution = load_constitution()
    case_id = case_data.get("case_id", "unknown")
    print(f"   Case: {case_data.get('case_title', case_id)}")
    print(f"   Patient: {case_data.get('patient', {}).get('name', 'Unknown')}")

    # Parse agent definitions
    print("\n📋 Loading agent definitions...")
    agent_defs = {}
    for md_file in AGENTS_DIR.glob("*.md"):
        agent_defs[md_file.name] = parse_agent_definition(md_file)
        print(f"   Loaded {md_file.name}")

    # Create output directory
    round_1_dir = DEBATE_DIR / "round_1"
    round_1_dir.mkdir(parents=True, exist_ok=True)

    # Update visualization state
    update_visualization_state("running", case_id, 1, "specialist_analysis")

    # Build specialist tasks
    client = AsyncAnthropic()
    tasks = []

    attached_images = case_data.get("attached_images")

    print("[STAGE] round1_specialists")
    print("\n🩺 Round 1: Independent Specialist Analysis")
    print("─" * 50)
    for spec in ROUND_1_SPECIALISTS:
        agent_def = agent_defs[spec["agent_file"]]
        system_prompt = build_specialist_system_prompt(
            agent_def=agent_def,
            display_name=spec["display_name"],
            role_override=spec["role_override"],
            focus=spec["focus"],
            constitution=constitution,
        )
        tasks.append(
            call_specialist(client, agent_def, spec["display_name"], system_prompt, case_json, attached_images)
        )

    # Execute all specialists in parallel
    results = await asyncio.gather(*tasks, return_exceptions=True)

    # Write results to disk
    specialist_outputs = {}
    for i, result in enumerate(results):
        display_name = ROUND_1_SPECIALISTS[i]["display_name"]
        file_key = display_name.lower().replace(" ", "_")
        output_path = round_1_dir / f"{file_key}.json"

        if isinstance(result, Exception):
            print(f"  ❌ {display_name} failed: {result}")
            error_output = {
                "agent": file_key,
                "round": 1,
                "error": str(result),
                "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            }
            output_path.write_text(json.dumps(error_output, indent=2))
            specialist_outputs[file_key] = error_output
        else:
            output_path.write_text(json.dumps(result, indent=2))
            specialist_outputs[file_key] = result

    # Run Metacognitive Observer
    print("[STAGE] round1_observer")
    print("\n🧠 Metacognitive Observer Analysis")
    print("─" * 50)
    update_visualization_state("running", case_id, 1, "observer_analysis")

    observer_def = agent_defs["metacognitive_observer.md"]
    observer_system_prompt = build_observer_system_prompt(observer_def, constitution)
    observer_result = await call_observer(
        client, observer_def, observer_system_prompt, specialist_outputs, case_data
    )

    # Write observer output
    observer_path = OBSERVER_DIR / "analysis_round_1.json"
    observer_path.write_text(json.dumps(observer_result, indent=2))

    # Update state
    update_visualization_state("round_1_complete", case_id, 1, "observer_complete")

    # Print summary
    print_summary(specialist_outputs, observer_result, round_num=1)

    return {
        "specialists": specialist_outputs,
        "observer": observer_result,
        "client": client,
        "agent_defs": agent_defs,
        "case_data": case_data,
        "constitution": constitution,
    }


async def run_pipeline(case_path: Path):
    """Execute the full pipeline: Round 1 → Round 2 → Synthesis → Patient Translator → Constitution Amender."""
    # Round 1
    r1 = await run_round_1(case_path)

    # Round 2
    r2 = await run_round_2(
        client=r1["client"],
        agent_defs=r1["agent_defs"],
        case_data=r1["case_data"],
        constitution=r1["constitution"],
        r1_specialists=r1["specialists"],
        r1_observer=r1["observer"],
    )

    # Synthesis
    diagnosis = await run_synthesis(
        client=r1["client"],
        case_data=r1["case_data"],
        r1_specialists=r1["specialists"],
        r2_specialists=r2["specialists"],
        r1_observer=r1["observer"],
        r2_observer=r2["observer"],
    )

    # Patient Translator
    await run_patient_translator(
        client=r1["client"],
        case_data=r1["case_data"],
        diagnosis=diagnosis,
    )

    # Constitution Amender
    await run_constitution_amender(
        client=r1["client"],
        agent_defs=r1["agent_defs"],
        case_data=r1["case_data"],
        constitution=r1["constitution"],
        r1_observer=r1["observer"],
        r2_observer=r2["observer"],
        diagnosis=diagnosis,
    )

    print("[STAGE] complete")
    print("\n" + "=" * 70)
    print("  PIPELINE COMPLETE — The Emergent Diagnostic Institution")
    print("=" * 70)
    print(f"  Final diagnosis:      shared/output/final_diagnosis.json")
    print(f"  Patient explanation:  shared/output/patient_explanation.md")
    print(f"  Amendments log:       shared/constitution/amendments_log.json")
    print(f"  Updated constitution: shared/constitution/constitution.md")
    print("=" * 70)


def main():
    if len(sys.argv) < 2:
        print("Usage: python orchestrator.py <case_file>")
        print("Example: python orchestrator.py cases/case_001_diagnostic_odyssey.json")
        sys.exit(1)

    case_path = Path(sys.argv[1])
    if not case_path.is_absolute():
        case_path = BASE_DIR / case_path

    if not case_path.exists():
        print(f"Error: Case file not found: {case_path}")
        sys.exit(1)

    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("Error: ANTHROPIC_API_KEY environment variable is not set.")
        print("Set it with: export ANTHROPIC_API_KEY=sk-ant-...")
        sys.exit(1)

    asyncio.run(run_pipeline(case_path))


if __name__ == "__main__":
    main()
