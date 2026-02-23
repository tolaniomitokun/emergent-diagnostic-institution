"""Context manager — tracks token budget and compresses conversation history."""

import json


class ContextManager:
    """Manages the Observer-orchestrator's conversation context to stay within token limits."""

    def __init__(self, max_tokens: int = 150_000):
        self.max_tokens = max_tokens
        self.specialist_full_outputs = {}  # Stored on disk, not in context

    def estimate_tokens(self, messages: list) -> int:
        """Rough token estimate: ~4 chars per token.

        Handles both dict messages and Anthropic API response objects
        (which contain Pydantic models like ThinkingBlock, TextBlock, etc.).
        """
        total_chars = 0
        for m in messages:
            try:
                total_chars += len(json.dumps(m))
            except TypeError:
                # Message contains non-serializable objects (e.g., Anthropic
                # API response content blocks). Estimate from string repr.
                total_chars += len(str(m))
        return total_chars // 4

    def approaching_limit(self, messages: list) -> bool:
        """Check if context is approaching the token budget."""
        return self.estimate_tokens(messages) > self.max_tokens * 0.8

    def compress(self, messages: list) -> list:
        """Compress conversation by summarizing older tool results.

        Strategy: keep the first message (case presentation) and last 6 messages
        intact. Summarize everything in between.
        """
        if len(messages) <= 8:
            return messages

        head = messages[:1]  # Case presentation
        tail = messages[-6:]  # Recent context
        middle = messages[1:-6]

        summary_text = self._summarize_middle(middle)

        compressed = head + [{
            "role": "user",
            "content": f"[CONTEXT COMPRESSED — earlier tool calls summarized to save context]\n\n{summary_text}"
        }] + tail

        return compressed

    def summarize_specialist_output(self, full_output: dict) -> str:
        """Summarize a specialist's output for context efficiency.

        Returns ~500 tokens instead of the full 2-4K token output.
        The full output is stored on disk.
        """
        if isinstance(full_output, str):
            try:
                full_output = json.loads(full_output)
            except (json.JSONDecodeError, ValueError):
                return full_output[:2000]

        summary = {
            "agent": full_output.get("agent"),
            "round": full_output.get("round"),
            "diagnosis_hypothesis": full_output.get("diagnosis_hypothesis"),
            "confidence": full_output.get("confidence"),
            "key_evidence": full_output.get("key_evidence", [])[:3],
            "dissenting_considerations": full_output.get("dissenting_considerations", [])[:2],
        }
        bias_ack = full_output.get("bias_acknowledgment")
        if bias_ack:
            summary["bias_acknowledgment"] = bias_ack[:200]

        return json.dumps(summary, indent=2)

    def summarize_observer_output(self, full_output: dict) -> str:
        """Summarize an observer review for context efficiency."""
        if isinstance(full_output, str):
            try:
                full_output = json.loads(full_output)
            except (json.JSONDecodeError, ValueError):
                return full_output[:2000]

        summary = {
            "round": full_output.get("round"),
            "biases_detected": [
                {
                    "bias_type": b.get("bias_type"),
                    "agent": b.get("agent"),
                    "severity": b.get("severity"),
                    "recommendation": b.get("recommendation", "")[:100],
                }
                for b in full_output.get("biases_detected", [])
            ],
            "reasoning_quality": full_output.get("reasoning_quality", {}),
            "interrupt_recommended": full_output.get("interrupt_recommended", False),
            "interrupt_reason": full_output.get("interrupt_reason", ""),
        }
        return json.dumps(summary, indent=2)

    def _summarize_middle(self, messages: list) -> str:
        """Build a text summary of middle conversation turns.

        Handles both dict-based messages and Anthropic API response objects
        (Pydantic models with .type, .text, .name attributes).
        """
        parts = []

        def _get_attr(obj, key, default=""):
            """Get attribute from dict or Pydantic object."""
            if isinstance(obj, dict):
                return obj.get(key, default)
            return getattr(obj, key, default)

        def _get_type(obj):
            return _get_attr(obj, "type", "")

        for msg in messages:
            role = _get_attr(msg, "role", "unknown")
            content = _get_attr(msg, "content", "")

            if role == "assistant":
                if isinstance(content, list):
                    tool_calls = [b for b in content if _get_type(b) == "tool_use"]
                    text_blocks = [b for b in content if _get_type(b) == "text"]
                    if tool_calls:
                        call_names = [_get_attr(tc, "name", "?") for tc in tool_calls]
                        parts.append(f"Observer called: {', '.join(call_names)}")
                    if text_blocks:
                        text = " ".join(str(_get_attr(b, "text", "")) for b in text_blocks)
                        parts.append(f"Observer reasoning: {text[:200]}...")
                elif isinstance(content, str):
                    parts.append(f"Observer: {content[:200]}...")

            elif role == "user":
                if isinstance(content, list):
                    for item in content:
                        if _get_type(item) == "tool_result":
                            result_text = _get_attr(item, "content", "")
                            if isinstance(result_text, str):
                                parts.append(f"Tool result: {result_text[:150]}...")
                elif isinstance(content, str):
                    parts.append(f"System: {content[:200]}...")

        return "\n".join(parts) if parts else "No significant activity in compressed section."
