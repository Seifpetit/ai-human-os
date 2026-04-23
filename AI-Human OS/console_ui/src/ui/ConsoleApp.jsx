import React from "react";
import { apiGet, apiPost, openLogStream } from "./api.js";

const PIN_STORAGE_KEY = "ai_human_os_console_pins_v1";

const ARTIFACT_GROUPS = [
  {
    label: "Gates",
    items: [
      { id: "intent_confirmation_md", label: "Gate 1: INTENT_CONFIRMATION.md" },
      { id: "execution_confirmation_md", label: "Gate 2: EXECUTION_CONFIRMATION.md" },
      { id: "commit_confirmation_md", label: "Gate 3: COMMIT_CONFIRMATION.md" },
    ],
  },
  {
    label: "Planning",
    items: [
      { id: "features_list_md", label: "FEATURES_LIST.md" },
      { id: "feature_request_md", label: "FEATURE_REQUEST.md" },
      { id: "implementation_plan_md", label: "IMPLEMENTATION_PLAN.md" },
      { id: "implementation_plan_json", label: "implementation_plan.json" },
      { id: "plan_decision_evaluation_json", label: "plan_decision_evaluation.json" },
      { id: "plan_traceability_evaluation_json", label: "plan_traceability_evaluation.json" },
    ],
  },
  {
    label: "Behavior",
    items: [
      { id: "scenarios_md", label: "SCENARIOS.md" },
      { id: "state_flow_md", label: "STATE_FLOW.md" },
      { id: "reconciliation_rule_md", label: "RECONCILIATION_RULE.md" },
      { id: "simulation_report_md", label: "SIMULATION_REPORT.md" },
    ],
  },
  {
    label: "Execution",
    items: [
      { id: "target_file_request_json", label: "target_file_request.json" },
      { id: "execution_result_json", label: "execution_result.json" },
      { id: "verify_result_json", label: "verify_result.json" },
      { id: "run_metrics_json", label: "run_metrics.json" },
      { id: "cycle_metrics_jsonl", label: "cycle_metrics.jsonl" },
    ],
  },
  {
    label: "Policy",
    items: [
      { id: "throughput_policy_json", label: "THROUGHPUT_POLICY.json" },
      { id: "canonical_definitions_json", label: "CANONICAL_DEFINITIONS.json" },
      { id: "workspace_config_json", label: "WORKSPACE_CONFIG.json" },
    ],
  },
];

const ARTIFACT_LOOKUP = Object.fromEntries(
  ARTIFACT_GROUPS.flatMap(group => group.items).map(item => [item.id, item])
);

function formatStatus(status) {
  const value = String(status || "").toLowerCase();
  return value || "unknown";
}

function gateTone(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "approved") return "ok";
  if (normalized === "missing") return "blocked";
  if (normalized.includes("review") || normalized.includes("pending")) return "warn";
  return "neutral";
}

function summaryToneClass(severity) {
  const value = String(severity || "neutral").toLowerCase();
  if (value === "ok") return "console-status console-status--ok";
  if (value === "warn") return "console-status console-status--warn";
  if (value === "blocked") return "console-status console-status--blocked";
  return "console-status";
}

function logLineTone(line) {
  const text = String(line || "");
  if (text.startsWith("[console]")) return "system";
  if (/error|failed|blocked|fatal/i.test(text)) return "error";
  return "plain";
}

function determineWhereYouAre(state) {
  const g1 = state?.gates?.gate1?.approval_status;
  const g2 = state?.gates?.gate2?.approval_status;
  const g3 = state?.gates?.gate3?.approval_status;
  const lifecycle = state?.run?.lifecycle?.status || "unknown";

  if (g1 !== "approved") return "Gate 1";
  if (g2 !== "approved") return "Gate 2";
  if (lifecycle === "commit_gate_blocked" || g3 === "needs_human_review" || g3 === "pending_current") return "Gate 3";
  if (lifecycle === "behavior_gate_blocked") return "2_behavior";
  if (lifecycle === "execution_gate_blocked") return "Gate 2";
  if (lifecycle === "completed") return "Complete";
  return "Execution";
}

function Step({ name, badge, tone, hint }) {
  const badgeClass =
    tone === "ok"
      ? "console-step__badge console-step__badge--ok"
      : tone === "blocked"
        ? "console-step__badge console-step__badge--blocked"
        : tone === "warn"
          ? "console-step__badge console-step__badge--warn"
          : "console-step__badge";

  return (
    <div className="console-step">
      <div className="console-step__label">
        <div className="console-step__name">{name}</div>
        <div className={badgeClass}>{badge}</div>
      </div>
      <p className="console-step__hint">{hint}</p>
    </div>
  );
}

function ArtifactPin({ label, active, onClick }) {
  return (
    <button
      className={active ? "console-chip console-chip--active" : "console-chip"}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function loadStoredPins() {
  try {
    const raw = window.localStorage.getItem(PIN_STORAGE_KEY);
    const value = JSON.parse(raw || "[]");
    return Array.isArray(value) ? value.filter(id => ARTIFACT_LOOKUP[id]) : [];
  } catch {
    return [];
  }
}

function matchesArtifactQuery(item, artifactMeta, query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  const haystack = [
    item.id,
    item.label,
    artifactMeta?.path || "",
  ].join(" ").toLowerCase();

  return haystack.includes(normalized);
}

function getCurrentArtifactId(state) {
  const g1 = state?.gates?.gate1?.approval_status;
  const g2 = state?.gates?.gate2?.approval_status;
  const g3 = state?.gates?.gate3?.approval_status;
  const lifecycle = state?.run?.lifecycle?.status || "unknown";

  if (g1 !== "approved") return "intent_confirmation_md";
  if (g2 !== "approved") return "execution_confirmation_md";
  if (lifecycle === "commit_gate_blocked" || g3 === "needs_human_review" || g3 === "pending_current") {
    return "commit_confirmation_md";
  }
  if (lifecycle === "completed") return "run_metrics_json";
  if (state?.current_operation?.operation_key) return "target_file_request_json";
  return "implementation_plan_md";
}

function getCurrentGateId(state) {
  const currentArtifactId = getCurrentArtifactId(state);

  if (currentArtifactId === "intent_confirmation_md") return "gate1";
  if (currentArtifactId === "execution_confirmation_md") return "gate2";
  if (currentArtifactId === "commit_confirmation_md") return "gate3";
  return null;
}

function gateIdForArtifact(artifactId) {
  if (artifactId === "intent_confirmation_md") return "gate1";
  if (artifactId === "execution_confirmation_md") return "gate2";
  if (artifactId === "commit_confirmation_md") return "gate3";
  return null;
}

function gateStatusForGateId(state, gateId) {
  if (!gateId) return "unknown";
  return formatStatus(state?.gates?.[gateId]?.approval_status);
}

function nextRunHintForArtifact(artifactId) {
  if (artifactId === "intent_confirmation_md") return "Run Intake";
  if (artifactId === "execution_confirmation_md") return "Run Planning";
  if (artifactId === "commit_confirmation_md") return "Run AI";
  return "Refresh";
}

function artifactMissingHint(artifactId) {
  if (artifactId === "intent_confirmation_md") {
    return "This file does not exist yet. Run Planning Intake first.";
  }
  if (artifactId === "execution_confirmation_md") {
    return "This file does not exist yet. Gate 1 must be approved, then run Planning.";
  }
  if (artifactId === "commit_confirmation_md") {
    return "This file does not exist yet. A verified artifact must exist before Gate 3 appears.";
  }
  return "This artifact does not exist yet for the current workspace.";
}

function getRecommendedUiAction(state) {
  if (!state) return "workspace";

  const g1 = state?.gates?.gate1?.approval_status;
  const g2 = state?.gates?.gate2?.approval_status;
  const g3 = state?.gates?.gate3?.approval_status;
  const lifecycle = state?.run?.lifecycle?.status || "unknown";

  if (g1 === "missing") return "planning_intake";
  if (g1 !== "approved") return "approve_current";
  if (g2 === "missing") return "planning";
  if (g2 !== "approved") return "approve_current";
  if (lifecycle === "commit_gate_blocked" || g3 === "needs_human_review" || g3 === "pending_current") {
    return "approve_current";
  }
  if (lifecycle === "completed") return "metrics_report";
  return "ai";
}

function actionButtonClass(actionId, recommendedAction, extraClass = "") {
  const classes = ["console-btn"];
  if (extraClass) classes.push(extraClass);
  if (actionId === recommendedAction) {
    classes.push("console-btn--accent");
  }
  return classes.join(" ");
}

function pickArtifact(ids, artifactMetaById) {
  for (const id of ids) {
    if (artifactMetaById[id]?.meta?.exists) {
      return id;
    }
  }
  return ids[0] || "implementation_plan_md";
}

function buildCurrentStep({ state, activeRun, artifactMetaById }) {
  const lifecycle = state?.run?.lifecycle?.status || "unknown";
  const g1 = state?.gates?.gate1?.approval_status;
  const g2 = state?.gates?.gate2?.approval_status;
  const g3 = state?.gates?.gate3?.approval_status;

  if (activeRun?.status === "running") {
    if (activeRun.task_id === "planning_intake") {
      return {
        key: "running_intake",
        title: "Generating Scope Confirmation",
        description: "The planning intake step is producing Gate 1.",
        artifactId: "intent_confirmation_md",
        primaryAction: null,
        primaryLabel: "Running Intake",
      };
    }

    if (activeRun.task_id === "planning") {
      return {
        key: "running_planning",
        title: "Compiling Execution Plan",
        description: "Planning is generating and compiling the execution-ready plan.",
        artifactId: pickArtifact([
          "implementation_plan_md",
          "feature_request_md",
          "features_list_md",
        ], artifactMetaById),
        primaryAction: null,
        primaryLabel: "Planning Running",
      };
    }

    if (activeRun.task_id === "ai") {
      return {
        key: "running_ai",
        title: "Executing Current Operation",
        description: "The system is running the next execution cycle.",
        artifactId: pickArtifact([
          "target_file_request_json",
          "execution_result_json",
          "verify_result_json",
        ], artifactMetaById),
        primaryAction: null,
        primaryLabel: "Run In Progress",
      };
    }
  }

  if (!state?.workspace?.workspace_root) {
    return {
      key: "workspace",
      title: "Set Workspace",
      description: "Choose which codebase root the system should mutate.",
      artifactId: "workspace_config_json",
      primaryAction: "workspace",
      primaryLabel: "Set Workspace",
    };
  }

  if (g1 === "missing") {
    return {
      key: "gate1_generate",
      title: "Create Scope Confirmation",
      description: "Generate Gate 1 so you can review scope, assumptions, and ambiguities.",
      artifactId: "intent_confirmation_md",
      primaryAction: "planning_intake",
      primaryLabel: "Run Intake",
    };
  }

  if (g1 !== "approved") {
    return {
      key: "gate1_review",
      title: "Confirm Scope",
      description: "Review INTENT_CONFIRMATION.md and approve Gate 1 only if the scope is correct.",
      artifactId: "intent_confirmation_md",
      primaryAction: "approve_gate1",
      primaryLabel: "Approve Gate 1",
    };
  }

  if (g2 === "missing") {
    return {
      key: "planning",
      title: "Compile Plan",
      description: "Generate the compiled plan and execution confirmation before any file generation starts.",
      artifactId: pickArtifact([
        "implementation_plan_md",
        "feature_request_md",
        "features_list_md",
      ], artifactMetaById),
      primaryAction: "planning",
      primaryLabel: "Run Planning",
    };
  }

  if (g2 !== "approved") {
    return {
      key: "gate2_review",
      title: "Approve Execution Plan",
      description: "Review EXECUTION_CONFIRMATION.md and approve Gate 2 before execution begins.",
      artifactId: "execution_confirmation_md",
      primaryAction: "approve_gate2",
      primaryLabel: "Approve Gate 2",
    };
  }

  if (lifecycle === "behavior_gate_blocked") {
    return {
      key: "behavior_review",
      title: "Review Behavior Contract",
      description: "Behavior simulation blocked the cycle. Inspect the behavioral artifacts before rerunning.",
      artifactId: pickArtifact([
        "simulation_report_md",
        "state_flow_md",
        "scenarios_md",
      ], artifactMetaById),
      primaryAction: "ai",
      primaryLabel: "Run AI",
    };
  }

  if (lifecycle === "commit_gate_blocked" || g3 === "needs_human_review" || g3 === "pending_current") {
    return {
      key: "gate3_review",
      title: "Approve Verified Artifact",
      description: "Review COMMIT_CONFIRMATION.md and approve Gate 3 before the artifact enters accepted state.",
      artifactId: "commit_confirmation_md",
      primaryAction: "approve_gate3",
      primaryLabel: "Approve Gate 3",
    };
  }

  if (lifecycle === "completed") {
    return {
      key: "complete",
      title: "Run Complete",
      description: "The run finished. Review metrics or render the human-readable report.",
      artifactId: "run_metrics_json",
      primaryAction: "metrics_report",
      primaryLabel: "Render Metrics",
    };
  }

  return {
    key: "execution",
    title: "Execute Current Operation",
    description: state?.current_operation?.file_path
      ? `Current target: ${state.current_operation.file_path}`
      : "Run the next execution cycle for the current workspace.",
    artifactId: pickArtifact([
      "target_file_request_json",
      "implementation_plan_json",
      "implementation_plan_md",
    ], artifactMetaById),
    primaryAction: "ai",
    primaryLabel: "Run AI",
  };
}

function getCurrentStepBadge({ currentStep, currentGateId, currentGateStatus, lifecycleStatus }) {
  if (currentStep?.key?.startsWith("running_")) {
    return {
      label: "running",
      className: "console-step__badge",
    };
  }

  if (currentGateId) {
    if (currentGateStatus === "approved") {
      return {
        label: currentGateStatus,
        className: "console-step__badge console-step__badge--ok",
      };
    }

    if (currentGateStatus === "missing") {
      return {
        label: currentGateStatus,
        className: "console-step__badge console-step__badge--blocked",
      };
    }

    return {
      label: currentGateStatus,
      className: "console-step__badge console-step__badge--warn",
    };
  }

  return {
    label: lifecycleStatus,
    className: "console-step__badge",
  };
}

export default function ConsoleApp() {
  const [state, setState] = React.useState(null);
  const [workspaceRoot, setWorkspaceRoot] = React.useState("");
  const [workspaceInfo, setWorkspaceInfo] = React.useState(null);
  const [artifacts, setArtifacts] = React.useState([]);
  const [selectedArtifact, setSelectedArtifact] = React.useState("intent_confirmation_md");
  const [artifactContent, setArtifactContent] = React.useState("");
  const [artifactPath, setArtifactPath] = React.useState("");
  const [artifactMeta, setArtifactMeta] = React.useState(null);
  const [artifactDiff, setArtifactDiff] = React.useState(null);
  const [artifactViewMode, setArtifactViewMode] = React.useState("content");
  const [artifactSearch, setArtifactSearch] = React.useState("");
  const [timeline, setTimeline] = React.useState({ cycles: [], run: null });
  const [resetOptions, setResetOptions] = React.useState({ modes: [], archives: [] });
  const [resetMode, setResetMode] = React.useState("normal");
  const [resetArchiveDirName, setResetArchiveDirName] = React.useState("");
  const [pinnedArtifacts, setPinnedArtifacts] = React.useState(loadStoredPins);
  const [logs, setLogs] = React.useState([]);
  const [activeRun, setActiveRun] = React.useState(null);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const where = determineWhereYouAre(state);
  const artifactMetaById = Object.fromEntries(artifacts.map(item => [item.id, item]));
  const currentArtifactId = getCurrentArtifactId(state);
  const currentGateId = getCurrentGateId(state);
  const currentGateStatus = gateStatusForGateId(state, currentGateId);
  const currentArtifactExists = artifactMetaById[currentArtifactId]?.meta?.exists !== false;
  const recommendedAction = getRecommendedUiAction(state);
  const currentStep = buildCurrentStep({ state, activeRun, artifactMetaById });

  React.useEffect(() => {
    try {
      window.localStorage.setItem(PIN_STORAGE_KEY, JSON.stringify(pinnedArtifacts));
    } catch {
      // ignore
    }
  }, [pinnedArtifacts]);

  async function refreshState() {
    const next = await apiGet("/api/state");
    setState(next);
    if (next?.workspace?.workspace_root) {
      setWorkspaceRoot(next.workspace.workspace_root);
    }
    setWorkspaceInfo(next?.workspace || null);
  }

  async function refreshArtifacts() {
    const next = await apiGet("/api/artifacts");
    setArtifacts(next.artifacts || []);
  }

  async function refreshTimeline() {
    const next = await apiGet("/api/timeline");
    setTimeline(next || { cycles: [], run: null });
  }

  async function refreshResetOptions() {
    const next = await apiGet("/api/reset/options");
    setResetOptions(next || { modes: [], archives: [] });
    if (Array.isArray(next?.archives) && next.archives.length > 0 && !resetArchiveDirName) {
      setResetArchiveDirName(next.archives[0].dir_name || "");
    }
  }

  async function loadArtifactBundle(id) {
    const [artifact, diff] = await Promise.all([
      apiGet(`/api/artifact?id=${encodeURIComponent(id)}`),
      apiGet(`/api/artifact/diff?id=${encodeURIComponent(id)}`),
    ]);

    setArtifactContent(artifact.content || "");
    setArtifactPath(artifact.path || "");
    setArtifactMeta(artifact.meta || null);
    setArtifactDiff(diff || null);
  }

  async function refreshDashboard({ reloadSelectedArtifact = true } = {}) {
    await Promise.all([
      refreshState(),
      refreshArtifacts(),
      refreshTimeline(),
      refreshResetOptions(),
    ]);

    if (reloadSelectedArtifact) {
      await loadArtifactBundle(selectedArtifact);
    }
  }

  React.useEffect(() => {
    let cancel = false;

    (async () => {
      try {
        setError("");
        await refreshDashboard();
      } catch (err) {
        if (!cancel) {
          setError(String(err?.message || err));
        }
      }
    })();

    return () => {
      cancel = true;
    };
  }, []);

  React.useEffect(() => {
    const stop = openLogStream(evt => {
      if (evt?.event === "snapshot") {
        setActiveRun(evt.run || null);
        setLogs(Array.isArray(evt.lines) ? evt.lines : []);
        return;
      }

      if (evt?.event === "run_state") {
        setActiveRun(evt.run || null);
        refreshDashboard().catch(() => {});
        return;
      }

      if (evt?.line) {
        setLogs(prev => {
          const next = prev.concat([evt.line]);
          return next.length > 2500 ? next.slice(next.length - 2500) : next;
        });
      }
    });

    return () => stop();
  }, []);

  React.useEffect(() => {
    loadArtifactBundle(selectedArtifact).catch(err => setError(String(err?.message || err)));
  }, [selectedArtifact]);

  React.useEffect(() => {
    const selectedIsGate = Boolean(gateIdForArtifact(selectedArtifact));
    const selectedExists = artifactMetaById[selectedArtifact]?.meta?.exists;
    if (selectedIsGate && selectedExists === false && currentArtifactId && currentArtifactId !== selectedArtifact) {
      setSelectedArtifact(currentArtifactId);
    }
  }, [artifactMetaById, currentArtifactId, selectedArtifact]);

  React.useEffect(() => {
    if (currentStep?.artifactId && currentStep.artifactId !== selectedArtifact) {
      setSelectedArtifact(currentStep.artifactId);
    }
  }, [currentStep?.artifactId]);

  async function runTask(taskId) {
    try {
      setBusy(true);
      setError("");
      await apiPost(`/api/run/${encodeURIComponent(taskId)}`, {});
      await refreshTimeline();
    } catch (err) {
      setError(String(err?.message || err));
    } finally {
      setBusy(false);
      refreshState().catch(() => {});
    }
  }

  async function updateWorkspaceRoot() {
    try {
      setBusy(true);
      setError("");
      const next = await apiPost("/api/workspace", { workspace_root: workspaceRoot });
      setWorkspaceInfo(next?.resolved || null);
      await refreshDashboard();
    } catch (err) {
      setError(String(err?.message || err));
    } finally {
      setBusy(false);
    }
  }

  async function approveGate(gateId) {
    try {
      setBusy(true);
      setError("");
      await apiPost(`/api/gates/${encodeURIComponent(gateId)}/approve`, {
        approval_status: "approved",
      });
      await refreshDashboard();
      if (gateId === "gate1") setSelectedArtifact("execution_confirmation_md");
      if (gateId === "gate2") setSelectedArtifact("target_file_request_json");
      if (gateId === "gate3") setSelectedArtifact("run_metrics_json");
    } catch (err) {
      setError(String(err?.message || err));
    } finally {
      setBusy(false);
    }
  }

  async function runReset() {
    try {
      setBusy(true);
      setError("");
      await apiPost("/api/reset", {
        mode: resetMode,
        archive_dir_name: resetMode === "archive" ? resetArchiveDirName : "",
      });
      setSelectedArtifact("intent_confirmation_md");
      await refreshDashboard();
    } catch (err) {
      setError(String(err?.message || err));
    } finally {
      setBusy(false);
    }
  }

  async function runCurrentStepAction() {
    if (!currentStep?.primaryAction) {
      return;
    }

    if (currentStep.primaryAction === "workspace") {
      await updateWorkspaceRoot();
      return;
    }

    if (currentStep.primaryAction === "planning_intake") {
      await runTask("planning_intake");
      return;
    }

    if (currentStep.primaryAction === "planning") {
      await runTask("planning");
      return;
    }

    if (currentStep.primaryAction === "ai") {
      await runTask("ai");
      return;
    }

    if (currentStep.primaryAction === "metrics_report") {
      await runTask("metrics_report");
      return;
    }

    if (currentStep.primaryAction === "approve_gate1") {
      await approveGate("gate1");
      return;
    }

    if (currentStep.primaryAction === "approve_gate2") {
      await approveGate("gate2");
      return;
    }

    if (currentStep.primaryAction === "approve_gate3") {
      await approveGate("gate3");
    }
  }

  function togglePin(id) {
    setPinnedArtifacts(prev => (
      prev.includes(id)
        ? prev.filter(entry => entry !== id)
        : [id, ...prev.filter(entry => entry !== id)].slice(0, 8)
    ));
  }

  const filteredGroups = ARTIFACT_GROUPS
    .map(group => ({
      ...group,
      items: group.items.filter(item => matchesArtifactQuery(item, artifactMetaById[item.id], artifactSearch)),
    }))
    .filter(group => group.items.length > 0);

  const selectedArtifactOptionGroups = filteredGroups.map(group => (
    <optgroup key={group.label} label={group.label}>
      {group.items.map(item => (
        <option key={item.id} value={item.id}>{item.label}</option>
      ))}
    </optgroup>
  ));

  const gate1Status = formatStatus(state?.gates?.gate1?.approval_status);
  const gate2Status = formatStatus(state?.gates?.gate2?.approval_status);
  const gate3Status = formatStatus(state?.gates?.gate3?.approval_status);
  const lifecycleStatus = formatStatus(state?.run?.lifecycle?.status || "");
  const blockedSummary = state?.blocked_summary || null;
  const metaParts = [];
  const currentStepBadge = getCurrentStepBadge({
    currentStep,
    currentGateId,
    currentGateStatus,
    lifecycleStatus,
  });

  if (state?.run?.run_id) metaParts.push(`run_id=${state.run.run_id}`);
  if (lifecycleStatus && lifecycleStatus !== "unknown") metaParts.push(`run_status=${lifecycleStatus}`);
  if (state?.current_operation?.operation_key) metaParts.push(`op=${state.current_operation.operation_key}`);
  if (state?.current_operation?.file_path) metaParts.push(`file=${state.current_operation.file_path}`);
  if (workspaceInfo?.workspace_root) metaParts.push(`workspace=${workspaceInfo.workspace_root}`);
  if (workspaceInfo?.source) metaParts.push(`workspace_source=${workspaceInfo.source}`);

  const pinnedDefs = pinnedArtifacts
    .map(id => ARTIFACT_LOOKUP[id])
    .filter(Boolean);

  return (
    <div className="console-shell">
      <aside className="console-rail">
        <h1 className="console-rail__title">AI-Human OS</h1>
        <p className="console-rail__subtitle">YOU ARE HERE: {where}</p>

        <div className="console-stepper">
          <Step
            name="Gate 1"
            badge={gate1Status}
            tone={gateTone(gate1Status)}
            hint="Approve INTENT_CONFIRMATION.md (scope + ambiguities)."
          />
          <Step
            name="Gate 2"
            badge={gate2Status}
            tone={gateTone(gate2Status)}
            hint="Approve EXECUTION_CONFIRMATION.md (compiled plan delta)."
          />
          <Step
            name="Gate 3"
            badge={gate3Status}
            tone={gateTone(gate3Status)}
            hint="Approve COMMIT_CONFIRMATION.md (verified artifact)."
          />
          <Step
            name="Run"
            badge={lifecycleStatus}
            tone={lifecycleStatus === "completed" ? "ok" : (lifecycleStatus.includes("blocked") ? "blocked" : "neutral")}
            hint="Run allowlisted pipeline commands and stream logs."
          />
        </div>

        <p className="console-footnote">
          Safety: console can only approve gates, switch workspace root, and run allowlisted commands.
        </p>
      </aside>

      <main className="console-main">
        <div className="console-topbar">
          <div className="console-topbar__left">
            <h2 className="console-topbar__headline">{currentStep.title}</h2>
            <p className="console-topbar__meta">
              {metaParts.length > 0 ? metaParts.join("  ") : "api=http://127.0.0.1:4310"}
            </p>
          </div>

          <div className="console-actions">
            <input
              className="console-select"
              style={{ minWidth: 260 }}
              value={workspaceRoot}
              onChange={event => setWorkspaceRoot(event.target.value)}
              placeholder="workspace root (absolute path)"
            />
            <button className={actionButtonClass("workspace", recommendedAction)} disabled={busy} onClick={updateWorkspaceRoot} type="button">
              Set Workspace
            </button>
            <button className="console-btn" disabled={busy} onClick={() => refreshDashboard().catch(() => {})} type="button">
              Refresh
            </button>
            <select
              className="console-select"
              value={resetMode}
              onChange={event => setResetMode(event.target.value)}
            >
              {(resetOptions.modes || []).map(item => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
            {resetMode === "archive" ? (
              <select
                className="console-select"
                value={resetArchiveDirName}
                onChange={event => setResetArchiveDirName(event.target.value)}
              >
                {(resetOptions.archives || []).map(item => (
                  <option key={item.dir_name} value={item.dir_name}>
                    {item.feature_number ? `${item.feature_number}. ` : ""}{item.feature_title}
                  </option>
                ))}
              </select>
            ) : null}
            <button
              className="console-btn console-btn--reset"
              disabled={busy || activeRun?.status === "running" || (resetMode === "archive" && !resetArchiveDirName)}
              onClick={runReset}
              type="button"
            >
              Reset
            </button>
          </div>
        </div>

        {error ? (
          <div className="console-panel console-panel--error">
            <div className="console-panel__head">
              <p className="console-panel__title">Error</p>
            </div>
            <div className="console-panel__body">
              <textarea className="console-textarea" readOnly value={error} />
            </div>
          </div>
        ) : null}

        <div className="console-grid">
          <section className="console-panel console-panel--artifact">
            <div className="console-panel__head">
              <div className="console-panel__headgroup">
                <p className="console-panel__title">{currentStep.title}</p>
                <div className="console-tabbar">
                  <button
                    className={artifactViewMode === "content" ? "console-chip console-chip--active" : "console-chip"}
                    onClick={() => setArtifactViewMode("content")}
                    type="button"
                  >
                    Content
                  </button>
                  <button
                    className={artifactViewMode === "diff" ? "console-chip console-chip--active" : "console-chip"}
                    onClick={() => setArtifactViewMode("diff")}
                    type="button"
                  >
                    Diff
                  </button>
                </div>
              </div>
              <div className="console-step__badge">
                {currentStep.primaryLabel}
              </div>
            </div>

            <div className="console-panel__body">
              <div className="console-current-step console-current-step--focus">
                <div className="console-current-step__head">
                  <div>
                    <div className="console-current-step__label">Current Step</div>
                    <div className="console-current-step__title">
                      {ARTIFACT_LOOKUP[currentStep.artifactId]?.label || currentStep.artifactId}
                    </div>
                  </div>
                  <div className={currentStepBadge.className}>
                    {currentStepBadge.label}
                  </div>
                </div>
                <p className="console-current-step__hint">
                  {currentStep.description}
                </p>
                <div className="console-actions">
                  <button
                    className={actionButtonClass(
                      currentStep.primaryAction || "noop",
                      recommendedAction,
                      currentGateId === "gate3" ? "console-btn--danger" : ""
                    )}
                    disabled={
                      busy ||
                      !currentStep.primaryAction ||
                      activeRun?.status === "running" ||
                      (
                        currentStep.primaryAction.startsWith("approve_") &&
                        (!currentArtifactExists || currentGateStatus === "approved")
                      )
                    }
                    onClick={runCurrentStepAction}
                    type="button"
                  >
                    {currentStep.primaryLabel}
                  </button>
                  <button
                    className="console-btn"
                    disabled={busy}
                    onClick={() => loadArtifactBundle(selectedArtifact).catch(err => setError(String(err?.message || err)))}
                    type="button"
                  >
                    Reload Artifact
                  </button>
                </div>
              </div>

              {pinnedDefs.length > 0 ? (
                <div className="console-chipbar">
                  {pinnedDefs.map(item => (
                    <ArtifactPin
                      key={item.id}
                      label={item.label}
                      active={selectedArtifact === item.id}
                      onClick={() => setSelectedArtifact(item.id)}
                    />
                  ))}
                </div>
              ) : null}

              <p className="console-footnote">
                {artifactPath
                  ? (
                    artifactMeta?.exists
                      ? `path=${artifactPath}  exists=true  size=${artifactMeta?.size_bytes || 0}`
                      : `${artifactMissingHint(selectedArtifact)} Next likely step: ${nextRunHintForArtifact(selectedArtifact)}.`
                  )
                  : "Select an artifact."}
              </p>

              {artifactViewMode === "content" ? (
                <textarea className="console-textarea" readOnly value={artifactContent || ""} />
              ) : (
                <>
                  <div className="console-summarybar">
                    <div className="console-summarybar__item">
                      <span className="console-summarybar__label">Changed</span>
                      <span className="console-summarybar__value">{artifactDiff?.diff?.changed ? "yes" : "no"}</span>
                    </div>
                    <div className="console-summarybar__item">
                      <span className="console-summarybar__label">Added</span>
                      <span className="console-summarybar__value">{artifactDiff?.diff?.added_line_count ?? 0}</span>
                    </div>
                    <div className="console-summarybar__item">
                      <span className="console-summarybar__label">Removed</span>
                      <span className="console-summarybar__value">{artifactDiff?.diff?.removed_line_count ?? 0}</span>
                    </div>
                    <div className="console-summarybar__item">
                      <span className="console-summarybar__label">Baseline</span>
                      <span className="console-summarybar__value">{artifactDiff?.baseline?.reason || "none"}</span>
                    </div>
                  </div>

                  <p className="console-footnote">
                    {artifactDiff?.baseline
                      ? `baseline=${artifactDiff.baseline.reason}  at=${artifactDiff.baseline.created_at}`
                      : "No baseline snapshot yet. Approving a gate or rerunning a task will create one."}
                  </p>

                  <div className="console-diff">
                    {artifactDiff?.diff?.preview?.length > 0 ? artifactDiff.diff.preview.map((line, index) => {
                      const className =
                        line.kind === "add"
                          ? "console-diff__line console-diff__line--add"
                          : line.kind === "remove"
                            ? "console-diff__line console-diff__line--remove"
                            : "console-diff__line";
                      const prefix = line.kind === "add" ? "+" : line.kind === "remove" ? "-" : " ";
                      return (
                        <div key={`${line.kind}-${index}`} className={className}>
                          <span className="console-diff__prefix">{prefix}</span>
                          <span>{line.text || " "}</span>
                        </div>
                      );
                    }) : (
                      <div className="console-empty">
                        No diff preview available yet for this artifact.
                      </div>
                    )}
                  </div>
                </>
              )}

              <details className="console-browser">
                <summary className="console-browser__summary">Browse Other Artifacts</summary>
                <div className="console-browser__body">
                  <div className="console-actions">
                    <input
                      className="console-select"
                      value={artifactSearch}
                      onChange={event => setArtifactSearch(event.target.value)}
                      placeholder="search artifacts"
                    />
                    <select
                      className="console-select"
                      value={selectedArtifact}
                      onChange={event => setSelectedArtifact(event.target.value)}
                    >
                      {selectedArtifactOptionGroups}
                    </select>
                    <button
                      className={pinnedArtifacts.includes(selectedArtifact) ? "console-btn console-btn--accent" : "console-btn"}
                      disabled={busy}
                      onClick={() => togglePin(selectedArtifact)}
                      type="button"
                    >
                      {pinnedArtifacts.includes(selectedArtifact) ? "Unpin" : "Pin"}
                    </button>
                  </div>
                </div>
              </details>
            </div>
          </section>

          <section className="console-panel console-panel--status">
            <div className="console-panel__head">
              <p className="console-panel__title">Why Blocked + Timeline</p>
              <div className="console-step__badge">
                {timeline?.cycles?.length || 0} cycles
              </div>
            </div>

            <div className="console-panel__body console-panel__body--stacked">
              <div className={summaryToneClass(blockedSummary?.severity)}>
                <div className="console-status__title">{blockedSummary?.title || "Ready"}</div>
                <p className="console-status__summary">{blockedSummary?.summary || "No blocking state reported."}</p>
                <p className="console-status__next">{blockedSummary?.suggested_next_step || "Run the next pipeline step."}</p>
                {blockedSummary?.evidence?.length > 0 ? (
                  <div className="console-status__evidence">
                    {blockedSummary.evidence.map((entry, index) => (
                      <div key={`${entry}-${index}`} className="console-status__evidence-line">{entry}</div>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="console-summarybar">
                <div className="console-summarybar__item">
                  <span className="console-summarybar__label">Run</span>
                  <span className="console-summarybar__value">{timeline?.run?.lifecycle?.status || "none"}</span>
                </div>
                <div className="console-summarybar__item">
                  <span className="console-summarybar__label">Score</span>
                  <span className="console-summarybar__value">{timeline?.run?.scoring?.average_score ?? "-"}</span>
                </div>
                <div className="console-summarybar__item">
                  <span className="console-summarybar__label">Cycles</span>
                  <span className="console-summarybar__value">{timeline?.run?.success?.completed_cycles ?? 0}/{state?.run ? (timeline?.run?.success?.completed_cycles || 0) + (timeline?.run?.success?.failed_cycles || 0) : 0}</span>
                </div>
                <div className="console-summarybar__item">
                  <span className="console-summarybar__label">Avg ms</span>
                  <span className="console-summarybar__value">{timeline?.run?.performance?.avg_cycle_time_ms ?? "-"}</span>
                </div>
              </div>

              <div className="console-timeline">
                {timeline?.cycles?.length > 0 ? timeline.cycles.map(cycle => (
                  <div key={cycle.cycle_id} className="console-cycle">
                    <div className="console-cycle__head">
                      <div>
                        <div className="console-cycle__title">Cycle {cycle.cycle_id}</div>
                        <div className="console-cycle__path">{cycle.operation?.file_path || "No file path"}</div>
                      </div>
                      <div className={cycle.execution?.final_status === "success" ? "console-step__badge console-step__badge--ok" : "console-step__badge console-step__badge--blocked"}>
                        {cycle.execution?.final_status || "unknown"}
                      </div>
                    </div>

                    <div className="console-cycle__meta">
                      <span>type={cycle.operation?.type || "unknown"}</span>
                      <span>score={cycle.scoring?.score ?? "-"}</span>
                      <span>retries={cycle.recovery?.retry_count ?? 0}</span>
                      <span>ms={cycle.execution?.duration_ms ?? 0}</span>
                      <span>reason={cycle.execution?.terminal_reason || "unknown"}</span>
                    </div>

                    {Array.isArray(cycle.verification?.violations) && cycle.verification.violations.length > 0 ? (
                      <div className="console-cycle__violations">
                        {cycle.verification.violations.map(entry => (
                          <span key={entry} className="console-chip console-chip--warn">{entry}</span>
                        ))}
                      </div>
                    ) : null}

                    <div className="console-cycle__actions">
                      {cycle.artifact_suggestions?.map(item => (
                        <button
                          key={item.id}
                          className="console-chip"
                          onClick={() => setSelectedArtifact(item.id)}
                          type="button"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )) : (
                  <div className="console-empty">
                    No finished cycles recorded yet for this workspace.
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="console-panel console-panel--logs">
            <div className="console-panel__head">
              <p className="console-panel__title">Live Logs</p>
              <div className="console-step__badge">
                {activeRun?.status === "running"
                  ? `running:${activeRun.task_id}`
                  : activeRun?.status === "exited"
                    ? `exited:${activeRun.exit_code}`
                    : "idle"}
              </div>
            </div>

            <div className="console-panel__body">
              <div className="console-log">
                {logs.length > 0 ? logs.map((line, index) => {
                  const tone = logLineTone(line);
                  const className =
                    tone === "system"
                      ? "console-log__line console-log__line--system"
                      : tone === "error"
                        ? "console-log__line console-log__line--error"
                        : "console-log__line";
                  return (
                    <div key={`${index}-${line.slice(0, 16)}`} className={className}>
                      {line}
                    </div>
                  );
                }) : (
                  <div className="console-log__line">No logs yet.</div>
                )}
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
