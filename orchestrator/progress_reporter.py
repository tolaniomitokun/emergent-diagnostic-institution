"""Progress reporter — emits structured [STAGE] events for server.js SSE integration."""

import json
import datetime
from pathlib import Path

from orchestrator.utils import VISUALIZATION_STATE_PATH


class ProgressReporter:
    """Emits progress events that server.js parses for SSE broadcasts to the frontend.

    Supports two formats:
    1. Legacy: print("[STAGE] marker_name") — for backward compatibility
    2. Structured: print('[STAGE] {"name": ..., "message": ...}') — for dynamic stages
    """

    def __init__(self, structured: bool = True):
        self.structured = structured
        self.stages = []
        self.current_index = 0

    def emit(self, name: str, message: str, agent: str = None, round_num: int = None):
        """Emit a stage event.

        Args:
            name: Machine-readable stage name (e.g., 'specialist_neurologist_r1')
            message: Human-readable description (e.g., 'Round 1: Neurologist analyzing')
            agent: Optional agent name
            round_num: Optional round number
        """
        # Track the stage
        if not any(s["name"] == name for s in self.stages):
            self.stages.append({
                "name": name,
                "message": message,
                "agent": agent,
                "round": round_num,
            })
        self.current_index = next(
            (i for i, s in enumerate(self.stages) if s["name"] == name),
            self.current_index,
        )

        if self.structured:
            event = {
                "name": name,
                "message": message,
                "agent": agent,
                "round": round_num,
                "index": self.current_index,
                "total": len(self.stages),
            }
            print(f"[STAGE] {json.dumps(event)}", flush=True)
        else:
            # Legacy format
            print(f"[STAGE] {name}", flush=True)

        # Also update state.json for the polling mechanism
        self._update_state_json(name, round_num)

    def emit_tool_progress(self, tool_name: str, tool_input: dict):
        """Map tool calls to SSE progress events."""
        if tool_name == "call_specialist":
            agent = tool_input.get("specialist_type", "unknown")
            round_num = tool_input.get("round", 1)
            agent_display = agent.replace("_", " ").title()
            self.emit(
                name=f"specialist_{agent}_r{round_num}",
                message=f"Round {round_num}: {agent_display} analyzing",
                agent=agent,
                round_num=round_num,
            )
        elif tool_name == "review_round":
            round_num = tool_input.get("round_number", 1)
            self.emit(
                name=f"observer_review_r{round_num}",
                message=f"Observer reviewing Round {round_num} for biases",
                round_num=round_num,
            )
        elif tool_name == "trigger_synthesis":
            self.emit(name="synthesis", message="Synthesizing institutional diagnosis")
        elif tool_name == "trigger_translation":
            self.emit(name="translator", message="Translating for patient communication")
        elif tool_name == "trigger_amendments":
            self.emit(name="amender", message="Amending clinical constitution")
        elif tool_name == "complete":
            self.emit(name="complete", message="Pipeline complete")

    def emit_loading(self):
        """Emit the initial loading stage."""
        self.emit(name="loading", message="Loading case and constitution")

    def emit_triage(self):
        """Emit the case triage stage."""
        self.emit(name="triage", message="Observer triaging case and selecting team")

    def emit_complete(self):
        """Emit the pipeline complete stage."""
        self.emit(name="complete", message="Pipeline complete")

    def _update_state_json(self, name: str, round_num: int = None):
        """Update shared/visualization/state.json for the polling mechanism."""
        state = {
            "status": "running" if name != "complete" else "complete",
            "current_case": "active",
            "current_round": round_num or 0,
            "phase": name,
            "timestamp": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "dynamic_stages": [s["name"] for s in self.stages],
        }
        try:
            VISUALIZATION_STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
            VISUALIZATION_STATE_PATH.write_text(json.dumps(state, indent=2))
        except OSError:
            pass  # Non-fatal if state file can't be written
