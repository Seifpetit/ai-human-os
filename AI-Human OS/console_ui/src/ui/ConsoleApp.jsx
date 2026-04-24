import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPost, openLogStream } from "./api.js";

const DEV_MODE_KEY = "ai_human_os_console_dev_mode";
const INIT_CONFIRM_KEY = "ai_human_os_console_init_confirm_signature";
const MAX_LOG_LINES = 600;

const DEV_ARTIFACT_ITEMS = [
  { id: "project_context_md", label: "PROJECT_CONTEXT.md" },
  { id: "product_standards_md", label: "PRODUCT_STANDARDS.md" },
  { id: "planning_prompt_txt", label: "Planning Prompt" },
  { id: "intent_confirmation_md", label: "Gate 1" },
  { id: "execution_confirmation_md", label: "Gate 2" },
  { id: "commit_confirmation_md", label: "Gate 3" },
  { id: "implementation_plan_json", label: "implementation_plan.json" },
  { id: "run_metrics_json", label: "run_metrics.json" },
];

function formatTimestamp(value) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString();
}

function titleCase(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, character => character.toUpperCase());
}

function tryParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function statusTone(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "done" || normalized === "approved" || normalized === "completed") {
    return "ok";
  }
  if (normalized === "running" || normalized === "verifying") {
    return "active";
  }
  if (normalized === "needs review" || normalized === "pending" || normalized === "missing") {
    return "warn";
  }
  if (normalized === "failed") {
    return "error";
  }
  return "muted";
}

function sanitizeProjectFolderName(value) {
  const normalized = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  const sanitized = normalized
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/[. ]+$/g, "")
    .trim();

  if (!sanitized || sanitized === "." || sanitized === "..") {
    return "";
  }

  const reservedNames = new Set([
    "CON",
    "PRN",
    "AUX",
    "NUL",
    "COM1",
    "COM2",
    "COM3",
    "COM4",
    "COM5",
    "COM6",
    "COM7",
    "COM8",
    "COM9",
    "LPT1",
    "LPT2",
    "LPT3",
    "LPT4",
    "LPT5",
    "LPT6",
    "LPT7",
    "LPT8",
    "LPT9",
  ]);

  if (reservedNames.has(sanitized.toUpperCase())) {
    return "";
  }

  return sanitized;
}

function joinDisplayPath(parentRoot, childName) {
  if (!parentRoot || !childName) return "";
  return `${String(parentRoot).replace(/[\\/]+$/, "")}/${childName}`;
}

const PROJECT_CONTEXT_FIELD_KEYS = [
  "what_the_product_is",
  "what_players_users_do",
  "core_idea",
  "how_it_works",
  "hard_parts",
  "rules_constraints",
  "one_line_version",
];

function normalizeProjectContextDraftValue(value) {
  return String(value || "").trim();
}

function createProjectContextDraft(source = {}) {
  return PROJECT_CONTEXT_FIELD_KEYS.reduce((draft, key) => {
    draft[key] = normalizeProjectContextDraftValue(source?.[key]);
    return draft;
  }, {});
}

function normalizeStyleDraftValue(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  if (/^<.*>$/.test(normalized)) return "";
  return normalized;
}

function PlainTextArtifact({ artifact, emptyMessage = "Artifact not available yet." }) {
  if (!artifact?.meta?.exists) {
    return <div className="empty-state">{emptyMessage}</div>;
  }

  return (
    <div className="artifact-panel">
      <div className="artifact-panel__path">{artifact.path}</div>
      <pre className="artifact-panel__content">{artifact.content || ""}</pre>
    </div>
  );
}

function MetricSummary({ runState }) {
  if (!runState?.run) {
    return <div className="empty-state">Metrics are not available yet.</div>;
  }

  const run = runState.run;
  return (
    <div className="metric-grid">
      <div className="metric-card">
        <div className="metric-card__label">Run status</div>
        <div className="metric-card__value">{titleCase(run.lifecycle?.status || "unknown")}</div>
      </div>
      <div className="metric-card">
        <div className="metric-card__label">Cycles completed</div>
        <div className="metric-card__value">{run.success?.completed_cycles ?? 0}</div>
      </div>
      <div className="metric-card">
        <div className="metric-card__label">Cycles failed</div>
        <div className="metric-card__value">{run.success?.failed_cycles ?? 0}</div>
      </div>
      <div className="metric-card">
        <div className="metric-card__label">Average score</div>
        <div className="metric-card__value">{run.scoring?.average_score ?? 0}</div>
      </div>
      <div className="metric-card">
        <div className="metric-card__label">Average cycle time</div>
        <div className="metric-card__value">{run.performance?.avg_cycle_time_ms ?? 0} ms</div>
      </div>
      <div className="metric-card">
        <div className="metric-card__label">Failure classification</div>
        <div className="metric-card__value">{run.failure?.classification || "none"}</div>
      </div>
    </div>
  );
}

export default function ConsoleApp() {
  const [dashboard, setDashboard] = useState(null);
  const [runData, setRunData] = useState({ active_run: null });
  const [resetOptions, setResetOptions] = useState({ modes: [], archives: [] });
  const [artifactCache, setArtifactCache] = useState({});
  const [artifactErrors, setArtifactErrors] = useState({});
  const [projectNameInput, setProjectNameInput] = useState("");
  const [projectNameDirty, setProjectNameDirty] = useState(false);
  const [projectContextInput, setProjectContextInput] = useState(() => createProjectContextDraft());
  const [projectContextDirty, setProjectContextDirty] = useState(false);
  const [projectContextMessage, setProjectContextMessage] = useState("");
  const [projectContextError, setProjectContextError] = useState("");
  const [projectStyleInput, setProjectStyleInput] = useState({
    quality_level: "",
    preferred_tone: "",
    visual_direction: "",
    color_direction: "",
    ui_density: "",
    accessibility_baseline: "",
    interaction_notes: "",
  });
  const [projectStyleDirty, setProjectStyleDirty] = useState(false);
  const [projectStyleMessage, setProjectStyleMessage] = useState("");
  const [projectStyleError, setProjectStyleError] = useState("");
  const [workspaceMessage, setWorkspaceMessage] = useState("");
  const [workspaceError, setWorkspaceError] = useState("");
  const [globalError, setGlobalError] = useState("");
  const [inlineNote, setInlineNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);
  const [devMode, setDevMode] = useState(() => {
    try {
      return JSON.parse(window.localStorage.getItem(DEV_MODE_KEY) || "false");
    } catch {
      return false;
    }
  });
  const [devArtifactId, setDevArtifactId] = useState("project_context_md");
  const [resetMode, setResetMode] = useState("normal");
  const [archiveDirName, setArchiveDirName] = useState("");
  const [isPickingWorkspace, setIsPickingWorkspace] = useState(false);
  const [initSubpage, setInitSubpage] = useState("project_context");
  const isPickingWorkspaceRef = useRef(false);
  const [confirmedInitSignature, setConfirmedInitSignature] = useState(() => {
    try {
      return window.localStorage.getItem(INIT_CONFIRM_KEY) || "";
    } catch {
      return "";
    }
  });

  const activeRun = runData?.active_run || dashboard?.active_run || null;
  const runIsActive = activeRun?.status === "running";
  const backendScreen = dashboard?.phase?.current_screen || "init";
  const workspace = dashboard?.workspace || null;
  const projectContext = dashboard?.project_context || null;
  const styleInputs = dashboard?.style_inputs || null;
  const planSummary = dashboard?.plan_summary || null;
  const executionSummary = dashboard?.execution_summary || null;
  const sanitizedProjectFolderName = sanitizeProjectFolderName(projectNameInput);
  const initConfirmationSignature = `${workspace?.workspace_root || ""}|${projectContext?.meta?.mtime_ms || 0}|${styleInputs?.meta?.mtime_ms || 0}`;
  const initStepConfirmed = Boolean(
    initConfirmationSignature &&
    confirmedInitSignature &&
    confirmedInitSignature === initConfirmationSignature
  );
  const currentScreen = backendScreen === "intake" && !initStepConfirmed ? "init" : backendScreen;
  const canAdvanceFromInit =
    currentScreen === "init" &&
    backendScreen === "intake" &&
    !runIsActive &&
    !projectContextDirty &&
    !projectStyleDirty;
  const phaseTitle =
    currentScreen === "init" && backendScreen === "intake"
      ? "Init"
      : dashboard?.phase?.title || "Loading";
  const phaseDescription =
    currentScreen === "init" && backendScreen === "intake"
      ? "Confirm the selected workspace, project context, and style before moving to intake."
      : dashboard?.phase?.description || "Loading pipeline state...";
  const targetWorkspacePreview =
    workspace?.workspace_parent_root && sanitizedProjectFolderName
      ? joinDisplayPath(workspace.workspace_parent_root, sanitizedProjectFolderName)
      : workspace?.workspace_root || "";

  const currentArtifactId = useMemo(() => {
    if (currentScreen === "intent_review") return "intent_confirmation_md";
    if (currentScreen === "plan_review") return "execution_confirmation_md";
    if (currentScreen === "artifact_review") return "commit_confirmation_md";
    return "";
  }, [currentScreen]);

  const currentArtifact = currentArtifactId ? artifactCache[currentArtifactId] : null;
  const metricsArtifact = artifactCache.run_metrics_json || null;
  const devArtifact = devArtifactId ? artifactCache[devArtifactId] : null;

  useEffect(() => {
    isPickingWorkspaceRef.current = isPickingWorkspace;
  }, [isPickingWorkspace]);

  useEffect(() => {
    try {
      if (confirmedInitSignature) {
        window.localStorage.setItem(INIT_CONFIRM_KEY, confirmedInitSignature);
      } else {
        window.localStorage.removeItem(INIT_CONFIRM_KEY);
      }
    } catch {
      // ignore
    }
  }, [confirmedInitSignature]);

  async function refreshResetOptions() {
    try {
      const data = await apiGet("/api/reset/options");
      setResetOptions(data);
      if (!data.modes?.some(mode => mode.id === resetMode)) {
        setResetMode(data.modes?.[0]?.id || "normal");
      }
      if (!archiveDirName && Array.isArray(data.archives) && data.archives.length > 0) {
        setArchiveDirName(data.archives[0].name || data.archives[0].dir_name || "");
      }
    } catch (error) {
      if (!isPickingWorkspaceRef.current) {
        setGlobalError(error.message || String(error));
      }
    }
  }

  async function refreshDashboard({ silent = false } = {}) {
    try {
      if (!silent) setLoading(true);
      const [state, run] = await Promise.all([
        apiGet("/api/state"),
        apiGet("/api/run"),
      ]);
      setDashboard(state);
      setRunData(run);
      setGlobalError("");

      if (!projectNameDirty) {
        setProjectNameInput(state?.workspace?.project_name || "");
      }
      if (!projectContextDirty) {
        setProjectContextInput(createProjectContextDraft(state?.project_context?.fields));
      }
      if (!projectStyleDirty) {
        setProjectStyleInput({
          quality_level: normalizeStyleDraftValue(state?.style_inputs?.quality_level),
          preferred_tone: normalizeStyleDraftValue(state?.style_inputs?.preferred_tone),
          visual_direction: normalizeStyleDraftValue(state?.style_inputs?.visual_direction),
          color_direction: normalizeStyleDraftValue(state?.style_inputs?.color_direction),
          ui_density: normalizeStyleDraftValue(state?.style_inputs?.ui_density),
          accessibility_baseline: normalizeStyleDraftValue(state?.style_inputs?.accessibility_baseline),
          interaction_notes: normalizeStyleDraftValue(state?.style_inputs?.interaction_notes),
        });
      }
    } catch (error) {
      if (!isPickingWorkspaceRef.current) {
        setGlobalError(error.message || String(error));
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }

  async function ensureArtifact(id, force = false) {
    if (!id) return null;
    if (!force && artifactCache[id]) {
      return artifactCache[id];
    }

    try {
      const data = await apiGet(`/api/artifact?id=${id}`);
      setArtifactCache(previous => ({ ...previous, [id]: data }));
      setArtifactErrors(previous => {
        const next = { ...previous };
        delete next[id];
        return next;
      });
      return data;
    } catch (error) {
      setArtifactErrors(previous => ({ ...previous, [id]: error.message || String(error) }));
      throw error;
    }
  }

  function clearUiAfterReset(mode) {
    setArtifactCache({});
    setArtifactErrors({});
    setLogs([]);
    setShowLogs(false);
    setInlineNote("");
    setGlobalError("");
    setProjectContextError("");
    setProjectContextMessage("");
    setProjectStyleError("");
    setProjectStyleMessage("");
    setWorkspaceError("");
    setWorkspaceMessage(
      mode === "hard"
        ? "Hard reset complete. Reconfirm workspace, project context, and style."
        : "Reset complete."
    );
    setProjectNameDirty(false);
    setProjectContextInput(createProjectContextDraft());
    setProjectContextDirty(false);
    setProjectStyleInput({
      quality_level: "",
      preferred_tone: "",
      visual_direction: "",
      color_direction: "",
      ui_density: "",
      accessibility_baseline: "",
      interaction_notes: "",
    });
    setProjectStyleDirty(false);
    setInitSubpage("project_context");
    setDevArtifactId("project_context_md");
    setConfirmedInitSignature("");
  }

  function advanceToNextScreen() {
    setGlobalError("");
    if (!canAdvanceFromInit) {
      setGlobalError("Screen 1 is not ready yet. Choose the workspace and complete the project context plus style fields first.");
      return;
    }
    setConfirmedInitSignature(initConfirmationSignature);
  }

  async function startTask(taskId) {
    setInlineNote("");
    setGlobalError("");
    try {
      const response = await apiPost(`/api/run/${taskId}`);
      setRunData({ active_run: response.active_run || null });
      await refreshDashboard({ silent: true });
      return response;
    } catch (error) {
      setGlobalError(error.message || String(error));
      throw error;
    }
  }

  async function approveGate(gateId) {
    setInlineNote("");
    setGlobalError("");
    try {
      await apiPost(`/api/gates/${gateId}/approve`, { approval_status: "approved" });
      const artifactId =
        gateId === "gate1"
          ? "intent_confirmation_md"
          : gateId === "gate2"
            ? "execution_confirmation_md"
            : "commit_confirmation_md";
      await ensureArtifact(artifactId, true);
      await refreshDashboard({ silent: true });
    } catch (error) {
      setGlobalError(error.message || String(error));
    }
  }

  async function browseWorkspace() {
    setInlineNote("");
    setWorkspaceMessage("");
    setWorkspaceError("");
    setGlobalError("");
    try {
      if (!sanitizedProjectFolderName) {
        throw new Error("Project name is required before choosing a parent folder.");
      }
      setIsPickingWorkspace(true);
      setWorkspaceMessage("Opening the folder picker. If it is not visible, check the taskbar or other open windows.");
      const response = await apiPost("/api/workspace/pick", { project_name: sanitizedProjectFolderName });
      if (response?.cancelled) {
        setWorkspaceMessage("Folder selection cancelled.");
        return;
      }

      const resolvedPath =
        response?.resolved?.workspace_root ||
        response?.selected?.workspace_root ||
        targetWorkspacePreview;
      const resolvedProjectName =
        response?.selected?.project_name ||
        response?.resolved?.project_name ||
        sanitizedProjectFolderName;

      setProjectNameInput(resolvedProjectName);
      setProjectNameDirty(false);
      setWorkspaceMessage(
        response?.selected?.created
          ? `Workspace folder created: ${resolvedPath}`
          : `Workspace folder ready: ${resolvedPath}`
      );
      await refreshDashboard({ silent: true });
    } catch (error) {
      setWorkspaceError(error.message || String(error));
    } finally {
      setIsPickingWorkspace(false);
    }
  }

  async function saveProjectContext() {
    setProjectContextMessage("");
    setProjectContextError("");
    setGlobalError("");
    try {
      const response = await apiPost("/api/project-context", {
        fields: projectContextInput,
      });
      setProjectContextInput(createProjectContextDraft(response?.project_context?.fields));
      setProjectContextDirty(false);
      setProjectContextMessage("Project context saved.");
      setConfirmedInitSignature("");
      if (devMode) {
        await ensureArtifact("project_context_md", true);
      }
      await refreshDashboard({ silent: true });
    } catch (error) {
      setProjectContextError(error.message || String(error));
    }
  }

  async function saveProjectStyle() {
    setProjectStyleMessage("");
    setProjectStyleError("");
    setGlobalError("");
    try {
      const response = await apiPost("/api/project-style", projectStyleInput);
      const nextStyle = response?.style_inputs || {};
      setProjectStyleInput({
        quality_level: normalizeStyleDraftValue(nextStyle.quality_level),
        preferred_tone: normalizeStyleDraftValue(nextStyle.preferred_tone),
        visual_direction: normalizeStyleDraftValue(nextStyle.visual_direction),
        color_direction: normalizeStyleDraftValue(nextStyle.color_direction),
        ui_density: normalizeStyleDraftValue(nextStyle.ui_density),
        accessibility_baseline: normalizeStyleDraftValue(nextStyle.accessibility_baseline),
        interaction_notes: normalizeStyleDraftValue(nextStyle.interaction_notes),
      });
      setProjectStyleDirty(false);
      setProjectStyleMessage("Style settings saved.");
      setConfirmedInitSignature("");
      await refreshDashboard({ silent: true });
    } catch (error) {
      setProjectStyleError(error.message || String(error));
    }
  }

  function reloadProjectContextInput() {
    setProjectContextInput(createProjectContextDraft(projectContext?.fields));
    setProjectContextDirty(false);
    setProjectContextMessage("");
    setProjectContextError("");
  }

  function updateProjectContextField(key, value) {
    setProjectContextInput(previous => ({ ...previous, [key]: value }));
    setProjectContextDirty(true);
    setProjectContextMessage("");
    setProjectContextError("");
  }

  function reloadProjectStyleInput() {
    setProjectStyleInput({
      quality_level: normalizeStyleDraftValue(styleInputs?.quality_level),
      preferred_tone: normalizeStyleDraftValue(styleInputs?.preferred_tone),
      visual_direction: normalizeStyleDraftValue(styleInputs?.visual_direction),
      color_direction: normalizeStyleDraftValue(styleInputs?.color_direction),
      ui_density: normalizeStyleDraftValue(styleInputs?.ui_density),
      accessibility_baseline: normalizeStyleDraftValue(styleInputs?.accessibility_baseline),
      interaction_notes: normalizeStyleDraftValue(styleInputs?.interaction_notes),
    });
    setProjectStyleDirty(false);
    setProjectStyleMessage("");
    setProjectStyleError("");
  }

  async function runReset() {
    setInlineNote("");
    setGlobalError("");
    try {
      await apiPost("/api/reset", {
        mode: resetMode,
        archive_dir_name: resetMode === "archive" ? archiveDirName : "",
      });
      clearUiAfterReset(resetMode);
      await refreshResetOptions();
      await refreshDashboard({ silent: true });
    } catch (error) {
      setGlobalError(error.message || String(error));
    }
  }

  async function reloadCurrentArtifact() {
    if (!currentArtifactId) return;
    try {
      await ensureArtifact(currentArtifactId, true);
      await refreshDashboard({ silent: true });
    } catch (error) {
      setGlobalError(error.message || String(error));
    }
  }

  useEffect(() => {
    refreshResetOptions();
    refreshDashboard();

    const intervalId = window.setInterval(() => {
      if (!isPickingWorkspaceRef.current) {
        refreshDashboard({ silent: true });
      }
    }, 2000);

    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(DEV_MODE_KEY, JSON.stringify(devMode));
    } catch {
      // ignore
    }
  }, [devMode]);

  useEffect(() => {
    const close = openLogStream(event => {
      if (event?.event === "snapshot") {
        setLogs(Array.isArray(event.lines) ? event.lines.slice(-MAX_LOG_LINES) : []);
        if (event.run) {
          setRunData({ active_run: event.run });
        }
        return;
      }

      if (event?.event === "run_state") {
        setRunData({ active_run: event.run || null });
        refreshDashboard({ silent: true });
        return;
      }

      if (event?.line) {
        setLogs(previous => [...previous, event.line].slice(-MAX_LOG_LINES));
      }
    });

    return close;
  }, []);

  useEffect(() => {
    if (currentArtifactId) {
      ensureArtifact(currentArtifactId).catch(() => {});
    }
  }, [currentArtifactId]);

  useEffect(() => {
    if (devMode && devArtifactId) {
      ensureArtifact(devArtifactId).catch(() => {});
    }
  }, [devMode, devArtifactId]);

  useEffect(() => {
    if (devMode && dashboard?.run && !runIsActive) {
      ensureArtifact("run_metrics_json").catch(() => {});
    }
  }, [devMode, dashboard?.run, runIsActive]);

  function renderHeader() {
    return (
      <header className="console-header">
        <div>
          <div className="console-brand">AI-Human OS</div>
          <div className="console-title-row">
            <h1 className="console-title">{phaseTitle}</h1>
            <button
              className="btn btn--primary"
              type="button"
              onClick={advanceToNextScreen}
              disabled={!canAdvanceFromInit}
            >
              Next Step
            </button>
          </div>
          <p className="console-summary">{phaseDescription}</p>
          {workspace?.workspace_root ? (
            <div className="console-context">Workspace: {workspace.workspace_root}</div>
          ) : null}
        </div>

        <div className="header-actions">
          <label className="dev-toggle">
            <input
              type="checkbox"
              checked={devMode}
              onChange={event => setDevMode(event.target.checked)}
            />
            <span>Dev mode</span>
          </label>

          <div className="reset-controls">
            <select
              className="header-select"
              value={resetMode}
              onChange={event => setResetMode(event.target.value)}
              disabled={runIsActive}
            >
              {resetOptions.modes?.map(mode => (
                <option key={mode.id} value={mode.id}>
                  {mode.label}
                </option>
              ))}
            </select>

            {resetMode === "archive" ? (
              <select
                className="header-select header-select--wide"
                value={archiveDirName}
                onChange={event => setArchiveDirName(event.target.value)}
                disabled={runIsActive}
              >
                {(resetOptions.archives || []).map(item => {
                  const value = item.name || item.dir_name || "";
                  return (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  );
                })}
              </select>
            ) : null}

            <button className="btn btn--reset" type="button" onClick={runReset} disabled={runIsActive}>
              Reset
            </button>
          </div>

          {runIsActive ? (
            <div className="run-chip">
              <span className="spinner" />
              <span>{activeRun?.task_label || activeRun?.task_id || "Task running"}</span>
            </div>
          ) : null}
        </div>
      </header>
    );
  }

  function renderInitScreen() {
    return (
      <section className="screen-card">
        <div className="screen-card__eyebrow">Screen 1</div>
        <h2>Initialize project</h2>
        <p className="screen-card__lead">
          Enter the new project name, choose a parent folder, and fill the project context plus style fields before moving on.
        </p>

        <div className="form-block">
          <label className="field-label" htmlFor="project-name-input">
            New project name
          </label>
          <div className="inline-form">
            <input
              id="project-name-input"
              className="text-input"
              type="text"
              value={projectNameInput}
              placeholder="My new game"
              onChange={event => {
                setProjectNameInput(event.target.value);
                setProjectNameDirty(true);
              }}
            />
            <button
              className="btn btn--primary"
              type="button"
              onClick={browseWorkspace}
              disabled={runIsActive || isPickingWorkspace || !sanitizedProjectFolderName}
            >
              {isPickingWorkspace ? "Waiting For Folder Picker..." : "Browse Parent Folder"}
            </button>
          </div>
          <p className="form-hint">
            The picker chooses the parent location only. AI-Human OS will create and use
            {" "}
            <strong>{sanitizedProjectFolderName || "a new project folder"}</strong>
            {" "}
            inside it.
          </p>
          {workspaceMessage ? <div className="feedback feedback--ok">{workspaceMessage}</div> : null}
          {workspaceError ? <div className="feedback feedback--error">{workspaceError}</div> : null}
        </div>

        <div className="info-grid info-grid--compact">
          <article className="info-card info-card--compact">
            <div className="info-card__label">Selected parent folder</div>
            <div className="info-card__value">{workspace?.workspace_parent_root || "No parent folder selected"}</div>
            <p className="info-card__body">
              This is the parent location chosen from the OS folder browser.
            </p>
          </article>

          <article className="info-card info-card--compact">
            <div className="info-card__label">Target project folder</div>
            <div className="info-card__value">{targetWorkspacePreview || "Choose a project name and parent folder"}</div>
            <p className="info-card__body">
              {workspace?.validation_ok
              ? "This is the exact folder AI-Human OS will mutate."
              : `Blocked: ${workspace?.error || "workspace_root_invalid"}`}
            </p>
          </article>
        </div>

        <div className="screen-subnav">
          <button
            className={`screen-subnav__button ${initSubpage === "project_context" ? "screen-subnav__button--active" : ""}`}
            type="button"
            onClick={() => setInitSubpage("project_context")}
          >
            Project context
          </button>
          <button
            className={`screen-subnav__button ${initSubpage === "style" ? "screen-subnav__button--active" : ""}`}
            type="button"
            onClick={() => setInitSubpage("style")}
          >
            Style
          </button>
        </div>

        {initSubpage === "project_context" ? (
          <article className="info-card info-card--editor">
            <div className="info-card__label">Project context</div>
            <div className="info-card__value">{dashboard?.paths?.project_context || projectContext?.path}</div>
            <p className="info-card__body">
              Fill these fields exactly from the init prompt. This writes the human project description block inside
              {" "}
              <code>PROJECT_CONTEXT.md</code>
              .
            </p>

            <div className="context-grid">
              <label className="context-field">
                <span className="context-field__label">What the product is</span>
                <textarea
                  className="multiline-input context-control"
                  rows={2}
                  value={projectContextInput.what_the_product_is}
                  onChange={event => updateProjectContextField("what_the_product_is", event.target.value)}
                />
              </label>

              <label className="context-field">
                <span className="context-field__label">What players/users do</span>
                <textarea
                  className="multiline-input context-control"
                  rows={2}
                  value={projectContextInput.what_players_users_do}
                  onChange={event => updateProjectContextField("what_players_users_do", event.target.value)}
                />
              </label>

              <label className="context-field">
                <span className="context-field__label">Core idea</span>
                <textarea
                  className="multiline-input context-control"
                  rows={2}
                  value={projectContextInput.core_idea}
                  onChange={event => updateProjectContextField("core_idea", event.target.value)}
                />
              </label>

              <label className="context-field">
                <span className="context-field__label">How it works</span>
                <textarea
                  className="multiline-input context-control"
                  rows={3}
                  value={projectContextInput.how_it_works}
                  onChange={event => updateProjectContextField("how_it_works", event.target.value)}
                />
              </label>

              <label className="context-field">
                <span className="context-field__label">Hard parts</span>
                <textarea
                  className="multiline-input context-control"
                  rows={2}
                  value={projectContextInput.hard_parts}
                  onChange={event => updateProjectContextField("hard_parts", event.target.value)}
                />
              </label>

              <label className="context-field">
                <span className="context-field__label">Rules / constraints</span>
                <textarea
                  className="multiline-input context-control"
                  rows={3}
                  value={projectContextInput.rules_constraints}
                  onChange={event => updateProjectContextField("rules_constraints", event.target.value)}
                />
              </label>

              <label className="context-field context-field--wide">
                <span className="context-field__label">One-line version</span>
                <input
                  className="text-input context-control"
                  type="text"
                  value={projectContextInput.one_line_version}
                  onChange={event => updateProjectContextField("one_line_version", event.target.value)}
                />
              </label>
            </div>

            <div className="button-row">
              <button
                className="btn btn--primary"
                type="button"
                onClick={saveProjectContext}
                disabled={runIsActive || !projectContextDirty}
              >
                Save Project Context
              </button>
              <button className="btn" type="button" onClick={reloadProjectContextInput} disabled={runIsActive}>
                Reload Draft
              </button>
              <button className="btn" type="button" onClick={() => refreshDashboard()} disabled={runIsActive}>
                Reload Status
              </button>
              {devMode ? (
                <button
                  className="btn"
                  type="button"
                  onClick={() => setDevArtifactId("project_context_md")}
                >
                  Open Raw File
                </button>
              ) : null}
            </div>
            {projectContextMessage ? <div className="feedback feedback--ok">{projectContextMessage}</div> : null}
            {projectContextError ? <div className="feedback feedback--error">{projectContextError}</div> : null}
            <p className="info-card__body">
              {projectContextDirty
                ? "Project context changes are unsaved."
                : projectContext?.ready
                  ? projectContext.summary || "Project context looks ready."
                  : "The human project description block is still empty."}
            </p>
          </article>
        ) : null}

        {initSubpage === "style" ? (
          <article className="info-card info-card--style">
            <div className="info-card__label">Project style</div>
            <div className="info-card__value">{dashboard?.paths?.product_standards || styleInputs?.path}</div>
            <p className="info-card__body">
              Fill the init style block. These values update <code>PRODUCT_STANDARDS.md</code> and are part of Screen 1 completion.
            </p>

            <div className="style-grid">
              <label className="style-field">
                <span className="style-field__label">Product quality level</span>
                <select
                  className="text-input style-control"
                  value={projectStyleInput.quality_level}
                  onChange={event => {
                    setProjectStyleInput(previous => ({ ...previous, quality_level: event.target.value }));
                    setProjectStyleDirty(true);
                    setProjectStyleMessage("");
                    setProjectStyleError("");
                  }}
                >
                  <option value="">Select quality level</option>
                  <option value="prototype">prototype</option>
                  <option value="standard_passing">standard_passing</option>
                  <option value="production_ready">production_ready</option>
                  <option value="premium_polished">premium_polished</option>
                </select>
              </label>

              <label className="style-field">
                <span className="style-field__label">Preferred product tone</span>
                <select
                  className="text-input style-control"
                  value={projectStyleInput.preferred_tone}
                  onChange={event => {
                    setProjectStyleInput(previous => ({ ...previous, preferred_tone: event.target.value }));
                    setProjectStyleDirty(true);
                    setProjectStyleMessage("");
                    setProjectStyleError("");
                  }}
                >
                  <option value="">Select tone</option>
                  <option value="playful">playful</option>
                  <option value="serious">serious</option>
                  <option value="tactical">tactical</option>
                  <option value="premium">premium</option>
                  <option value="minimal">minimal</option>
                  <option value="bold">bold</option>
                </select>
              </label>

              <label className="style-field">
                <span className="style-field__label">Visual direction</span>
                <input
                  className="text-input style-control"
                  type="text"
                  value={projectStyleInput.visual_direction}
                  placeholder="Purposeful, warm, and concrete"
                  onChange={event => {
                    setProjectStyleInput(previous => ({ ...previous, visual_direction: event.target.value }));
                    setProjectStyleDirty(true);
                    setProjectStyleMessage("");
                    setProjectStyleError("");
                  }}
                />
              </label>

              <label className="style-field">
                <span className="style-field__label">Color direction</span>
                <input
                  className="text-input style-control"
                  type="text"
                  value={projectStyleInput.color_direction}
                  placeholder="Soft warm neutrals with one strong accent"
                  onChange={event => {
                    setProjectStyleInput(previous => ({ ...previous, color_direction: event.target.value }));
                    setProjectStyleDirty(true);
                    setProjectStyleMessage("");
                    setProjectStyleError("");
                  }}
                />
              </label>

              <label className="style-field">
                <span className="style-field__label">UI density</span>
                <select
                  className="text-input style-control"
                  value={projectStyleInput.ui_density}
                  onChange={event => {
                    setProjectStyleInput(previous => ({ ...previous, ui_density: event.target.value }));
                    setProjectStyleDirty(true);
                    setProjectStyleMessage("");
                    setProjectStyleError("");
                  }}
                >
                  <option value="">Select density</option>
                  <option value="airy">airy</option>
                  <option value="balanced">balanced</option>
                  <option value="compact">compact</option>
                </select>
              </label>

              <label className="style-field style-field--wide">
                <span className="style-field__label">Accessibility baseline</span>
                <textarea
                  className="multiline-input style-textarea"
                  rows={3}
                  value={projectStyleInput.accessibility_baseline}
                  placeholder="Keyboard support, contrast, and touch target expectations."
                  onChange={event => {
                    setProjectStyleInput(previous => ({ ...previous, accessibility_baseline: event.target.value }));
                    setProjectStyleDirty(true);
                    setProjectStyleMessage("");
                    setProjectStyleError("");
                  }}
                />
              </label>

              <label className="style-field style-field--wide">
                <span className="style-field__label">Interaction notes</span>
                <textarea
                  className="multiline-input style-textarea"
                  rows={3}
                  value={projectStyleInput.interaction_notes}
                  placeholder="Short notes about the intended feel of interactions."
                  onChange={event => {
                    setProjectStyleInput(previous => ({ ...previous, interaction_notes: event.target.value }));
                    setProjectStyleDirty(true);
                    setProjectStyleMessage("");
                    setProjectStyleError("");
                  }}
                />
              </label>
            </div>

            <div className="button-row">
              <button
                className="btn btn--primary"
                type="button"
                onClick={saveProjectStyle}
                disabled={runIsActive || !projectStyleDirty}
              >
                Save Project Style
              </button>
              <button className="btn" type="button" onClick={reloadProjectStyleInput} disabled={runIsActive}>
                Reload Draft
              </button>
              <button className="btn" type="button" onClick={() => refreshDashboard()} disabled={runIsActive}>
                Reload Status
              </button>
              {devMode ? (
                <button
                  className="btn"
                  type="button"
                  onClick={() => setDevArtifactId("product_standards_md")}
                >
                  Open Raw File
                </button>
              ) : null}
            </div>
            {projectStyleMessage ? <div className="feedback feedback--ok">{projectStyleMessage}</div> : null}
            {projectStyleError ? <div className="feedback feedback--error">{projectStyleError}</div> : null}
            <p className="info-card__body">
              {projectStyleDirty
                ? "Style changes are unsaved."
                : styleInputs?.ready
                  ? "Style inputs are ready."
                  : "The style block still needs input."}
            </p>
          </article>
        ) : null}
      </section>
    );
  }

  function renderIntakeScreen() {
    return (
      <section className="screen-card">
        <div className="screen-card__eyebrow">Screen 2</div>
        <h2>Run intake</h2>
        <p className="screen-card__lead">
          Prepare the raw human scope first. The system will turn it into INTENT_CONFIRMATION.md.
        </p>

        <article className="info-card">
          <div className="info-card__label">Planning prompt file</div>
          <div className="info-card__value">{dashboard?.paths?.planning_prompt || dashboard?.planning_prompt?.path}</div>
          <p className="info-card__body">Edit this file directly, then click Run Intake.</p>
        </article>

        <article className="info-card">
          <div className="info-card__label">Project context summary</div>
          <div className="info-card__body">
            {projectContext?.summary || "Project context is ready, but no summary could be extracted."}
          </div>
        </article>

        <div className="button-row">
          <button className="btn btn--primary" type="button" onClick={() => startTask("planning_intake")} disabled={runIsActive}>
            Run Intake
          </button>
          <button className="btn" type="button" onClick={() => refreshDashboard()} disabled={runIsActive}>
            Reload Status
          </button>
        </div>
      </section>
    );
  }

  function renderIntentReviewScreen() {
    const artifactError = artifactErrors.intent_confirmation_md;
    const artifactPath = currentArtifact?.path || dashboard?.gates?.gate1?.artifact;

    return (
      <section className="screen-card">
        <div className="screen-card__eyebrow">Screen 3</div>
        <h2>Review intent confirmation</h2>
        <p className="screen-card__lead">Approve the machine interpretation of your intended scope.</p>

        <div className="button-row">
          <button className="btn btn--primary" type="button" onClick={() => approveGate("gate1")} disabled={runIsActive}>
            Approve Gate 1
          </button>
          <button className="btn" type="button" onClick={() => {
            setInlineNote(`Edit the file at ${currentArtifact?.path || artifactPath || "INTENT_CONFIRMATION.md"}, then click Reload.`);
          }}>
            Edit
          </button>
          <button className="btn" type="button" onClick={reloadCurrentArtifact} disabled={runIsActive}>
            Reload
          </button>
        </div>

        {artifactError ? <div className="feedback feedback--error">{artifactError}</div> : null}
        {inlineNote ? <div className="feedback">{inlineNote}</div> : null}
        <PlainTextArtifact artifact={currentArtifact} emptyMessage="INTENT_CONFIRMATION.md is not available yet." />
      </section>
    );
  }

  function renderPlanReviewScreen() {
    const artifactError = artifactErrors.execution_confirmation_md;
    const gate2Exists = currentArtifact?.meta?.exists;
    const planReady = Boolean(planSummary?.available);

    if (!planReady || !gate2Exists) {
      return (
        <section className="screen-card">
          <div className="screen-card__eyebrow">Screen 4</div>
          <h2>Generate execution plan</h2>
          <p className="screen-card__lead">
            Planning has not produced the execution-ready artifacts yet.
          </p>

          <div className="empty-state">
            Run planning to generate the compiled plan and Gate 2 confirmation.
          </div>

          {artifactError ? <div className="feedback feedback--error">{artifactError}</div> : null}

          <div className="button-row">
            <button className="btn btn--primary" type="button" onClick={() => startTask("planning")} disabled={runIsActive}>
              Run Planning
            </button>
            <button className="btn" type="button" onClick={() => refreshDashboard()} disabled={runIsActive}>
              Reload Status
            </button>
          </div>
        </section>
      );
    }

    return (
      <section className="screen-card">
        <div className="screen-card__eyebrow">Screen 4</div>
        <h2>Review compiled plan</h2>
        <p className="screen-card__lead">
          {planSummary.file_count} files across {planSummary.feature_count} features and {planSummary.operation_count} operations.
        </p>

        <div className="summary-list">
          {planSummary.operations.map(operation => (
            <div className="summary-row" key={operation.operation_key}>
              <span>{operation.file_name || operation.file_path}</span>
              <span className="summary-row__meta">{operation.operation_type || "unknown"}</span>
            </div>
          ))}
        </div>

        <details className="details-card">
          <summary>See full plan</summary>
          <div className="details-card__body">
            {planSummary.operations.map(operation => (
              <div className="plan-detail" key={operation.operation_key}>
                <div className="plan-detail__title">
                  {operation.file_name || operation.file_path} · {operation.operation_type || "unknown"}
                </div>
                <div className="plan-detail__body">{operation.purpose || "No purpose recorded."}</div>
              </div>
            ))}
          </div>
        </details>

        <details className="details-card">
          <summary>Review Gate 2 artifact</summary>
          <div className="details-card__body">
            <PlainTextArtifact artifact={currentArtifact} emptyMessage="Gate 2 artifact is missing." />
          </div>
        </details>

        <div className="button-row">
          <button
            className="btn btn--primary"
            type="button"
            onClick={async () => {
              try {
                await apiPost("/api/gates/gate2/approve", { approval_status: "approved" });
                await ensureArtifact("execution_confirmation_md", true);
                await startTask("ai");
              } catch (error) {
                setGlobalError(error.message || String(error));
              }
            }}
            disabled={runIsActive}
          >
            Approve Gate 2 and Start Execution
          </button>
          <button className="btn" type="button" onClick={reloadCurrentArtifact} disabled={runIsActive}>
            Reload
          </button>
        </div>
      </section>
    );
  }

  function renderExecutionScreen() {
    const total = executionSummary?.total_operations || 0;
    const completed = executionSummary?.completed_operations || 0;
    const progress = total > 0 ? Math.round((completed / total) * 100) : 0;

    return (
      <section className="screen-card">
        <div className="screen-card__eyebrow">Screen 5</div>
        <h2>Execution</h2>
        <p className="screen-card__lead">{dashboard?.suggested_next_action || "Run the next cycle when ready."}</p>

        <div className="progress-card">
          <div className="progress-card__meta">
            <span>{completed} of {total} operations complete</span>
            <span>{progress}%</span>
          </div>
          <div className="progress-bar">
            <div className="progress-bar__fill" style={{ width: `${progress}%` }} />
          </div>
        </div>

        {dashboard?.blocked_summary ? (
          <article className={`callout callout--${dashboard.blocked_summary.severity || "muted"}`}>
            <div className="callout__title">{dashboard.blocked_summary.title}</div>
            <div className="callout__body">{dashboard.blocked_summary.summary}</div>
          </article>
        ) : null}

        <div className="operation-list">
          {(executionSummary?.operations || []).map(operation => (
            <div className="operation-row" key={operation.operation_key}>
              <div>
                <div className="operation-row__title">{operation.file_name || operation.file_path}</div>
                <div className="operation-row__meta">{operation.operation_type || "unknown"}</div>
                {devMode ? (
                  <div className="operation-row__debug">
                    retries: {operation.retry_count ?? 0} · failure: {operation.failure_classification || "none"}
                  </div>
                ) : null}
              </div>
              <span className={`pill pill--${statusTone(operation.status)}`}>{operation.status}</span>
            </div>
          ))}
        </div>

        <div className="button-row button-row--split">
          <button className="btn btn--primary" type="button" onClick={() => startTask("ai")} disabled={runIsActive}>
            Continue Execution
          </button>
          <button className="btn" type="button" onClick={() => setShowLogs(current => !current)}>
            {showLogs ? "Hide Logs" : "Show Logs"}
          </button>
        </div>

        {showLogs ? (
          <section className="log-panel">
            <div className="panel-title">Logs</div>
            <pre className="log-panel__content">{logs.join("\n") || "No logs yet."}</pre>
          </section>
        ) : null}
      </section>
    );
  }

  function renderArtifactReviewScreen() {
    const currentOperation = dashboard?.current_operation;

    return (
      <section className="screen-card">
        <div className="screen-card__eyebrow">Screen 6</div>
        <h2>Review verified artifact</h2>
        <p className="screen-card__lead">
          Gate 3 is blocking commit. Approve the verified artifact before it enters accepted state.
        </p>

        {currentOperation ? (
          <article className="info-card">
            <div className="info-card__label">Current operation</div>
            <div className="info-card__value">{currentOperation.file_path || "Unknown file"}</div>
            <p className="info-card__body">{currentOperation.operation_type || "unknown"} · {currentOperation.feature || "No feature recorded"}</p>
          </article>
        ) : null}

        <div className="button-row">
          <button className="btn btn--primary" type="button" onClick={() => approveGate("gate3")} disabled={runIsActive}>
            Approve Gate 3
          </button>
          <button className="btn" type="button" onClick={reloadCurrentArtifact} disabled={runIsActive}>
            Reload
          </button>
        </div>

        <PlainTextArtifact artifact={currentArtifact} emptyMessage="COMMIT_CONFIRMATION.md is not available yet." />
      </section>
    );
  }

  function renderCompleteScreen() {
    return (
      <section className="screen-card">
        <div className="screen-card__eyebrow">Screen 7</div>
        <h2>Run complete</h2>
        <p className="screen-card__lead">Execution finished for the current plan.</p>

        <MetricSummary runState={dashboard} />

        <div className="button-row">
          <button className="btn" type="button" onClick={() => startTask("metrics_report")} disabled={runIsActive}>
            Render Metrics
          </button>
          <button className="btn" type="button" onClick={() => refreshDashboard()} disabled={runIsActive}>
            Reload Status
          </button>
        </div>
      </section>
    );
  }

  function renderMainScreen() {
    if (loading && !dashboard) {
      return (
        <section className="screen-card">
          <div className="empty-state">Loading console state...</div>
        </section>
      );
    }

    if (currentScreen === "init") return renderInitScreen();
    if (currentScreen === "intake") return renderIntakeScreen();
    if (currentScreen === "intent_review") return renderIntentReviewScreen();
    if (currentScreen === "plan_review") return renderPlanReviewScreen();
    if (currentScreen === "artifact_review") return renderArtifactReviewScreen();
    if (currentScreen === "complete") return renderCompleteScreen();
    return renderExecutionScreen();
  }

  function renderDevSidebar() {
    if (!dashboard) return null;

    const gateEntries = [
      { key: "gate1", label: "Gate 1", data: dashboard.gates?.gate1 },
      { key: "gate2", label: "Gate 2", data: dashboard.gates?.gate2 },
      { key: "gate3", label: "Gate 3", data: dashboard.gates?.gate3 },
    ];

    return (
      <aside className="dev-sidebar">
        <div className="panel-title">Dev sidebar</div>

        <div className="dev-phase-card">
          <div className="dev-phase-card__label">Current phase</div>
          <div className="dev-phase-card__value">{dashboard.phase?.title || "Unknown"}</div>
          <div className="dev-phase-card__body">{dashboard.phase?.description || ""}</div>
        </div>

        <div className="dev-section">
          <div className="dev-section__title">Gates</div>
          {gateEntries.map(entry => (
            <button
              key={entry.key}
              className="dev-artifact-link"
              type="button"
              onClick={() => setDevArtifactId(entry.data?.artifact || "")}
            >
              <span>{entry.label}</span>
              <span className={`pill pill--${statusTone(entry.data?.approval_status)}`}>
                {entry.data?.approval_status || "missing"}
              </span>
              <span className="dev-artifact-link__meta">{formatTimestamp(entry.data?.meta?.mtime_ms)}</span>
            </button>
          ))}
        </div>

        <div className="dev-section">
          <div className="dev-section__title">Artifacts</div>
          {DEV_ARTIFACT_ITEMS.map(item => (
            <button
              key={item.id}
              className={`dev-artifact-link${devArtifactId === item.id ? " dev-artifact-link--active" : ""}`}
              type="button"
              onClick={() => setDevArtifactId(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </aside>
    );
  }

  function renderDevPanel() {
    const parsedMetrics = tryParseJson(metricsArtifact?.content || "");

    return (
      <aside className="dev-panel">
        <section className="dev-panel__section">
          <div className="panel-title">Live logs</div>
          <pre className="log-panel__content">{logs.join("\n") || "No logs yet."}</pre>
        </section>

        <section className="dev-panel__section">
          <div className="panel-title">Raw artifact</div>
          {artifactErrors[devArtifactId] ? (
            <div className="feedback feedback--error">{artifactErrors[devArtifactId]}</div>
          ) : (
            <PlainTextArtifact artifact={devArtifact} emptyMessage="Select an artifact to inspect." />
          )}
        </section>

        {!runIsActive ? (
          <section className="dev-panel__section">
            <div className="panel-title">Run metrics</div>
            {parsedMetrics ? (
              <pre className="artifact-panel__content">{JSON.stringify(parsedMetrics, null, 2)}</pre>
            ) : (
              <div className="empty-state">No run metrics artifact yet.</div>
            )}
          </section>
        ) : null}
      </aside>
    );
  }

  return (
    <div className={`console-shell${devMode ? " console-shell--dev" : ""}`}>
      {renderHeader()}

      {globalError ? <div className="feedback feedback--error feedback--banner">{globalError}</div> : null}

      <div className={`console-layout${devMode ? " console-layout--dev" : ""}`}>
        {devMode ? renderDevSidebar() : null}
        <main>{renderMainScreen()}</main>
        {devMode ? renderDevPanel() : null}
      </div>
    </div>
  );
}
