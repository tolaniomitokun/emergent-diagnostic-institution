"""
Specialist Caller — extracted from orchestrator.py
====================================================
Builds system prompts for Round 1 and Round 2 specialists,
and makes individual specialist API calls.
"""

import base64
import json
from pathlib import Path

from anthropic import AsyncAnthropic

from orchestrator.utils import extract_json, normalize_specialist_output, THINKING_BUDGET


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
