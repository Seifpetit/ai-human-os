import React, { useState } from "react";
import { apiPost } from "./api.js";

const MAX_RAW_INTENT_LENGTH = 120;
const STOPWORDS = new Set([
  "the",
  "this",
  "that",
  "with",
  "from",
  "into",
  "what",
  "which",
  "when",
  "where",
  "who",
  "how",
  "your",
  "does",
  "should",
  "would",
  "could",
  "will",
  "have",
  "about",
  "there",
  "their",
  "them",
  "then",
  "than",
  "else",
  "something",
  "system",
  "player",
  "input",
  "core",
  "mechanics",
]);

const EMPTY_BUILD_SPEC = {
  modules: [],
  dependencies: [],
  build_order: [],
  contracts: [],
  file_plan: [],
  narrative: "",
  flow: [],
  assumptions: [],
  start_prompt: "",
};

function normalizeInput(value) {
  return String(value || "").trim();
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeGraph(input, intent) {
  if (input && !input.domains) {
    return {
      intent: intent || "",
      domains: input,
    };
  }

  return input;
}

function getDomains(decisionGraph, interrogationPlan) {
  if (isPlainObject(interrogationPlan) && Object.keys(interrogationPlan).length > 0) {
    return Object.keys(interrogationPlan);
  }

  if (isPlainObject(decisionGraph?.domains)) {
    return Object.keys(decisionGraph.domains);
  }

  return [];
}

function getQuestionsForDomain(interrogationPlan, domain) {
  const questions = interrogationPlan?.[domain];
  return Array.isArray(questions) ? questions : [];
}

function findFirstQuestionPosition(interrogationPlan, domains) {
  for (let domainIndex = 0; domainIndex < domains.length; domainIndex += 1) {
    if (getQuestionsForDomain(interrogationPlan, domains[domainIndex]).length > 0) {
      return {
        domainIndex,
        questionIndex: 0,
      };
    }
  }

  return null;
}

function getCurrentQuestion(interrogationPlan, domains, domainIndex, questionIndex) {
  const domain = domains[domainIndex];
  if (!domain) {
    return null;
  }

  return getQuestionsForDomain(interrogationPlan, domain)[questionIndex] || null;
}

function getNextQuestionPosition(interrogationPlan, domains, domainIndex, questionIndex) {
  const currentDomain = domains[domainIndex];
  const currentQuestions = getQuestionsForDomain(interrogationPlan, currentDomain);

  if (questionIndex + 1 < currentQuestions.length) {
    return {
      domainIndex,
      questionIndex: questionIndex + 1,
    };
  }

  for (let nextDomainIndex = domainIndex + 1; nextDomainIndex < domains.length; nextDomainIndex += 1) {
    if (getQuestionsForDomain(interrogationPlan, domains[nextDomainIndex]).length > 0) {
      return {
        domainIndex: nextDomainIndex,
        questionIndex: 0,
      };
    }
  }

  return null;
}

function getNextDomainPosition(interrogationPlan, domains, domainIndex) {
  for (let nextDomainIndex = domainIndex + 1; nextDomainIndex < domains.length; nextDomainIndex += 1) {
    if (getQuestionsForDomain(interrogationPlan, domains[nextDomainIndex]).length > 0) {
      return {
        domainIndex: nextDomainIndex,
        questionIndex: 0,
      };
    }
  }

  return null;
}

function extractKeywords(question) {
  return String(question || "")
    .toLowerCase()
    .match(/[a-z0-9_]+/g)
    ?.filter(word => word.length > 3 && !STOPWORDS.has(word)) || [];
}

function classifyAnswer(answer, question) {
  const normalizedAnswer = normalizeInput(answer);

  if (normalizedAnswer.length < 3) {
    return "VAGUE";
  }

  const keywords = extractKeywords(question);
  if (keywords.length > 0) {
    const answerLower = normalizedAnswer.toLowerCase();
    const hasKeyword = keywords.some(keyword => answerLower.includes(keyword));

    if (!hasKeyword) {
      return "PARTIAL";
    }
  }

  return "PRECISE";
}

function resolveGraphFieldName(field) {
  return String(field || "")
    .trim()
    .replace(/^decision_graph\.domains\./, "")
    .replace(/^domains\./, "")
    .replace(/^decision_graph\./, "");
}

function updateDecisionGraphValue(decisionGraph, field, value) {
  const graph = isPlainObject(decisionGraph) ? decisionGraph : {};
  const normalizedField = resolveGraphFieldName(field);

  if (isPlainObject(graph.domains) && Object.prototype.hasOwnProperty.call(graph.domains, normalizedField)) {
    return {
      ...graph,
      domains: {
        ...graph.domains,
        [normalizedField]: value,
      },
    };
  }

  if (Object.prototype.hasOwnProperty.call(graph, normalizedField)) {
    return {
      ...graph,
      [normalizedField]: value,
    };
  }

  return graph;
}

function getDomainKeys(decisionGraph) {
  return Object.keys(decisionGraph?.domains || {});
}

function logFlagWriteTrace(decisionGraph, flag, nextValue) {
  const rawField = String(flag?.field || "");
  const normalizedField = resolveGraphFieldName(rawField);
  const domainKeys = getDomainKeys(decisionGraph);
  const matchesDomain = domainKeys.includes(normalizedField);

  console.log("[L1.9 FLAG APPLY]", {
    field: rawField,
    normalized_field: normalizedField,
    recommended_answer: flag?.recommended_answer,
    next_value: nextValue,
    matches_domain: matchesDomain,
    domain_keys: domainKeys,
  });
}

function buildFlagEdits(flags) {
  const edits = {};

  for (const flag of flags) {
    edits[flag.field] = flag.recommended_answer || "";
  }

  return edits;
}

function formatTitle(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, char => char.toUpperCase());
}

async function loadTemplate(name) {
  const res = await fetch(`/product-prompts/${name}`);
  if (!res.ok) {
    throw new Error(`Failed to load template: ${name}`);
  }

  return await res.text();
}

function fillTemplate(template, data) {
  let result = template;

  Object.keys(data).forEach(key => {
    const value = Array.isArray(data[key])
      ? data[key].join(", ")
      : String(data[key] || "");

    result = result.replaceAll(`{{${key}}}`, value);
  });

  return result;
}

function compileL2(decisionGraph) {
  const domains = decisionGraph?.domains || {};

  function hasValue(value) {
    if (value === null || value === undefined) return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "string") return value.trim().length > 0;
    if (typeof value === "object") return Object.keys(value).length > 0;
    return true;
  }

  function addModule(modules, name, responsibility, inferred, reason) {
    if (!modules.find(module => module.name === name)) {
      modules.push({
        name,
        responsibility,
        depends_on: [],
        inferred: Boolean(inferred),
        reason: inferred ? reason : null,
      });
    }
  }

  const domainTable = {
    input: {
      name: "InputHandler",
      responsibility: "handle user input",
    },
    trigger: {
      name: "EventDispatcher",
      responsibility: "emit and route events",
    },
    loop: {
      name: "LoopEngine",
      responsibility: "drive repeated execution",
    },
    state: {
      name: "StateStore",
      responsibility: "store and update system state",
    },
    data: {
      name: "DataManager",
      responsibility: "load and persist data",
    },
    mechanics: {
      name: "LogicEngine",
      responsibility: "apply core logic rules",
    },
    flow: {
      name: "WorkflowEngine",
      responsibility: "orchestrate step sequence",
    },
    render: {
      name: "Renderer",
      responsibility: "produce output",
    },
    network: {
      name: "NetworkClient",
      responsibility: "handle external communication",
    },
    config: {
      name: "ConfigManager",
      responsibility: "provide configuration",
    },
  };

  const modules = [];
  const d = domains;

  Object.keys(domainTable).forEach(key => {
    if (hasValue(domains[key])) {
      const def = domainTable[key];
      addModule(modules, def.name, def.responsibility, false, null);
    }
  });

  if (hasValue(d.mechanics) && !hasValue(d.render)) {
    addModule(
      modules,
      "Renderer",
      "produce output",
      true,
      "System has mechanics -> requires visible output"
    );
  }

  if (hasValue(d.mechanics) && hasValue(d.state) && !hasValue(d.loop)) {
    addModule(
      modules,
      "LoopEngine",
      "drive repeated execution",
      true,
      "State + mechanics -> requires continuous update loop"
    );
  }

  if (hasValue(d.mechanics) && !hasValue(d.state)) {
    addModule(
      modules,
      "StateStore",
      "store and update system state",
      true,
      "Logic requires persistent state"
    );
  }

  if ((hasValue(d.player) || hasValue(d.actor)) && !hasValue(d.input)) {
    addModule(
      modules,
      "InputHandler",
      "handle user input",
      true,
      "User interaction requires input handling"
    );
  }

  if ((hasValue(d.state) || hasValue(d.input)) && !hasValue(d.mechanics)) {
    addModule(
      modules,
      "LogicEngine",
      "apply core logic rules",
      true,
      "State/input requires processing logic"
    );
  }

  modules.forEach(module => {
    if (module.name === "LogicEngine") {
      module.depends_on = ["InputHandler", "StateStore"].filter(name =>
        modules.find(entry => entry.name === name)
      );
    }

    if (module.name === "Renderer") {
      module.depends_on = ["StateStore"].filter(name =>
        modules.find(entry => entry.name === name)
      );
    }

    if (module.name === "LoopEngine") {
      module.depends_on = ["LogicEngine", "Renderer"].filter(name =>
        modules.find(entry => entry.name === name)
      );
    }
  });

  const buildOrder = modules.map(module => module.name);
  console.log("[L2 FINAL MODULES]", modules);

  return {
    status: "PLANNED",
    implementation_plan: {
      modules,
      flows: [],
      data_models: [],
      interfaces: [],
      build_order: buildOrder,
    },
  };
}

function compileL3(plan, decisionGraph, templates) {
  if (!plan) {
    return null;
  }

  function text(value, fallback) {
    if (!value) return fallback;
    if (Array.isArray(value)) return value.join(", ");
    return String(value);
  }

  function buildNarrative(domains, modules) {
    const input = text(domains.input, "no explicit input");
    const mechanics = text(domains.mechanics, "no defined logic");
    const state = text(domains.state, "no persistent state");
    const render = text(domains.render, "produce output");
    const hasLoop = Boolean(domains.loop) || modules.some(module => module.name === "LoopEngine");
    const loop = hasLoop
      ? "The system runs continuously in a loop."
      : "The system runs on demand.";

    return [
      `This system processes ${input}.`,
      `It applies ${mechanics} to update ${state}.`,
      loop,
      `It produces ${render}.`,
    ].join("\n");
  }

  function buildFlow(modules) {
    const order = ["InputHandler", "LogicEngine", "StateStore", "Renderer"];
    const present = order.filter(name =>
      modules.find(module => module.name === name)
    );

    if (modules.find(module => module.name === "LoopEngine")) {
      return [`LoopEngine -> ${present.join(" -> ")}`];
    }

    return [present.join(" -> ")];
  }

  function buildAssumptions(domains) {
    const assumptions = [];

    if (domains.player) assumptions.push("Single-user interaction");
    if (domains.loop) assumptions.push("Real-time continuous execution");
    if (domains.state) assumptions.push("System maintains internal state");

    if (assumptions.length === 0) {
      assumptions.push("Minimal system with no persistent state");
    }

    return assumptions;
  }

  function buildStartPrompt(modules, flow) {
    const names = modules.map(module => module.name).join(", ");

    return [
      "You are implementing a system with the following modules:",
      "",
      names,
      "",
      "Execution flow:",
      flow.join("\n"),
      "",
      "Start by implementing the first module only.",
      "",
      "Constraints:",
      "- follow modular structure",
      "- do not implement other modules",
      "- keep implementation simple",
      "",
      "Output:",
      "Return only the code.",
    ].join("\n");
  }

  const domains = decisionGraph?.domains || {};
  const moduleTemplate = templates?.moduleTemplate || "";
  const modules = (plan.modules || []).map(module => ({
    name: module.name || module.id,
    responsibility: module.responsibility || module.role || "",
    depends_on: module.depends_on || [],
    inferred: Boolean(module.inferred),
    reason: module.reason || null,
  }));
  const allModuleNames = modules.map(module => module.name);
  const modulesWithPrompts = modules.map(module => ({
    ...module,
    prompt: fillTemplate(moduleTemplate, {
      name: module.name,
      responsibility: module.responsibility,
      inputs: "",
      outputs: "",
      all_modules: allModuleNames.join(", "),
    }),
  }));

  const dependencies = [];
  modulesWithPrompts.forEach(module => {
    (module.depends_on || []).forEach(dep => {
      dependencies.push({ from: module.name, to: dep });
    });
  });

  const buildOrder = Array.isArray(plan.build_order) && plan.build_order.length > 0
    ? plan.build_order
    : modulesWithPrompts.map(module => module.name);
  const contracts = modulesWithPrompts.map(module => ({
    module: module.name,
    inputs: [],
    outputs: [],
    methods: ["init", "run"],
  }));
  const filePlan = modulesWithPrompts.map(module => ({
    path: `src/${module.name}.js`,
    module: module.name,
  }));
  const narrative = buildNarrative(domains, modulesWithPrompts);
  const flow = buildFlow(modulesWithPrompts);
  const assumptions = buildAssumptions(domains);
  const startPrompt = buildStartPrompt(modulesWithPrompts, flow);

  console.log("[L3 NARRATIVE]", narrative);
  console.log("[L3 FLOW]", flow);
  console.log("[L3 ASSUMPTIONS]", assumptions);

  return {
    status: "READY_TO_BUILD",
    build_spec: {
      modules: modulesWithPrompts,
      dependencies,
      build_order: buildOrder,
      contracts,
      file_plan: filePlan,
      narrative,
      flow,
      assumptions,
      start_prompt: startPrompt,
    },
  };
}

function Section({ title, children }) {
  return (
    <section className="screen-card" style={{ marginTop: 18 }}>
      <div className="screen-card__eyebrow">{title}</div>
      {children}
    </section>
  );
}

export default function ConsoleApp() {
  const [screen, setScreen] = useState("L0");
  const [rawIntent, setRawIntent] = useState("");
  const [decisionGraph, setDecisionGraph] = useState(null);
  const [interrogationPlan, setInterrogationPlan] = useState({});
  const [interrogationTrace, setInterrogationTrace] = useState([]);
  const [currentDomainIndex, setCurrentDomainIndex] = useState(0);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [verificationStatus, setVerificationStatus] = useState("IDLE");
  const [verificationFlags, setVerificationFlags] = useState([]);
  const [flagEdits, setFlagEdits] = useState({});
  const [inputValue, setInputValue] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [l3Result, setL3Result] = useState(null);
  const [startPromptCopied, setStartPromptCopied] = useState(false);

  const normalizedInput = normalizeInput(inputValue);
  const domains = getDomains(decisionGraph, interrogationPlan);
  const currentDomain = domains[currentDomainIndex] || "";
  const currentQuestion = getCurrentQuestion(interrogationPlan, domains, currentDomainIndex, currentQuestionIndex);
  const isL0Disabled = submitting || !normalizedInput || inputValue.length > MAX_RAW_INTENT_LENGTH;
  const isL1Disabled = submitting || !normalizedInput || !currentQuestion;
  const buildSpec = l3Result?.build_spec || EMPTY_BUILD_SPEC;
  const isL0 = screen === "L0";
  const isL1 = screen === "L1";
  const isL19 = screen === "L19";
  const isL3Result = screen === "L3_RESULT";
  const verificationIncomplete = verificationStatus === "INCOMPLETE";

  function resetToL0() {
    setScreen("L0");
    setRawIntent("");
    setDecisionGraph(null);
    setInterrogationPlan({});
    setInterrogationTrace([]);
    setCurrentDomainIndex(0);
    setCurrentQuestionIndex(0);
    setVerificationStatus("IDLE");
    setVerificationFlags([]);
    setFlagEdits({});
    setInputValue("");
    setError("");
    setSubmitting(false);
    setL3Result(null);
    setStartPromptCopied(false);
  }

  async function showL3Result(planResult, graphInput) {
    const moduleTemplate = await loadTemplate("module.template.txt");
    const l3Compiled = compileL3(planResult?.implementation_plan, graphInput, {
      moduleTemplate,
    });

    setL3Result(l3Compiled);
    setStartPromptCopied(false);
    setScreen("L3_RESULT");
    console.log("[L3 BUILD SPEC]", l3Compiled?.build_spec);
  }

  async function compileToScreen4(nextGraph) {
    const safeGraph = normalizeGraph(nextGraph, rawIntent);
    console.log("[L1.5 VERIFIED]", safeGraph);
    console.log("[L2 RAW DOMAINS]", safeGraph?.domains);

    const l2Result = compileL2(safeGraph);
    console.log("[L2 PLAN]", l2Result?.implementation_plan);

    await showL3Result(l2Result, safeGraph);
  }

  async function runVerification(nextGraph, nextTrace) {
    setScreen("L19");
    setSubmitting(true);
    setError("");
    setVerificationStatus("LOADING");
    setVerificationFlags([]);
    setFlagEdits({});
    setL3Result(null);

    try {
      const res = await apiPost("/l1/verify", {
        raw_intent: rawIntent || nextGraph?.intent || "",
        decision_graph: nextGraph,
        interrogation_trace: nextTrace,
      });

      const status = res?.status || "COMPLETE";
      const nextFlags = Array.isArray(res?.flags) ? res.flags : [];
      const validatedGraph = res?.validated_graph || nextGraph;
      const safeValidatedGraph = normalizeGraph(validatedGraph, rawIntent);

      setDecisionGraph(safeValidatedGraph);
      setVerificationStatus(status);
      setVerificationFlags(nextFlags);
      setFlagEdits(buildFlagEdits(nextFlags));
      console.log("[L1.9 FLAGS]", nextFlags);
      console.log("[L1.9 DOMAIN KEYS]", getDomainKeys(safeValidatedGraph));

      if (status === "COMPLETE") {
        await compileToScreen4(safeValidatedGraph);
      }
    } catch (requestError) {
      setError(requestError.message || String(requestError));
      setVerificationStatus("ERROR");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmit() {
    if (isL0Disabled) {
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const res = await apiPost("/l0/init", {
        raw_intent: inputValue,
      });

      const nextGraph = res?.decision_graph || null;
      const nextPlan = res?.interrogation_plan || {};
      const nextDomains = getDomains(nextGraph, nextPlan);
      const firstPosition = findFirstQuestionPosition(nextPlan, nextDomains);

      console.log("[L0 OUTPUT]", nextGraph);
      console.log("[L1 OUTPUT]", nextPlan);

      setRawIntent(nextGraph?.intent || normalizedInput);
      setDecisionGraph(nextGraph);
      setInterrogationPlan(nextPlan);
      setInterrogationTrace([]);
      setVerificationStatus("IDLE");
      setVerificationFlags([]);
      setFlagEdits({});
      setInputValue("");
      setL3Result(null);
      setStartPromptCopied(false);

      if (!firstPosition) {
        setCurrentDomainIndex(0);
        setCurrentQuestionIndex(0);
        await runVerification(nextGraph, []);
        return;
      }

      setScreen("L1");
      setCurrentDomainIndex(firstPosition.domainIndex);
      setCurrentQuestionIndex(firstPosition.questionIndex);
    } catch (requestError) {
      setError(requestError.message || String(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAnswerSubmit() {
    if (isL1Disabled || !currentQuestion) {
      return;
    }

    const answer = inputValue;
    const classification = classifyAnswer(answer, currentQuestion.question);
    const nextTrace = [
      ...interrogationTrace,
      {
        domain: currentDomain,
        question_id: currentQuestion.id || `${currentDomain}_${currentQuestionIndex + 1}`,
        question: currentQuestion.question,
        answer,
        classification,
      },
    ];
    const nextGraph = classification === "PRECISE"
      ? updateDecisionGraphValue(decisionGraph, currentDomain, answer)
      : decisionGraph;
    const nextPosition = classification === "PRECISE"
      ? getNextDomainPosition(interrogationPlan, domains, currentDomainIndex)
      : getNextQuestionPosition(interrogationPlan, domains, currentDomainIndex, currentQuestionIndex);

    setInterrogationTrace(nextTrace);
    setDecisionGraph(nextGraph);
    setInputValue("");
    setError("");
    console.log("[L1 UPDATE]", nextGraph);

    if (!nextPosition) {
      await runVerification(nextGraph, nextTrace);
      return;
    }

    setCurrentDomainIndex(nextPosition.domainIndex);
    setCurrentQuestionIndex(nextPosition.questionIndex);
  }

  function finalizeFlags(nextGraph, nextFlags) {
    setDecisionGraph(nextGraph);
    setVerificationFlags(nextFlags);

    if (nextFlags.length === 0) {
      setVerificationStatus("COMPLETE");
      void compileToScreen4(nextGraph);
    }
  }

  function handleAcceptFlag(flag) {
    const nextValue = flag.recommended_answer || "";
    logFlagWriteTrace(decisionGraph, flag, nextValue);

    const nextGraph = updateDecisionGraphValue(decisionGraph, flag.field, nextValue);
    const nextFlags = verificationFlags.filter(item => item.field !== flag.field);

    setFlagEdits(prev => ({
      ...prev,
      [flag.field]: nextValue,
    }));
    finalizeFlags(nextGraph, nextFlags);
  }

  function handleEditFlag(flag) {
    const nextValue = flagEdits[flag.field] || "";
    logFlagWriteTrace(decisionGraph, flag, nextValue);

    const nextGraph = updateDecisionGraphValue(decisionGraph, flag.field, nextValue);
    const nextFlags = verificationFlags.filter(item => item.field !== flag.field);

    finalizeFlags(nextGraph, nextFlags);
  }

  function handleAcceptAll() {
    let nextGraph = decisionGraph;

    for (const flag of verificationFlags) {
      const nextValue = flagEdits[flag.field] || flag.recommended_answer || "";
      logFlagWriteTrace(nextGraph, flag, nextValue);
      nextGraph = updateDecisionGraphValue(nextGraph, flag.field, nextValue);
    }

    finalizeFlags(nextGraph, []);
  }

  return (
    <div className="console-shell" style={{ minHeight: "100vh", overflow: "hidden" }}>
      <header className="console-header">
        <div>
          <div className="console-brand">AI-Human OS</div>
          <h1 className="console-title">Clarity Engine</h1>
          <p className="console-summary">
            Capture intent, clarify missing structure, and end on a build blueprint.
          </p>
        </div>
      </header>

      {error ? <div className="feedback feedback--error feedback--banner">{error}</div> : null}

      <div className="console-layout" style={{ alignItems: "center", justifyContent: "center" }}>
        <main style={{ width: "100%", maxWidth: 860 }}>
          {isL3Result ? (
            <section className="screen-card">
              <div className="screen-card__eyebrow">Screen 4</div>
              <h2>Build Blueprint</h2>
              <div
                className="info-card"
                style={{
                  display: "flex",
                  gap: 12,
                  flexWrap: "wrap",
                  marginTop: 14,
                  marginBottom: 8,
                  fontWeight: 600,
                }}
              >
                <div>Modules: {buildSpec.modules.length}</div>
                <div>|</div>
                <div>Dependencies: {buildSpec.dependencies.length}</div>
              </div>

              <Section title="System Overview">
                <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                  {buildSpec.narrative || "No system narrative."}
                </div>
              </Section>

              <Section title="Execution Flow">
                <div style={{ display: "grid", gap: 8 }}>
                  {buildSpec.flow.length === 0 ? <div>No execution flow.</div> : null}
                  {buildSpec.flow.map((flowLine, index) => (
                    <div key={`${flowLine}-${index}`}>{flowLine}</div>
                  ))}
                </div>
              </Section>

              <Section title="Assumptions">
                <div style={{ display: "grid", gap: 6 }}>
                  {buildSpec.assumptions.length === 0 ? <div>No assumptions.</div> : null}
                  {buildSpec.assumptions.map((assumption, index) => (
                    <div key={`${assumption}-${index}`}>- {assumption}</div>
                  ))}
                </div>
              </Section>

              <Section title="Start Building">
                <textarea
                  className="text-input"
                  rows={12}
                  readOnly
                  value={buildSpec.start_prompt || ""}
                  style={{ fontFamily: "monospace", width: "100%" }}
                />
                <div className="button-row" style={{ marginTop: 12 }}>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(buildSpec.start_prompt || "");
                      setStartPromptCopied(true);
                      setTimeout(() => setStartPromptCopied(false), 1000);
                    }}
                  >
                    Copy Start Prompt
                  </button>
                  {startPromptCopied ? <span className="form-hint">Copied</span> : null}
                </div>
              </Section>

              <Section title="Modules">
                <div style={{ display: "grid", gap: 10 }}>
                  {buildSpec.modules.length === 0 ? <div>No modules.</div> : null}
                  {buildSpec.modules.map(module => (
                    <div key={module.name}>
                      <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                        <strong>{formatTitle(module.name)}</strong>
                        {module.inferred ? (
                          <span style={{ fontStyle: "italic", color: "#666" }}>(auto-added)</span>
                        ) : null}
                      </div>
                      <div>
                        {"-> "}
                        <span>{module.responsibility || "module"}</span>
                      </div>
                      {module.inferred && module.reason ? (
                        <div style={{ color: "#666", marginTop: 4 }}>
                          Reason: {module.reason}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </Section>

              <Section title="Dependencies">
                <div style={{ display: "grid", gap: 10 }}>
                  {buildSpec.dependencies.length === 0 ? <div>No dependencies.</div> : null}
                  {buildSpec.dependencies.map((dependency, index) => (
                    <div key={`${dependency.from}-${dependency.to}-${index}`}>
                      {formatTitle(dependency.from)} {"->"} {formatTitle(dependency.to)}
                    </div>
                  ))}
                </div>
              </Section>

              <Section title="Build Checklist">
                <div style={{ display: "grid", gap: 8 }}>
                  {buildSpec.build_order.length === 0 ? <div>No build order.</div> : null}
                  {buildSpec.build_order.map((moduleName, index) => (
                    <label key={`${moduleName}-${index}`} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input type="checkbox" checked={false} readOnly />
                      <span>{formatTitle(moduleName)}</span>
                    </label>
                  ))}
                </div>
              </Section>

              <Section title="Module Prompts">
                <div style={{ display: "grid", gap: 14 }}>
                  {buildSpec.modules.length === 0 ? <div>No module prompts.</div> : null}
                  {buildSpec.modules.map((module, index) => (
                    <div
                      key={`${module.name}-${index}`}
                      style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}
                    >
                      <div>
                        <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                          <div style={{ fontWeight: 600 }}>{formatTitle(module.name)}</div>
                          {module.inferred ? (
                            <span style={{ fontStyle: "italic", color: "#666" }}>(auto-added)</span>
                          ) : null}
                        </div>
                        <div>{module.responsibility || "module"}</div>
                        {module.inferred && module.reason ? (
                          <div style={{ color: "#666", marginTop: 4 }}>
                            Reason: {module.reason}
                          </div>
                        ) : null}
                      </div>
                      <button
                        className="btn"
                        type="button"
                        onClick={() => navigator.clipboard.writeText(module.prompt)}
                      >
                        Copy Prompt
                      </button>
                    </div>
                  ))}
                </div>
              </Section>

              <Section title="Build Order">
                <div style={{ display: "grid", gap: 8 }}>
                  {buildSpec.build_order.length === 0 ? <div>No build order.</div> : null}
                  {buildSpec.build_order.map((moduleName, index) => (
                    <div key={`${moduleName}-ordered-${index}`}>
                      {index + 1}. {formatTitle(moduleName)}
                    </div>
                  ))}
                </div>
              </Section>

              <Section title="Contracts">
                <div style={{ display: "grid", gap: 14 }}>
                  {buildSpec.contracts.length === 0 ? <div>No contracts.</div> : null}
                  {buildSpec.contracts.map(contract => (
                    <div key={contract.module}>
                      <div style={{ fontWeight: 600, marginBottom: 4 }}>{formatTitle(contract.module)}</div>
                      <div>methods: {(contract.methods || []).join(", ")}</div>
                    </div>
                  ))}
                </div>
              </Section>

              <Section title="File Plan">
                <div style={{ display: "grid", gap: 8 }}>
                  {buildSpec.file_plan.length === 0 ? <div>No file plan.</div> : null}
                  {buildSpec.file_plan.map(entry => (
                    <div key={entry.path} style={{ fontFamily: "monospace" }}>
                      {entry.path}
                    </div>
                  ))}
                </div>
              </Section>

              <div className="button-row" style={{ marginTop: 18 }}>
                <button className="btn btn--primary" type="button" onClick={resetToL0}>
                  New Intent
                </button>
              </div>
            </section>
          ) : null}

          {!isL3Result && isL0 ? (
            <section className="screen-card">
              <div className="screen-card__eyebrow">Screen 1</div>
              <h2>Raw Intent</h2>
              <p className="screen-card__lead">
                Describe what you want to build in one or two lines.
              </p>

              <form
                onSubmit={event => {
                  event.preventDefault();
                  void handleSubmit();
                }}
              >
                <div className="form-block">
                  <label className="field-label" htmlFor="raw-intent-input">
                    Raw intent
                  </label>
                  <textarea
                    id="raw-intent-input"
                    className="text-input"
                    rows={3}
                    maxLength={MAX_RAW_INTENT_LENGTH}
                    value={inputValue}
                    placeholder="Describe what you want to build (1-2 lines)"
                    onChange={event => {
                      setInputValue(event.target.value.slice(0, MAX_RAW_INTENT_LENGTH));
                      setError("");
                    }}
                  />
                  <p className="form-hint">{inputValue.length} / {MAX_RAW_INTENT_LENGTH} characters</p>
                </div>

                <div className="button-row">
                  <button className="btn btn--primary" type="submit" disabled={isL0Disabled}>
                    {submitting ? "Continuing..." : "Continue"}
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          {!isL3Result && isL1 ? (
            <section className="screen-card">
              <div className="screen-card__eyebrow">Screen 2</div>
              <h2>Interrogation</h2>
              <p className="screen-card__lead">
                Answer one question at a time. The graph only updates when the answer is specific enough.
              </p>

              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
                {domains.map((domain, index) => {
                  const filled = Boolean(decisionGraph?.domains?.[domain] || decisionGraph?.[domain]);
                  const active = index === currentDomainIndex;

                  return (
                    <div
                      key={domain}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 999,
                        border: active ? "1px solid #111" : "1px solid #d0d0d0",
                        background: active ? "#111" : filled ? "#eef6ee" : "#f7f7f7",
                        color: active ? "#fff" : "#111",
                        fontSize: 12,
                        textTransform: "capitalize",
                      }}
                    >
                      {domain}
                    </div>
                  );
                })}
              </div>

              <article className="info-card" style={{ padding: 20, marginBottom: 16, textAlign: "center" }}>
                <div className="info-card__label">{currentDomain || "domain"}</div>
                <div style={{ fontSize: 20, lineHeight: 1.4 }}>
                  {currentQuestion?.question || "No question available."}
                </div>
              </article>

              <form
                onSubmit={event => {
                  event.preventDefault();
                  void handleAnswerSubmit();
                }}
              >
                <div className="form-block">
                  <label className="field-label" htmlFor="answer-input">
                    Your answer
                  </label>
                  <input
                    id="answer-input"
                    className="text-input"
                    type="text"
                    value={inputValue}
                    onChange={event => {
                      setInputValue(event.target.value);
                      setError("");
                    }}
                  />
                </div>

                <div className="button-row" style={{ justifyContent: "center" }}>
                  <button className="btn btn--primary" type="submit" disabled={isL1Disabled}>
                    Continue
                  </button>
                </div>
              </form>
            </section>
          ) : null}

          {!isL3Result && isL19 ? (
            <section className="screen-card">
              <div className="screen-card__eyebrow">Screen 3</div>
              <h2>Verification</h2>

              {verificationStatus === "LOADING" ? (
                <p className="screen-card__lead">Verifying decision graph...</p>
              ) : null}

              {verificationStatus === "COMPLETE" ? (
                <p className="screen-card__lead">Compiling build blueprint...</p>
              ) : null}

              {verificationIncomplete ? (
                <>
                  <p className="screen-card__lead">
                    Verification found gaps. Review the flagged fields below.
                  </p>

                  <div className="button-row" style={{ marginBottom: 12 }}>
                    <button
                      className="btn btn--primary"
                      type="button"
                      onClick={handleAcceptAll}
                      disabled={verificationFlags.length === 0}
                    >
                      Accept All
                    </button>
                  </div>

                  <div style={{ display: "grid", gap: 12 }}>
                    {verificationFlags.map(flag => (
                      <article key={`${flag.field}-${flag.question}`} className="info-card" style={{ padding: 16 }}>
                        <div className="info-card__label">{flag.field}</div>
                        <div style={{ marginBottom: 8 }}><strong>Reason:</strong> {flag.reason}</div>
                        <div style={{ marginBottom: 8 }}><strong>Question:</strong> {flag.question}</div>
                        <div style={{ marginBottom: 8 }}><strong>Recommended:</strong> {flag.recommended_answer}</div>

                        <input
                          className="text-input"
                          type="text"
                          value={flagEdits[flag.field] || ""}
                          onChange={event => {
                            setFlagEdits(prev => ({
                              ...prev,
                              [flag.field]: event.target.value,
                            }));
                          }}
                        />

                        <div className="button-row" style={{ marginTop: 10 }}>
                          <button
                            className="btn btn--primary"
                            type="button"
                            onClick={() => handleAcceptFlag(flag)}
                          >
                            Accept
                          </button>
                          <button
                            className="btn"
                            type="button"
                            onClick={() => handleEditFlag(flag)}
                          >
                            Edit
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </>
              ) : null}

              {verificationStatus === "ERROR" ? (
                <p className="screen-card__lead">Verification could not be completed.</p>
              ) : null}
            </section>
          ) : null}
        </main>
      </div>
    </div>
  );
}
