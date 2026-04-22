#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
from collections import Counter
from datetime import datetime
from pathlib import Path
from statistics import mean
from typing import Any, Dict, Iterable, List, Optional


SCRIPT_PATH = Path(__file__).resolve()
AI_OS_ROOT = SCRIPT_PATH.parents[1]
DEFAULT_DATA_DIR = AI_OS_ROOT / "data"
DEFAULT_OUTPUT_DIR = DEFAULT_DATA_DIR / "metrics_report"
DEFAULT_CYCLE_METRICS = DEFAULT_DATA_DIR / "cycle_metrics.jsonl"
DEFAULT_RUN_METRICS = DEFAULT_DATA_DIR / "run_metrics.json"
DEFAULT_DRIFT_SCORING = AI_OS_ROOT / "memory" / "DRIFT_SCORING.json"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Render human-readable charts and a markdown report from the canonical "
            "AI-Human OS metric artifacts."
        )
    )
    parser.add_argument("--cycle-metrics", default=str(DEFAULT_CYCLE_METRICS))
    parser.add_argument("--run-metrics", default=str(DEFAULT_RUN_METRICS))
    parser.add_argument("--drift-scoring", default=str(DEFAULT_DRIFT_SCORING))
    parser.add_argument("--output-dir", default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument("--run-id", default="")
    parser.add_argument(
        "--all-runs",
        action="store_true",
        help="Aggregate every row in cycle_metrics.jsonl instead of selecting a single run.",
    )
    parser.add_argument(
        "--title",
        default="AI-Human OS Metrics Report",
        help="Title used in the generated markdown report.",
    )
    return parser.parse_args()


def ensure_mpl_cache(output_dir: Path) -> None:
    cache_dir = output_dir / ".mplconfig"
    cache_dir.mkdir(parents=True, exist_ok=True)
    os.environ.setdefault("MPLCONFIGDIR", str(cache_dir))


def load_json(path: Path, fallback: Any) -> Any:
    if not path.exists():
        return fallback

    with path.open("r", encoding="utf-8-sig") as handle:
        return json.load(handle)


def load_jsonl(path: Path) -> List[Dict[str, Any]]:
    if not path.exists():
        return []

    rows: List[Dict[str, Any]] = []
    with path.open("r", encoding="utf-8-sig") as handle:
        for raw_line in handle:
            line = raw_line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    return rows


def safe_int(value: Any, default: int = 0) -> int:
    try:
        if value is None:
            return default
        return int(value)
    except (TypeError, ValueError):
        return default


def safe_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def parse_timestamp(value: str) -> Optional[datetime]:
    if not value:
        return None

    normalized = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        return None


def select_run_id(
    run_summary: Dict[str, Any],
    cycle_rows: List[Dict[str, Any]],
    requested_run_id: str,
    all_runs: bool,
) -> str:
    if all_runs:
        return "all-runs"

    if requested_run_id:
        return requested_run_id

    run_id_from_summary = str(run_summary.get("run_id") or "").strip()
    if run_id_from_summary:
        return run_id_from_summary

    if not cycle_rows:
        return ""

    latest_row = max(
        cycle_rows,
        key=lambda row: (
            parse_timestamp(str(row.get("timestamp_end") or "")) or datetime.min,
            safe_int(row.get("cycle_id")),
        ),
    )
    return str(latest_row.get("run_id") or "").strip()


def filter_cycles(
    cycle_rows: List[Dict[str, Any]],
    selected_run_id: str,
    all_runs: bool,
) -> List[Dict[str, Any]]:
    if all_runs or not selected_run_id:
        rows = list(cycle_rows)
    else:
        rows = [row for row in cycle_rows if str(row.get("run_id") or "") == selected_run_id]

    return sorted(
        rows,
        key=lambda row: (
            safe_int(row.get("cycle_id")),
            parse_timestamp(str(row.get("timestamp_end") or "")) or datetime.min,
        ),
    )


def unique(values: Iterable[str]) -> List[str]:
    seen = set()
    ordered: List[str] = []
    for value in values:
        if not value or value in seen:
            continue
        seen.add(value)
        ordered.append(value)
    return ordered


def build_summary_from_cycles(cycle_rows: List[Dict[str, Any]]) -> Dict[str, Any]:
    scores = [safe_float(row.get("scoring", {}).get("score")) for row in cycle_rows]
    retries = [safe_int(row.get("recovery", {}).get("retry_count")) for row in cycle_rows]
    durations = [safe_int(row.get("execution", {}).get("duration_ms")) for row in cycle_rows]
    successful = [row for row in cycle_rows if str(row.get("execution", {}).get("final_status") or "") == "success"]
    failed = [row for row in cycle_rows if str(row.get("execution", {}).get("final_status") or "") != "success"]

    all_violations = [
        violation
        for row in cycle_rows
        for violation in (row.get("verification", {}).get("violations") or [])
        if violation
    ]
    violation_counts = Counter(all_violations)

    start_times = [parse_timestamp(str(row.get("timestamp_start") or "")) for row in cycle_rows]
    end_times = [parse_timestamp(str(row.get("timestamp_end") or "")) for row in cycle_rows]
    valid_starts = [value for value in start_times if value is not None]
    valid_ends = [value for value in end_times if value is not None]

    if valid_starts and valid_ends:
        total_time_ms = max(0, int((max(valid_ends) - min(valid_starts)).total_seconds() * 1000))
    else:
        total_time_ms = sum(durations)

    inferred_run_id = str(cycle_rows[-1].get("run_id") or "") if cycle_rows else ""

    return {
        "run_id": inferred_run_id,
        "total_cycles": len(cycle_rows),
        "success": {
            "completed_cycles": len(successful),
            "failed_cycles": len(failed),
        },
        "drift": {
            "total_events": len(all_violations),
            "drift_rate": round(len(all_violations) / len(cycle_rows), 2) if cycle_rows else 0,
            "by_type": dict(sorted(violation_counts.items())),
        },
        "recovery": {
            "avg_retries": round(mean(retries), 2) if retries else 0,
            "max_retries": max(retries) if retries else 0,
            "non_converged_cycles": sum(1 for row in cycle_rows if bool(row.get("meta", {}).get("non_convergence"))),
        },
        "scoring": {
            "average_score": round(mean(scores), 2) if scores else 0,
            "min_score": min(scores) if scores else 0,
            "max_score": max(scores) if scores else 0,
        },
        "performance": {
            "avg_cycle_time_ms": round(mean(durations)) if durations else 0,
            "total_time_ms": total_time_ms,
        },
    }


def format_ms(value: Any) -> str:
    milliseconds = safe_int(value)
    if milliseconds <= 0:
        return "0 ms"

    if milliseconds < 1000:
        return f"{milliseconds} ms"

    seconds = milliseconds / 1000.0
    if seconds < 60:
        return f"{seconds:.2f} s"

    minutes = seconds / 60.0
    return f"{minutes:.2f} min"


def get_health_band(score: float, scoring_config: Dict[str, Any]) -> str:
    bands = scoring_config.get("drift_scoring", {}).get("run_health", {}).get("bands", [])
    for band in bands:
        minimum = safe_float(band.get("min"))
        maximum = safe_float(band.get("max"))
        if minimum <= score <= maximum:
            return str(band.get("name") or "").strip() or "unknown"
    return "unknown"


def get_run_label(selected_run_id: str, all_runs: bool) -> str:
    if all_runs:
        return "all-runs"
    return selected_run_id or "latest-run"


def render_charts(
    cycle_rows: List[Dict[str, Any]],
    run_summary: Dict[str, Any],
    scoring_config: Dict[str, Any],
    output_dir: Path,
) -> Dict[str, str]:
    if not cycle_rows:
        return {}

    charts_dir = output_dir / "charts"
    charts_dir.mkdir(parents=True, exist_ok=True)

    import matplotlib

    matplotlib.use("Agg")
    from matplotlib import pyplot as plt

    available_styles = set(plt.style.available)
    for style_name in ("seaborn-v0_8-whitegrid", "seaborn-whitegrid", "ggplot"):
        if style_name in available_styles:
            plt.style.use(style_name)
            break

    chart_paths: Dict[str, str] = {}

    cycle_ids = [safe_int(row.get("cycle_id")) for row in cycle_rows]
    scores = [safe_float(row.get("scoring", {}).get("score")) for row in cycle_rows]
    durations = [safe_int(row.get("execution", {}).get("duration_ms")) for row in cycle_rows]
    retries = [safe_int(row.get("recovery", {}).get("retry_count")) for row in cycle_rows]
    statuses = [str(row.get("execution", {}).get("final_status") or "unknown") for row in cycle_rows]

    score_chart = charts_dir / "score_by_cycle.png"
    figure, axis = plt.subplots(figsize=(10, 4.8))
    band_colors = {
        "healthy": "#d6f5d6",
        "usable_with_issues": "#fff4cc",
        "unstable": "#ffe0b3",
        "blocked": "#ffd6d6",
    }
    bands = scoring_config.get("drift_scoring", {}).get("run_health", {}).get("bands", [])
    for band in bands:
        minimum = safe_float(band.get("min"))
        maximum = safe_float(band.get("max"))
        name = str(band.get("name") or "")
        axis.axhspan(minimum, maximum, color=band_colors.get(name, "#f3f3f3"), alpha=0.45, linewidth=0)

    axis.plot(cycle_ids, scores, color="#1f4e79", marker="o", linewidth=2)
    axis.set_title("Cycle Score")
    axis.set_xlabel("Cycle")
    axis.set_ylabel("Score")
    axis.set_ylim(0, 100)
    axis.set_xticks(cycle_ids)
    figure.tight_layout()
    figure.savefig(score_chart, dpi=160)
    plt.close(figure)
    chart_paths["score_by_cycle"] = f"charts/{score_chart.name}"

    duration_chart = charts_dir / "duration_by_cycle.png"
    figure, axis = plt.subplots(figsize=(10, 4.8))
    axis.bar(cycle_ids, durations, color="#4c956c")
    axis.set_title("Cycle Duration")
    axis.set_xlabel("Cycle")
    axis.set_ylabel("Duration (ms)")
    axis.set_xticks(cycle_ids)
    figure.tight_layout()
    figure.savefig(duration_chart, dpi=160)
    plt.close(figure)
    chart_paths["duration_by_cycle"] = f"charts/{duration_chart.name}"

    retry_chart = charts_dir / "retries_by_cycle.png"
    figure, axis = plt.subplots(figsize=(10, 4.8))
    axis.bar(cycle_ids, retries, color="#c57b57")
    axis.set_title("Retries By Cycle")
    axis.set_xlabel("Cycle")
    axis.set_ylabel("Retries")
    axis.set_xticks(cycle_ids)
    figure.tight_layout()
    figure.savefig(retry_chart, dpi=160)
    plt.close(figure)
    chart_paths["retries_by_cycle"] = f"charts/{retry_chart.name}"

    status_counts = Counter(statuses)
    status_chart = charts_dir / "status_breakdown.png"
    figure, axis = plt.subplots(figsize=(8, 4.6))
    labels = list(status_counts.keys())
    values = [status_counts[label] for label in labels]
    colors = ["#3d8b3d" if label == "success" else "#a63d40" for label in labels]
    axis.bar(labels, values, color=colors)
    axis.set_title("Cycle Status Breakdown")
    axis.set_ylabel("Cycles")
    figure.tight_layout()
    figure.savefig(status_chart, dpi=160)
    plt.close(figure)
    chart_paths["status_breakdown"] = f"charts/{status_chart.name}"

    drift_counts = Counter(
        violation
        for row in cycle_rows
        for violation in (row.get("verification", {}).get("violations") or [])
        if violation
    )
    if drift_counts:
        drift_chart = charts_dir / "drift_breakdown.png"
        figure, axis = plt.subplots(figsize=(9, 4.8))
        labels = list(drift_counts.keys())
        values = [drift_counts[label] for label in labels]
        axis.barh(labels, values, color="#6c5b7b")
        axis.set_title("Drift Violations")
        axis.set_xlabel("Count")
        figure.tight_layout()
        figure.savefig(drift_chart, dpi=160)
        plt.close(figure)
        chart_paths["drift_breakdown"] = f"charts/{drift_chart.name}"

    return chart_paths


def build_summary_rows(run_summary: Dict[str, Any], scoring_config: Dict[str, Any]) -> List[List[str]]:
    average_score = safe_float(run_summary.get("scoring", {}).get("average_score"))
    total_cycles = safe_int(run_summary.get("total_cycles"))
    completed_cycles = safe_int(run_summary.get("success", {}).get("completed_cycles"))
    failed_cycles = safe_int(run_summary.get("success", {}).get("failed_cycles"))
    success_rate = 0.0 if total_cycles == 0 else (completed_cycles / total_cycles) * 100.0
    lifecycle = run_summary.get("lifecycle", {}) or {}
    failure = run_summary.get("failure", {}) or {}

    rows = [
        ["Run ID", str(run_summary.get("run_id") or "unknown")],
        ["Run Status", str(lifecycle.get("status") or "unknown")],
        ["Started At", str(lifecycle.get("started_at") or "none")],
        ["Finished At", str(lifecycle.get("finished_at") or "none")],
        ["Failure Classification", str(failure.get("classification") or "none")],
        ["Failure Cause", str(failure.get("cause") or "none")],
        ["Total Cycles", str(total_cycles)],
        ["Completed Cycles", str(completed_cycles)],
        ["Failed Cycles", str(failed_cycles)],
        ["Success Rate", f"{success_rate:.2f}%"],
        ["Average Score", f"{average_score:.2f}"],
        ["Health Band", get_health_band(average_score, scoring_config)],
        ["Min Score", str(run_summary.get("scoring", {}).get("min_score", 0))],
        ["Max Score", str(run_summary.get("scoring", {}).get("max_score", 0))],
        ["Avg Retries", str(run_summary.get("recovery", {}).get("avg_retries", 0))],
        ["Max Retries", str(run_summary.get("recovery", {}).get("max_retries", 0))],
        ["Non-Converged Cycles", str(run_summary.get("recovery", {}).get("non_converged_cycles", 0))],
        ["Total Drift Events", str(run_summary.get("drift", {}).get("total_events", 0))],
        ["Drift Rate", str(run_summary.get("drift", {}).get("drift_rate", 0))],
        ["Avg Cycle Time", format_ms(run_summary.get("performance", {}).get("avg_cycle_time_ms", 0))],
        ["Total Time", format_ms(run_summary.get("performance", {}).get("total_time_ms", 0))],
    ]
    return rows


def build_cycle_table(cycle_rows: List[Dict[str, Any]]) -> List[List[str]]:
    rows: List[List[str]] = []
    for row in cycle_rows:
        violations = unique(row.get("verification", {}).get("violations") or [])
        rows.append(
            [
                str(row.get("cycle_id") or ""),
                str(row.get("execution", {}).get("final_status") or ""),
                str(row.get("execution", {}).get("attempts") or 0),
                str(row.get("recovery", {}).get("retry_count") or 0),
                str(row.get("scoring", {}).get("score") or 0),
                format_ms(row.get("execution", {}).get("duration_ms") or 0),
                str(row.get("operation", {}).get("file_path") or ""),
                ", ".join(violations) if violations else "none",
            ]
        )
    return rows


def markdown_table(headers: List[str], rows: List[List[str]]) -> str:
    if not rows:
        return "_No rows available._"

    header_line = "| " + " | ".join(headers) + " |"
    divider_line = "| " + " | ".join(["---"] * len(headers)) + " |"
    body_lines = ["| " + " | ".join(row) + " |" for row in rows]
    return "\n".join([header_line, divider_line, *body_lines])


def write_report(
    output_dir: Path,
    title: str,
    selected_run_label: str,
    cycle_metrics_path: Path,
    run_metrics_path: Path,
    scoring_path: Path,
    run_summary: Dict[str, Any],
    cycle_rows: List[Dict[str, Any]],
    chart_paths: Dict[str, str],
    scoring_config: Dict[str, Any],
    used_fallback_summary: bool,
    has_canonical_run_summary: bool,
) -> Path:
    output_dir.mkdir(parents=True, exist_ok=True)
    report_path = output_dir / "README.md"

    lines: List[str] = [
        f"# {title}",
        "",
        f"- Scope: `{selected_run_label}`",
        f"- Generated At: `{datetime.utcnow().isoformat()}Z`",
        f"- Canonical Cycle Source: `{cycle_metrics_path}`",
        f"- Canonical Run Source: `{run_metrics_path}`",
        f"- Scoring Source: `{scoring_path}`",
        "- Canonical Truth: `AI-Human OS/runtime/recovery/execution_metrics.js`",
        "",
    ]

    if used_fallback_summary and (cycle_rows or has_canonical_run_summary):
        lines.extend(
            [
                "> `run_metrics.json` was missing or not usable for the selected scope.",
                "> The summary below was derived from `cycle_metrics.jsonl` for reporting only.",
                "",
            ]
        )

    if not cycle_rows and not has_canonical_run_summary:
        lines.extend(
            [
                "## Status",
                "",
                "No canonical metrics were found yet.",
                "",
                "Expected files:",
                "",
                f"- `{cycle_metrics_path}`",
                f"- `{run_metrics_path}`",
                "",
                "Run `node run_ai.js` first, then rerun this reporter.",
                "",
            ]
        )
        report_path.write_text("\n".join(lines), encoding="utf-8")
        return report_path

    lines.extend(
        [
            "## Summary",
            "",
            markdown_table(["Metric", "Value"], build_summary_rows(run_summary, scoring_config)),
            "",
        ]
    )

    drift_rows = [
        [str(name), str(count)]
        for name, count in sorted((run_summary.get("drift", {}).get("by_type") or {}).items())
    ]
    lines.extend(
        [
            "## Drift Breakdown",
            "",
            markdown_table(["Drift Type", "Count"], drift_rows) if drift_rows else "_No drift violations recorded._",
            "",
        ]
    )

    lines.append("## Charts")
    lines.append("")
    if chart_paths:
        chart_order = [
            ("score_by_cycle", "Score by cycle"),
            ("duration_by_cycle", "Duration by cycle"),
            ("retries_by_cycle", "Retries by cycle"),
            ("status_breakdown", "Status breakdown"),
            ("drift_breakdown", "Drift breakdown"),
        ]
        for key, label in chart_order:
            if key not in chart_paths:
                continue
            lines.extend([f"### {label}", "", f"![{label}]({chart_paths[key]})", ""])
    else:
        lines.extend(["_No charts were generated because no cycle rows were available._", ""])

    lines.extend(
        [
            "## Cycle Detail",
            "",
            markdown_table(
                ["Cycle", "Status", "Attempts", "Retries", "Score", "Duration", "File", "Violations"],
                build_cycle_table(cycle_rows),
            )
            if cycle_rows
            else "_No cycle rows available._",
            "",
        ]
    )

    report_path.write_text("\n".join(lines), encoding="utf-8")
    return report_path


def main() -> int:
    args = parse_args()

    cycle_metrics_path = Path(args.cycle_metrics).resolve()
    run_metrics_path = Path(args.run_metrics).resolve()
    scoring_path = Path(args.drift_scoring).resolve()
    output_dir = Path(args.output_dir).resolve()

    ensure_mpl_cache(output_dir)

    cycle_rows = load_jsonl(cycle_metrics_path)
    run_summary = load_json(run_metrics_path, {})
    scoring_config = load_json(scoring_path, {})

    selected_run_id = select_run_id(run_summary, cycle_rows, args.run_id, args.all_runs)
    selected_cycles = filter_cycles(cycle_rows, selected_run_id, args.all_runs)

    run_label = get_run_label(selected_run_id, args.all_runs)
    has_canonical_run_summary = bool(run_summary)
    summary_matches_selection = (
        args.all_runs is False
        and has_canonical_run_summary
        and str(run_summary.get("run_id") or "") == selected_run_id
    )
    final_summary = run_summary if summary_matches_selection else build_summary_from_cycles(selected_cycles)
    used_fallback_summary = not summary_matches_selection

    chart_paths = render_charts(selected_cycles, final_summary, scoring_config, output_dir)
    report_path = write_report(
        output_dir=output_dir,
        title=args.title,
        selected_run_label=run_label,
        cycle_metrics_path=cycle_metrics_path,
        run_metrics_path=run_metrics_path,
        scoring_path=scoring_path,
        run_summary=final_summary,
        cycle_rows=selected_cycles,
        chart_paths=chart_paths,
        scoring_config=scoring_config,
        used_fallback_summary=used_fallback_summary,
        has_canonical_run_summary=has_canonical_run_summary,
    )

    print(f"Metrics report written to: {report_path}")
    if chart_paths:
        print(f"Charts written to: {output_dir / 'charts'}")
    else:
        print("No charts generated.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
