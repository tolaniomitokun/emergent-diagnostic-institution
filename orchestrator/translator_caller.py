"""
Translator Caller — extracted from orchestrator.py
===================================================
Translates the final diagnosis into a plain-language explanation for the patient's family.
"""

import json

from anthropic import AsyncAnthropic

from orchestrator.utils import update_visualization_state, OUTPUT_DIR, TRANSLATOR_MODEL


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
