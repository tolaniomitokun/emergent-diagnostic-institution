"""
Synthesis Caller — extracted from orchestrator.py
==================================================
Synthesizes all debate rounds into a final diagnosis.
"""

import json

from anthropic import AsyncAnthropic

from orchestrator.utils import extract_json, update_visualization_state, OUTPUT_DIR


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
