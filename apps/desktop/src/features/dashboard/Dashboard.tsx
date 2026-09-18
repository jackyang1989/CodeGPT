import { useState } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import type { DesktopState } from "../../models/topology";
import { useLocale } from "../../i18n/locale";
import {
  projectReadinessLabel,
  readinessNextAction,
  runtimeLabel,
  readinessSummary,
  runnerReadinessLabel,
  serverReadinessLabel,
} from "../../i18n/presentation";

interface DashboardProps {
  state: DesktopState;
  refreshing: boolean;
  onRefresh: () => void;
  onResumeRuntime: () => void;
  onConnectChatGpt: () => void;
  onChooseProject: () => void;
  onChangeSetup: () => void;
  onNavigate: (page: "projects" | "connection" | "activity") => void;
  onStopQuickShare: () => void;
  onStopRuntime: () => void;
}

export function Dashboard({
  state,
  refreshing,
  onRefresh,
  onResumeRuntime,
  onConnectChatGpt,
  onChooseProject,
  onChangeSetup,
  onNavigate,
  onStopQuickShare,
  onStopRuntime,
}: DashboardProps) {
  const { t } = useLocale();
  const isQuickShare = state.topology?.experience === "quick_share";
  const operationBusy = Boolean(state.current_operation);
  const connectionVerified = chatgptActivityObserved(state) && state.regular_tunnel?.status !== "error";
  const canResumeRuntime = !isQuickShare && Boolean(state.topology) && !state.readiness.runtime_ready;
  const canConnectChatGpt = !isQuickShare &&
    state.topology?.server.kind === "local" &&
    state.readiness.runtime_ready &&
    state.openai_tunnel_configured &&
    !state.regular_tunnel;
  const summary = state.readiness.runtime_ready ? readinessSummary(state.readiness.summary_kind, state.readiness.summary, t) : runtimeLabel(state, t);
  const nextAction = readinessNextAction(
    state.readiness.next_action_kind,
    state.readiness.next_action,
    t,
  );

  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null);

  const handleCopyPrompt = async (text: string) => {
    try {
      await writeText(text);
      setCopiedPrompt(text);
    } catch {
      try {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(text);
          setCopiedPrompt(text);
        }
      } catch {
        // best-effort
      }
    }
    window.setTimeout(() => {
      setCopiedPrompt((prev) => (prev === text ? null : prev));
    }, 2000);
  };

  const projectName = state.project?.path.split(/[\\/]/).filter(Boolean).pop() ?? null;
  const projects = state.projects ?? [];
  const enabledProjectsCount = projects.filter((p) => !p.disabled).length;
  const hasMultipleProjects = enabledProjectsCount > 1;

  const targetPrompt = projectName
    ? t("workspace.verifyPromptTemplate", { project: projectName })
    : t("workspace.verifyPromptTemplate", { project: "MyProject" });
  const listPrompt = t("workspace.verifyListPromptTemplate");
  return (
    <section
      className="page-section dashboard-page"
      aria-labelledby="home-title"
      aria-busy={refreshing}
      data-codegpt-page="home"
    >
      <div className="page-heading-row">
        <div>
          <h1 id="home-title">CodeGPT</h1>
          <p className="lede">{t("workspace.description")}</p>
        </div>
        <button
          className="secondary-button"
          onClick={onRefresh}
          disabled={refreshing || operationBusy}
          data-codegpt-action="refresh-runtime"
        >
          {refreshing ? t("home.checking") : t("home.refresh")}
        </button>
      </div>

      <div
        className={`readiness-banner ${state.readiness.ready_for_chatgpt || connectionVerified ? "ready" : "pending"}`}
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <div className="readiness-info">
          <span className="section-kicker">{t("home.overall")}</span>
          <strong>
            {connectionVerified
              ? t("home.connectionObservedLabel")
              : state.readiness.ready_for_chatgpt
                ? t("home.readyToUse")
                : summary}
          </strong>
          {connectionVerified ? (
            <p className="readiness-hint">{t("home.connectionObserved")}</p>
          ) : (
            nextAction && !canResumeRuntime && !canConnectChatGpt && (
              <p className="readiness-hint">{nextAction}</p>
            )
          )}
        </div>
        <div className="readiness-actions">
          {canResumeRuntime && (
            <button className="primary-button" onClick={onResumeRuntime} disabled={operationBusy || refreshing} data-codegpt-action="resume-runtime">
              {t("home.resumeRuntime")}
            </button>
          )}
          {canConnectChatGpt && (
            <button className="primary-button" onClick={onConnectChatGpt} disabled={operationBusy} data-codegpt-action="connect-chatgpt">
              {t("home.connectChatGpt")}
            </button>
          )}
          {state.readiness.runtime_ready && !canConnectChatGpt && !connectionVerified && (
            <button className="primary-button" onClick={() => onNavigate("connection")}>{t("workspace.connectionSettings")}</button>
          )}
        </div>
      </div>

      <article className="workspace-project">
        <div className="project-emblem" aria-hidden="true">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" width="22" height="22">
            <path d="M3 5a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5z" />
          </svg>
        </div>
        <div className="workspace-project-copy">
          <span className="section-kicker">{t("workspace.currentProject")}</span>
          <h2>{state.project?.path.split(/[\\/]/).filter(Boolean).pop() ?? t("home.noProject")}</h2>
          <p>{state.project?.path ?? t("setup.projectRequired")}</p>
        </div>
        <button className="secondary-button" onClick={onChooseProject} disabled={operationBusy || refreshing}>
          {state.project ? t("project.change") : t("project.add")}
        </button>
      </article>

      {state.quick_share && (
        <div className="handoff-card">
          <div>
            <span className="section-kicker">{t("home.quickShareHandoff")}</span>
            <strong>{state.quick_share.ready_for_chatgpt ? t("home.handoffReady") : t("home.handoffAction")}</strong>
            {state.quick_share.mcp_url && <code>{state.quick_share.mcp_url}</code>}
            <span>{quickShareClipboardLabel(state.quick_share.clipboard_state, state.quick_share.clipboard_contains, t)}</span>
          </div>
          <button className="danger-button" onClick={onStopQuickShare} disabled={operationBusy} data-codegpt-action="stop-quick-share">{t("home.stopShare")}</button>
        </div>
      )}

      {!isQuickShare && (
        <details className="workflow-guide" open={!connectionVerified}>
          <summary>{t("workspace.progress")}</summary>
          <ol className="workflow-steps" aria-label={t("workspace.progress")}>
            <li className={state.readiness.runtime_ready ? "complete" : ""}>
              <span className="step-number" aria-hidden="true">01</span>
              <strong>{t("workspace.prepare")}</strong>
              <p>{state.readiness.runtime_ready ? t("sidebar.runtimeReady") : t("workspace.prepareHint")}</p>
            </li>
            <li className={state.readiness.runtime_ready && (state.readiness.ready_for_chatgpt || state.regular_tunnel?.ready_for_chatgpt) ? "complete" : ""}>
              <span className="step-number" aria-hidden="true">02</span>
              <strong>{t("workspace.connect")}</strong>
              <p>{connectionExplanation(state, t)}</p>
            </li>
            <li className={connectionVerified ? "complete" : ""}>
              <span className="step-number" aria-hidden="true">03</span>
              <strong>{t("workspace.verify")}</strong>
              {!state.readiness.runtime_ready ? (
                <p>{t("workspace.afterStart")}</p>
              ) : connectionVerified ? (
                <p>{t("home.connectionObserved")}</p>
              ) : (
                <div className="verify-step-content">
                  <p className="verify-guide-text">
                    {projectName
                      ? t("workspace.verifyPromptGuide")
                      : t("workspace.verifyPromptGuideGeneric")}
                  </p>
                  <div className="verify-prompt-chip">
                    <span className="chip-prompt-text" title={targetPrompt}>
                      "{targetPrompt}"
                    </span>
                    <button
                      type="button"
                      className="prompt-copy-btn"
                      onClick={() => void handleCopyPrompt(targetPrompt)}
                      title={t("workspace.copyPrompt")}
                    >
                      {copiedPrompt === targetPrompt ? (
                        <span className="copied-indicator">✓ {t("workspace.promptCopied")}</span>
                      ) : (
                        <span>{t("workspace.copyPrompt")}</span>
                      )}
                    </button>
                  </div>
                  {hasMultipleProjects && (
                    <div className="verify-multi-hint">
                      <span>{t("workspace.verifyMultiHint")}</span>
                      <button
                        type="button"
                        className="text-copy-link"
                        onClick={() => void handleCopyPrompt(listPrompt)}
                        title={listPrompt}
                      >
                        {copiedPrompt === listPrompt ? `✓ ${t("workspace.promptCopied")}` : `“${listPrompt}”`}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </li>
          </ol>
        </details>
      )}

      <details className="runtime-details">
        <summary>{t("workspace.diagnostics")}</summary>
        <div className="status-grid" aria-label={t("home.components")}>
          <StatusCard
            title={t("home.service")}
            value={serviceLabel(state, t)}
            state={state.readiness.server}
            explanation={serviceExplanation(state, t)}
          />
          <StatusCard
            title={t("home.runner")}
            value={runnerReadinessLabel(state.readiness.runner, t)}
            state={state.readiness.runner}
            explanation={t("home.runnerExplanation")}
          />
          <StatusCard
            title={t("home.projects")}
            value={state.readiness.project === "ready" ? t("home.projectReady") : projectReadinessLabel(state.readiness.project, t, Boolean(state.project))}
            state={state.readiness.project}
            explanation={state.project?.path ?? t("home.noProject")}
          />
          <StatusCard
            title={t("home.connection")}
            value={connectionLabel(state, t)}
            state={connectionCardState(state)}
            explanation={connectionExplanation(state, t)}
          />
        </div>

        {!isQuickShare && state.topology && (
          <div className="runtime-actions">
            <span>{t("home.runtimeOwnership")}</span>
            <div className="runtime-action-buttons">
              <button className="secondary-button" onClick={onChangeSetup} disabled={operationBusy} data-codegpt-action="change-runtime-setup">{t("home.changeSetup")}</button>
              {state.readiness.runtime_ready && (
                <button className="secondary-button" onClick={onStopRuntime} disabled={operationBusy} data-codegpt-action="stop-runtime">{t("home.stopRuntime")}</button>
              )}
            </div>
          </div>
        )}
      </details>
    </section>
  );
}

function StatusCard({
  title,
  value,
  state,
  explanation,
}: {
  title: string;
  value: string;
  state: string;
  explanation: string;
}) {
  const tone = state === "ready" || state === "remote_ready" ? "ready" : state === "error" ? "error" : state === "unknown" ? "unknown" : "pending";
  return (
    <article className="status-card">
      <span className="section-kicker">{title}</span>
      <div className="status-value"><i className={`status-dot ${tone}`} aria-hidden="true" />{value}</div>
      <p>{explanation}</p>
    </article>
  );
}

type Translate = ReturnType<typeof useLocale>["t"];

function serviceLabel(state: DesktopState, t: Translate) {
  if (state.readiness.server === "ready" && state.topology?.server.kind === "remote") return t("common.connected");
  return serverReadinessLabel(state.readiness.server, t);
}

function serviceExplanation(state: DesktopState, t: Translate) {
  if (state.topology?.server.kind === "remote") return t("home.serviceRemote", { url: state.topology.server.url });
  return t("home.serviceLocal");
}

function quickShareClipboardLabel(state: string, contains: string, t: Translate) {
  if (state !== "copied") return t("clipboard.unavailable");
  if (contains === "tunnel_id") return t("clipboard.tunnelId");
  if (contains === "bearer_credential") return t("clipboard.bearer");
  if (contains === "sensitive_mcp_url") return t("clipboard.sensitiveUrl");
  return t("clipboard.copied");
}

function chatgptActivityObserved(state: DesktopState) {
  return state.readiness.runtime_ready && Boolean(state.chatgpt_activity?.observed);
}

function connectionCardState(state: DesktopState) {
  if (state.regular_tunnel?.status === "error") return "error";
  if (chatgptActivityObserved(state)) return "ready";
  return state.readiness.exposure;
}

function connectionLabel(state: DesktopState, t: Translate) {
  if (chatgptActivityObserved(state) && state.regular_tunnel?.status !== "error") {
    return t("home.connectionObservedLabel");
  }
  const exposure = state.topology?.exposure;
  if (!exposure || exposure.kind === "none") return t("connection.noDesktopTunnel");
  if (exposure.kind === "cloudflare") return "Cloudflare";
  if (exposure.kind === "open_ai_tunnel") return "OpenAI Secure Tunnel";
  return "Existing HTTPS";
}

function connectionExplanation(state: DesktopState, t: Translate) {
  if (!state.readiness.runtime_ready) return t("workspace.afterStart");
  if (state.regular_tunnel?.status !== "error" && chatgptActivityObserved(state)) {
    return t("home.connectionObserved");
  }
  if (state.regular_tunnel?.status === "ready" && state.regular_tunnel.ready_for_chatgpt) return t("home.connectionTunnelReady");
  if (state.readiness.exposure === "remote_ready") return t("home.connectionRemoteReady");
  if (state.readiness.exposure === "local_ready") return t("home.connectionLocalReady");
  return t("home.connectionUnverified");
}
