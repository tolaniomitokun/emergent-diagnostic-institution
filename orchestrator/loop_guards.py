"""Loop guards — budget limits, timeout, and safety mechanisms for the agentic loop."""

import time
from dataclasses import dataclass, field


@dataclass
class GuardResult:
    should_force_complete: bool
    reason: str = ""
    should_force_synthesis: bool = False


class LoopGuards:
    def __init__(
        self,
        max_rounds: int = 4,
        max_specialist_calls: int = 12,
        max_tool_calls: int = 20,
        max_iterations: int = 25,
        timeout_seconds: int = 1200,  # 20 minutes
    ):
        self.max_rounds = max_rounds
        self.max_specialist_calls = max_specialist_calls
        self.max_tool_calls = max_tool_calls
        self.max_iterations = max_iterations
        self.timeout_seconds = timeout_seconds

        self.start_time = time.time()
        self.specialist_calls = 0
        self.tool_calls = 0
        self.iterations = 0
        self.highest_round = 0
        self.synthesis_triggered = False
        self.translation_triggered = False
        self.amendments_triggered = False

    def record_tool_call(self, tool_name: str, tool_input: dict = None):
        """Record a tool call and update counters."""
        self.tool_calls += 1
        if tool_name == "call_specialist":
            self.specialist_calls += 1
            if tool_input:
                round_num = tool_input.get("round", 1)
                self.highest_round = max(self.highest_round, round_num)
        elif tool_name == "trigger_synthesis":
            self.synthesis_triggered = True
        elif tool_name == "trigger_translation":
            self.translation_triggered = True
        elif tool_name == "trigger_amendments":
            self.amendments_triggered = True

    def check(self) -> GuardResult:
        """Check all guards and return whether to force completion."""
        elapsed = time.time() - self.start_time

        # Hard timeout
        if elapsed > self.timeout_seconds:
            return GuardResult(
                should_force_complete=True,
                reason=f"Timeout: {elapsed:.0f}s elapsed (limit: {self.timeout_seconds}s)",
            )

        # Max tool calls — force immediate completion
        if self.tool_calls >= self.max_tool_calls:
            return GuardResult(
                should_force_complete=True,
                reason=f"Max tool calls reached: {self.tool_calls}/{self.max_tool_calls}",
            )

        # Max iterations — force immediate completion
        if self.iterations >= self.max_iterations:
            return GuardResult(
                should_force_complete=True,
                reason=f"Max iterations reached: {self.iterations}/{self.max_iterations}",
            )

        # Max specialist calls — force synthesis (not full completion)
        if self.specialist_calls >= self.max_specialist_calls and not self.synthesis_triggered:
            return GuardResult(
                should_force_complete=False,
                should_force_synthesis=True,
                reason=f"Max specialist calls reached: {self.specialist_calls}/{self.max_specialist_calls}. Synthesize now.",
            )

        # Max rounds — force synthesis
        if self.highest_round >= self.max_rounds and not self.synthesis_triggered:
            return GuardResult(
                should_force_complete=False,
                should_force_synthesis=True,
                reason=f"Max debate rounds reached: {self.highest_round}/{self.max_rounds}. Synthesize now.",
            )

        # Post-synthesis: if synthesis + translation + amendments all done, nudge toward complete
        if self.synthesis_triggered and self.translation_triggered and self.amendments_triggered:
            return GuardResult(
                should_force_complete=True,
                reason="All pipeline stages complete. Call complete() now.",
            )

        return GuardResult(should_force_complete=False)

    def increment_iteration(self):
        self.iterations += 1

    def elapsed_seconds(self) -> float:
        return time.time() - self.start_time

    def summary(self) -> str:
        return (
            f"Iterations: {self.iterations}/{self.max_iterations} | "
            f"Specialist calls: {self.specialist_calls}/{self.max_specialist_calls} | "
            f"Tool calls: {self.tool_calls}/{self.max_tool_calls} | "
            f"Rounds: {self.highest_round}/{self.max_rounds} | "
            f"Elapsed: {self.elapsed_seconds():.0f}s/{self.timeout_seconds}s"
        )
