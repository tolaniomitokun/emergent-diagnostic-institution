"""
Observer Caller — extracted from orchestrator.py
=================================================
Builds system prompts and calls the Metacognitive Observer.
"""

import json

from anthropic import AsyncAnthropic

from orchestrator.utils import extract_json, THINKING_BUDGET


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
