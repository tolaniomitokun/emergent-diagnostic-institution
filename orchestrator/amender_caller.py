"""Constitution Amender — proposes and applies constitutional amendments."""

import datetime
import json

from anthropic import AsyncAnthropic

from orchestrator.utils import (
    extract_json,
    update_visualization_state,
    CONSTITUTION_PATH,
    SHARED_DIR,
    THINKING_BUDGET,
)


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
