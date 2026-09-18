import { useEffect, useState } from "react";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { desktopApi } from "../../lib/desktop-api";
import type { DesktopError, DesktopState } from "../../models/topology";
import { useLocale } from "../../i18n/locale";
import {
  desktopErrorPresentation,
  normalizeDesktopError,
  runtimeLabel,
} from "../../i18n/presentation";
import { TunnelConfigDiagnostics } from "./TunnelConfigDiagnostics";

type RegularProvider = "local" | "openai";

export function ConnectionPanel({
  state,
  onState,
}: {
  state: DesktopState;
  onState: (state: DesktopState) => void;
}) {
  const { t } = useLocale();
  const [provider, setProvider] = useState<RegularProvider>(
    state.regular_tunnel || state.preferred_connection === "open_ai_tunnel" ? "openai" : "local",
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<DesktopError | null>(null);
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const [promptCopiedKey, setPromptCopiedKey] = useState<"primary" | "list" | null>(null);
  const tunnelId = state.openai_tunnel_config.effective_tunnel_id ?? state.openai_tunnel_config.saved_tunnel_id;
  useEffect(() => {
    if (copyStatus !== "copied") return;
    const timer = window.setTimeout(() => setCopyStatus("idle"), 2500);
    return () => window.clearTimeout(timer);
  }, [copyStatus]);
  useEffect(() => setCopyStatus("idle"), [tunnelId]);
  const copyTunnelId = async () => {
    if (!tunnelId) return;
    try { await writeText(tunnelId); setCopyStatus("copied"); }
    catch { setCopyStatus("failed"); }
  };

  const copyPromptText = async (text: string, key: "primary" | "list") => {
    try {
      await writeText(text);
      setPromptCopiedKey(key);
    } catch {
      try {
        if (navigator.clipboard) {
          await navigator.clipboard.writeText(text);
          setPromptCopiedKey(key);
        }
      } catch {
        // best effort
      }
    }
    window.setTimeout(() => {
      setPromptCopiedKey((prev) => (prev === key ? null : prev));
    }, 2000);
  };

  const projectName = state.project?.path.split(/[\\/]/).filter(Boolean).pop() ?? null;
  const projects = state.projects ?? [];
  const enabledProjectsCount = projects.filter((p) => !p.disabled).length;
  const hasMultipleProjects = enabledProjectsCount > 1;

  const promptText = projectName
    ? t("workspace.verifyPromptTemplate", { project: projectName })
    : t("workspace.verifyPromptTemplate", { project: "MyProject" });
  const listPrompt = t("workspace.verifyListPromptTemplate");

  const topology = state.topology;
  const mutationBusy = busy || Boolean(state.current_operation);

  const run = async (operation: () => Promise<DesktopState>) => {
    if (mutationBusy) return;
    setBusy(true);
    setError(null);
    try {
      onState(await operation());
    } catch (value) {
      setError(normalizeDesktopError(value));
    } finally {
      setBusy(false);
    }
  };

  const chooseProvider = (value: RegularProvider) => {
    setProvider(value);
  };

  if (topology?.server.kind === "remote") {
    return (
      <section className="page-section" aria-labelledby="connection-title" data-codegpt-page="connection">
        <PageHeading />
        <article className="detail-card" aria-labelledby="remote-server-title">
          <h2 id="remote-server-title">{t("connection.remoteServer")}</h2>
          <strong>{topology.server.url}</strong>
          <dl className="detail-list">
            <div><dt>Runner</dt><dd>{t("connection.runnerThisComputer")}</dd></div>
            <div><dt>{t("connection.methods")}</dt><dd>{t("connection.externalManagedRemote")}</dd></div>
          </dl>
        </article>
      </section>
    );
  }

  if (topology?.experience === "quick_share") {
    return (
      <section className="page-section" aria-labelledby="connection-title" data-codegpt-page="connection">
        <PageHeading />
        <article className="detail-card">
          <span className="section-kicker">Quick Share</span>
          <strong>{currentConnection(state, t)}</strong>
          <p>{t("connection.quickShareManaged")}</p>
        </article>
      </section>
    );
  }

  const tunnelEstablished = state.regular_tunnel?.status === "ready";
  const tunnelLocallyReady = tunnelEstablished && Boolean(state.regular_tunnel?.ready_for_chatgpt);
  const tunnelError = state.regular_tunnel?.status === "error";
  const chatgptObserved = state.readiness.runtime_ready &&
    Boolean(state.chatgpt_activity?.observed) &&
    !tunnelError;
  const canStart = state.readiness.runtime_ready && state.openai_tunnel_configured && provider === "openai";

  return (
    <section
      className="page-section connection-page"
      aria-labelledby="connection-title"
      aria-busy={mutationBusy}
      data-codegpt-page="connection"
    >
      <PageHeading />

      <div className="connection-pipeline-hero" aria-hidden="true">
        <div className="pipeline-node node-local">
          <div className="node-icon-bubble">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="node-svg">
              <rect x="2" y="3" width="20" height="14" rx="2" />
              <line x1="8" y1="21" x2="16" y2="21" />
              <line x1="12" y1="17" x2="12" y2="21" />
            </svg>
          </div>
          <div className="node-meta">
            <span className="node-label">本地代码工程</span>
            <span className="node-value">{state.project?.path.split(/[\\/]/).filter(Boolean).pop() ?? "Local Repo"}</span>
          </div>
        </div>

        <div className={`pipeline-pipe ${tunnelEstablished ? "active" : ""}`}>
          <div className="pipe-line">
            <span className="pipe-pulse" />
          </div>
          <span className="pipe-badge">
            {tunnelEstablished ? "🔒 TLS E2E 加密" : "⚡ 待命中"}
          </span>
        </div>

        <div className={`pipeline-node node-tunnel ${tunnelEstablished ? "active" : ""}`}>
          <div className="node-icon-bubble">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="node-svg">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
          </div>
          <div className="node-meta">
            <span className="node-label">OpenAI Secure Tunnel</span>
            <span className="node-value">{tunnelId ? `${tunnelId.slice(0, 10)}…` : "待配置"}</span>
          </div>
        </div>

        <div className={`pipeline-pipe ${chatgptObserved ? "active" : ""}`}>
          <div className="pipe-line">
            <span className="pipe-pulse" />
          </div>
          <span className="pipe-badge">
            {chatgptObserved ? "🟢 协同活跃" : "等待 ChatGPT"}
          </span>
        </div>

        <div className={`pipeline-node node-chatgpt ${chatgptObserved ? "active" : ""}`}>
          <div className="node-icon-bubble">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="node-svg">
              <circle cx="12" cy="12" r="10" />
              <path d="M8 14s1.5 2 4 2 4-2 4-2" />
              <line x1="9" y1="9" x2="9.01" y2="9" />
              <line x1="15" y1="9" x2="15.01" y2="9" />
            </svg>
          </div>
          <div className="node-meta">
            <span className="node-label">ChatGPT Web</span>
            <span className="node-value">{chatgptObserved ? "已连通" : "待接入"}</span>
          </div>
        </div>
      </div>

      {error && <LocalizedError error={error} />}

      <div className="connection-grid">
        <div className="connection-col connection-col-primary">
          <article className="connection-current detail-card" aria-labelledby="connection-current-title">
            <div className="card-header-row">
              <h2 id="connection-current-title" className="section-title">{t("connection.current")}</h2>
              <span className={`status-pill ${chatgptObserved ? "ready" : tunnelLocallyReady ? "ready" : tunnelError ? "error" : state.regular_tunnel ? "pending" : "unknown"}`}>
                <i className={`status-dot ${chatgptObserved ? "ready" : tunnelLocallyReady ? "ready" : tunnelError ? "error" : state.regular_tunnel ? "pending" : "unknown"}`} aria-hidden="true" />
                {chatgptObserved ? t("connection.observed") : tunnelLocallyReady ? t("connection.tunnelReady") : currentConnection(state, t)}
              </span>
            </div>
            <p className="card-lead-text">
              {!state.readiness.runtime_ready ? t("workspace.afterStart") : chatgptObserved ? t("connection.observedDescription") : tunnelLocallyReady ? t("connection.waitingForChatGpt") : tunnelEstablished ? t("connection.tunnelHandoffNeedsAction") : t("connection.notVerified")}
            </p>

            {state.regular_tunnel ? (
              <div className="handoff-card" aria-label="OpenAI Secure Tunnel">
                <div className="handoff-card-info">
                  <span className="section-kicker">OpenAI Secure Tunnel</span>
                  <span className="handoff-sub">{tunnelError ? t("workspace.stopToRetry") : !tunnelEstablished ? t("connection.tunnelStarting") : "端到端通道保持连通"}</span>
                </div>
                <button
                  className="danger-button"
                  disabled={mutationBusy}
                  onClick={() => void run(desktopApi.stopRegularTunnel)}
                  data-codegpt-action="stop-regular-tunnel"
                >
                  {mutationBusy ? t("common.checking") : t("connection.stopTunnel")}
                </button>
              </div>
            ) : (
              <div className="connection-form">
                <fieldset className="provider-row provider-fieldset" role="radiogroup" aria-labelledby="regular-provider-legend">
                  <legend id="regular-provider-legend">{t("connection.methods")}</legend>
                  <ProviderOption
                    id="regular-provider-local"
                    value="local"
                    checked={provider === "local"}
                    onChange={chooseProvider}
                    title={t("connection.noDesktopTunnel")}
                    description={t("connection.localDescription")}
                    disabled={mutationBusy}
                  />
                  <ProviderOption
                    id="regular-provider-openai"
                    value="openai"
                    checked={provider === "openai"}
                    onChange={chooseProvider}
                    title="OpenAI Secure Tunnel"
                    description={state.openai_tunnel_configured ? t("connection.openaiDescription") : t("connection.openaiNotConfigured")}
                    disabled={mutationBusy || !state.openai_tunnel_configured}
                  />
                </fieldset>

                {!state.readiness.runtime_ready && <p className="inline-note">{t("connection.runtimeRequired")}</p>}

                {provider === "openai" && (
                  <button className="primary-button full-width-action" disabled={mutationBusy || !canStart} onClick={() => void run(desktopApi.startRegularTunnel)} data-codegpt-action="start-regular-tunnel">
                    {mutationBusy ? t("connection.tunnelStarting") : t("home.connectChatGpt")}
                  </button>
                )}
              </div>
            )}
          </article>

          {tunnelId && (
            <article className="detail-card tunnel-copy">
              <div className="card-header-row">
                <label htmlFor="active-tunnel-id">Tunnel ID</label>
                {copyStatus === "copied" && <span className="copy-badge-success" role="status">{t("connection.clipboardReady")}</span>}
                {copyStatus === "failed" && <span className="copy-badge-error" role="status">{t("connection.copyFailed")}</span>}
              </div>
              <div className="tunnel-input-action-row">
                <input id="active-tunnel-id" readOnly value={tunnelId} onFocus={(event) => event.target.select()} className="tunnel-code-input" />
                <button className="secondary-button copy-tunnel-btn" onClick={() => void copyTunnelId()}>{t("connection.copyTunnelId")}</button>
              </div>
            </article>
          )}
        </div>

        <div className="connection-col connection-col-secondary">
          <article className="connection-instructions detail-card">
            <h2 className="section-title">{t("workspace.handoffTitle")}</h2>
            <div className="handoff-steps-cards">
              <div className="handoff-step-card">
                <span className="step-badge">01</span>
                <div className="step-body">
                  <strong>在 ChatGPT 打开设置</strong>
                  <p>{t("workspace.handoffOne")}</p>
                </div>
              </div>
              <div className="handoff-step-card">
                <span className="step-badge">02</span>
                <div className="step-body">
                  <strong>填写 Tunnel ID 凭据</strong>
                  <p>{t("workspace.handoffTwo")}</p>
                </div>
              </div>
              <div className="handoff-step-card">
                <span className="step-badge">03</span>
                <div className="step-body">
                  <strong>在会话中发起验证</strong>
                  <p>{projectName ? t("workspace.verifyPromptGuide") : t("workspace.verifyPromptGuideGeneric")}</p>
                </div>
              </div>
            </div>
            <div className="chatgpt-prompt-helper">
              <span className="helper-title">💡 ChatGPT 验证指令模板</span>
              <p className="helper-text">"{promptText}"</p>
              <div className="prompt-helper-actions">
                <button
                  className="secondary-button btn-mini"
                  type="button"
                  onClick={() => void copyPromptText(promptText, "primary")}
                >
                  {promptCopiedKey === "primary" ? `✓ ${t("workspace.promptCopied")}` : t("workspace.copyPrompt")}
                </button>
                {hasMultipleProjects && (
                  <button
                    className="secondary-button btn-mini"
                    type="button"
                    onClick={() => void copyPromptText(listPrompt, "list")}
                    title={listPrompt}
                  >
                    {promptCopiedKey === "list" ? `✓ ${t("workspace.promptCopied")}` : `${t("workspace.copyListPrompt")}：“${listPrompt}”`}
                  </button>
                )}
              </div>
            </div>
          </article>
        </div>
      </div>

      <details className="setup-tunnel-details">
        <summary>{t("workspace.optionalTunnel")}</summary>
        <p className="details-intro">{t("connection.description")}</p>
        <TunnelConfigDiagnostics state={state} onState={onState} />
      </details>
    </section>
  );
}

function PageHeading() {
  const { t } = useLocale();
  return (
    <h1 id="connection-title">{t("connection.title")}</h1>
  );
}

function ProviderOption({
  id,
  value,
  checked,
  onChange,
  title,
  description,
  disabled,
}: {
  id: string;
  value: RegularProvider;
  checked: boolean;
  onChange: (value: RegularProvider) => void;
  title: string;
  description: string;
  disabled: boolean;
}) {
  const descriptionId = `${id}-description`;
  return (
    <div className={`provider-option ${checked ? "selected" : ""}`}>
      <input
        id={id}
        type="radio"
        name="regular-connection-provider"
        value={value}
        checked={checked}
        onChange={() => onChange(value)}
        aria-describedby={descriptionId}
        disabled={disabled}
      />
      <label htmlFor={id}>
        <strong>{title}</strong>
        <span id={descriptionId}>{description}</span>
      </label>
    </div>
  );
}

function LocalizedError({ error }: { error: DesktopError }) {
  const { t } = useLocale();
  const presentation = desktopErrorPresentation(error, t);
  return (
    <div className="error-card" role="alert">
      <strong>{presentation.title}</strong>
      <span>{presentation.action}</span>
      <details>
        <summary>{t("common.details")}</summary>
        <code>{error.code}</code>
        <p>{error.message}</p>
      </details>
    </div>
  );
}

function currentConnection(state: DesktopState, t: ReturnType<typeof useLocale>["t"]) {
  if (state.regular_tunnel) return "OpenAI Secure Tunnel";
  const exposure = state.topology?.exposure;
  if (!exposure || exposure.kind === "none") return t("connection.noDesktopTunnel");
  if (exposure.kind === "existing_https") return `Existing HTTPS · ${exposure.url}`;
  if (exposure.kind === "cloudflare") return "Cloudflare Quick Share";
  return "OpenAI Secure Tunnel";
}

