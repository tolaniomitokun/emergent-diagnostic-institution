"""
Emergent Diagnostic Institution — Orchestrator Entrypoint
==========================================================
Delegates to either the legacy (fixed pipeline) or agentic (Observer-as-Orchestrator)
mode based on the --mode flag.

Usage:
    python orchestrator.py <case_file>                      # defaults to legacy
    python orchestrator.py --mode=legacy <case_file>        # fixed pipeline
    python orchestrator.py --mode=agentic <case_file>       # Observer-as-Orchestrator
"""

import argparse
import asyncio
import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser(
        description="The Emergent Diagnostic Institution — Diagnostic Pipeline",
    )
    parser.add_argument(
        "--mode",
        choices=["legacy", "agentic"],
        default="legacy",
        help="Pipeline mode: 'legacy' (fixed 2-round pipeline) or 'agentic' (Observer-as-Orchestrator). Default: legacy",
    )
    parser.add_argument(
        "case_file",
        help="Path to the case JSON file (e.g., cases/case_001_diagnostic_odyssey.json)",
    )
    args = parser.parse_args()

    # Resolve case path
    case_path = Path(args.case_file)
    if not case_path.is_absolute():
        case_path = BASE_DIR / case_path

    if not case_path.exists():
        print(f"Error: Case file not found: {case_path}")
        sys.exit(1)

    if not os.environ.get("ANTHROPIC_API_KEY"):
        print("Error: ANTHROPIC_API_KEY environment variable is not set.")
        print("Set it with: export ANTHROPIC_API_KEY=sk-ant-...")
        sys.exit(1)

    if args.mode == "legacy":
        # Import and run the legacy fixed pipeline
        from orchestrator_legacy import run_pipeline
        asyncio.run(run_pipeline(case_path))
    elif args.mode == "agentic":
        # Import and run the Observer-as-Orchestrator
        try:
            from orchestrator.observer_orchestrator import run_observer_orchestrator
            asyncio.run(run_observer_orchestrator(case_path))
        except ImportError:
            print("Error: Agentic mode not yet implemented.")
            print("Use --mode=legacy for the fixed pipeline.")
            sys.exit(1)


if __name__ == "__main__":
    main()
