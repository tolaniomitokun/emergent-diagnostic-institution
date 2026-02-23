"""
Emergent Diagnostic Institution — Utility Functions
====================================================
Path constants, config constants, and shared helper functions extracted
from the monolithic orchestrator.py for use across the orchestrator package.
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

# ── Paths ────────────────────────────────────────────────────────────────────
# BASE_DIR points to the project root (parent of the orchestrator/ package)

BASE_DIR = Path(__file__).resolve().parent.parent
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


def load_team_topology() -> dict:
    """Load team_topology.json from the constitution directory."""
    topology_path = SHARED_DIR / "constitution" / "team_topology.json"
    if not topology_path.exists():
        raise FileNotFoundError(f"Team topology not found: {topology_path}")
    return json.loads(topology_path.read_text())


def load_agent_definitions() -> dict:
    """Load all agent .md files from AGENTS_DIR and return a dict keyed by filename."""
    agent_defs = {}
    for md_file in AGENTS_DIR.glob("*.md"):
        agent_defs[md_file.name] = parse_agent_definition(md_file)
    return agent_defs


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
