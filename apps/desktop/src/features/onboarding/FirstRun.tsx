import { useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { desktopApi, type QuickShareProvider } from "../../lib/desktop-api";
import { useLocale } from "../../i18n/locale";
import { TunnelConfigDiagnostics } from "../connection/TunnelConfigDiagnostics";
import { PowerShellInstallGuidance } from "../settings/PowerShellInstallGuidance";
import {
  desktopErrorPresentation,
  normalizeDesktopError,
} from "../../i18n/presentation";
import type {
  DesktopError,
  DesktopState,
  ProjectSelection,
} from "../../models/topology";

type SetupMode = "local" | "remote" | "share";

interface FirstRunProps {
  state: DesktopState;
  onState: (state: DesktopState) => void;
  chooseModeFirst?: boolean;
  onComplete?: () => void;
}

export function FirstRun({ state, onState, chooseModeFirst = false, onComplete }: FirstRunProps) {
  const { t } = useLocale();
  const initialMode = useMemo<SetupMode | null>(() => {
    if (chooseModeFirst) return null;
    if (state.topology?.experience === "quick_share") return "share";
    if (state.topology?.server.kind === "local") return "local";
    if (state.topology?.server.kind === "remote") return "remote";
    return null;
  }, [chooseModeFirst, state.topology]);
  const [mode, setMode] = useState<SetupMode | null>(initialMode);
  const [project, setProject] = useState<ProjectSelection | null>(
    state.project ?? null,
  );
  const [serverUrl, setServerUrl] = useState(
    state.topology?.server.kind === "remote" ? state.topology.server.url : "",
  );
  const [pairingCode, setPairingCode] = useState("");
  const [remoteEnrollmentNeedsRefresh, setRemoteEnrollmentNeedsRefresh] = useState(false);
  const [provider, setProvider] = useState<QuickShareProvider>("cloudflare");
  const [connectAfterSetup, setConnectAfterSetup] = useState(state.openai_tunnel_configured);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<DesktopError | null>(null);
  const mutationBusy = busy || Boolean(state.current_operation);
  const canReuseRemoteEnrollment = Boolean(
    mode === "remote" &&
      !remoteEnrollmentNeedsRefresh &&
      state.project?.runtime_project_id &&
      state.topology?.experience === "full" &&
      state.topology.server.kind === "remote" &&
      sameServerOrigin(serverUrl, state.topology.server.url),
  );

  const chooseProject = async () => {
    setError(null);
    try {
      const selection = await open({
        directory: true,
        multiple: false,
        title: t("setup.chooseProject"),
      });
      if (typeof selection !== "string") return;
      setProject(await desktopApi.inspectProject(selection));
    } catch (value) {
      setError(normalizeDesktopError(value));
    }
  };

  const run = async () => {
    if (!mode || !project || mutationBusy) return;
    setBusy(true);
    setError(null);
    try {
      if (mode === "local") {
        let next = await desktopApi.configureLocal(project.path);
        onState(next);
        if (connectAfterSetup && next.openai_tunnel_configured && next.readiness.runtime_ready && !next.regular_tunnel) {
          next = await desktopApi.startRegularTunnel();
          onState(next);
        }
        onComplete?.();
      } else if (mode === "remote") {
        if (!project) return;
        const oneTimeCode = pairingCode;
        setPairingCode("");
        const next = await desktopApi.configureRemote(
          serverUrl,
          oneTimeCode,
          project.path,
        );
        setRemoteEnrollmentNeedsRefresh(false);
        onState(next);
        onComplete?.();
      } else {
        if (!project) return;
        onState(await desktopApi.startQuickShare(project.path, provider));
        onComplete?.();
      }
    } catch (value) {
      const normalized = normalizeDesktopError(value);
      if (mode === "remote" && normalized.code === "pairing_code_invalid") {
        // The optimistic reuse hint is based on saved Desktop state. If the
        // backend proves that connection identity is no longer reusable, expose
        // the one-shot recovery field instead of trapping the user behind the
        // stale reuse hint.
        setRemoteEnrollmentNeedsRefresh(true);
      }
      setError(normalized);
    } finally {
      setBusy(false);
    }
  };

  if (!mode) {
    return (
      <section className="first-run" aria-labelledby="first-run-title" data-codegpt-page="first-run">
        <h1 id="first-run-title">{t("first.title")}</h1>
        <p className="lede">{t("first.description")}</p>
        <ol className="setup-overview" aria-label={t("workspace.progress")}>
          <li><span className="step-num-pill">01</span><span className="step-num-label">{t("workspace.prepare")}</span></li>
          <li className="step-arrow-item" aria-hidden="true">→</li>
          <li><span className="step-num-pill">02</span><span className="step-num-label">{t("workspace.connect")}</span></li>
          <li className="step-arrow-item" aria-hidden="true">→</li>
          <li><span className="step-num-pill">03</span><span className="step-num-label">{t("workspace.verify")}</span></li>
        </ol>

        <div className="entry-grid">
          <button className="entry-card recommended hero-entry-card" onClick={() => setMode("local")} data-codegpt-action="choose-local-setup">
            <div className="hero-card-header">
              <span className="entry-badge">{t("first.recommended")}</span>
              <div className="entry-icon-bubble" aria-hidden="true">
                <svg className="entry-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
              </div>
            </div>
            <div className="hero-card-content">
              <strong>{t("first.localTitle")}</strong>
              <span>{t("first.localDescription")}</span>
            </div>
            <div className="hero-card-footer">
              <span className="hero-card-action primary-cta-pill">
                <span>{t("first.startLocalAction")}</span>
              </span>
            </div>
          </button>

          <div className="secondary-entries-group">
            <span className="secondary-group-label">{t("first.otherModes")}</span>
            <div className="secondary-cards-row">
              <button className="entry-card secondary-card" onClick={() => setMode("remote")} data-codegpt-action="choose-remote-setup">
                <div className="entry-icon-bubble-sm" aria-hidden="true">
                  <svg className="entry-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                </div>
                <div className="secondary-card-text">
                  <strong>{t("first.remoteTitle")}</strong>
                  <span>{t("first.remoteDescription")}</span>
                  <span className="secondary-card-link">{t("first.remoteAction")}</span>
                </div>
              </button>
              <button className="entry-card secondary-card" onClick={() => setMode("share")} data-codegpt-action="choose-quick-share-setup">
                <div className="entry-icon-bubble-sm" aria-hidden="true">
                  <svg className="entry-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                  </svg>
                </div>
                <div className="secondary-card-text">
                  <strong>{t("first.shareTitle")}</strong>
                  <span>{t("first.shareDescription")}</span>
                  <span className="secondary-card-link">{t("first.shareAction")}</span>
                </div>
              </button>
            </div>
          </div>

          <div className="first-run-trust-panel">
            <div className="trust-panel-header">
              <span className="section-kicker">{t("first.featuresLabel")}</span>
            </div>
            <div className="trust-columns">
              <div className="trust-col">
                <div className="trust-icon-box" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
                <div className="trust-col-body">
                  <strong>{t("first.featIsolationTitle")}</strong>
                  <p>{t("first.featIsolationDesc")}</p>
                </div>
              </div>
              <div className="trust-col">
                <div className="trust-icon-box" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                </div>
                <div className="trust-col-body">
                  <strong>{t("first.featSecurityTitle")}</strong>
                  <p>{t("first.featSecurityDesc")}</p>
                </div>
              </div>
              <div className="trust-col">
                <div className="trust-icon-box" aria-hidden="true">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="16 18 22 12 16 6" />
                    <polyline points="8 6 2 12 8 18" />
                  </svg>
                </div>
                <div className="trust-col-body">
                  <strong>{t("first.featProtocolsTitle")}</strong>
                  <p>{t("first.featProtocolsDesc")}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const presentation = error ? desktopErrorPresentation(error, t) : null;
  const serverInvalid = error?.code === "server_url_invalid" || error?.code === "server_unreachable";
  const pairingInvalid = error?.code === "pairing_code_invalid";

  return (
    <form
      className="setup-shell"
      aria-labelledby="setup-title"
      aria-busy={mutationBusy}
      data-codegpt-page="setup"
      onSubmit={(event) => {
        event.preventDefault();
        void run();
      }}
    >
      <button type="button" className="back-button" onClick={() => setMode(null)} data-codegpt-action="show-setup-options">
        {t("setup.back")}
      </button>
      <h1 id="setup-title">{setupTitle(mode, t)}</h1>
      <p className="lede">{setupDescription(mode, t)}</p>

      <div className="project-picker-card">
        <div>
          <span className="section-kicker">{t("setup.project")}</span>
          <strong>{project ? project.path : t("setup.chooseProject")}</strong>
          {mode === "local" && !project && (
            <span className="project-meta">{t("setup.projectRequired")}</span>
          )}
          {project && (
            <span className="project-meta">
              {t("setup.allowedRoot", {
                root: project.allowed_root,
                kind: project.is_git_repository ? t("setup.gitRepository") : t("setup.folder"),
              })}
            </span>
          )}
        </div>
        <button type="button" className="secondary-button" onClick={chooseProject} disabled={mutationBusy} data-codegpt-action="choose-project">
          {project ? t("setup.changeFolder") : t("setup.chooseFolder")}
        </button>
      </div>

      <PowerShellInstallGuidance state={state} onState={onState} />

      {mode === "local" && (
        <details className="setup-tunnel-details">
          <summary>{t("workspace.optionalTunnel")}</summary>
          <TunnelConfigDiagnostics state={state} onState={onState} />
        </details>
      )}

      {mode === "remote" && (
        <div className="form-card">
          <div className="field-group">
            <label htmlFor="setup-server-url">{t("setup.serverUrl")}</label>
            <input
              id="setup-server-url"
              type="url"
              value={serverUrl}
              onChange={(event) => setServerUrl(event.target.value)}
              placeholder="https://codegpt.example.com"
              disabled={mutationBusy}
              aria-describedby="setup-server-url-help"
              aria-invalid={serverInvalid || undefined}
              aria-errormessage={serverInvalid ? "setup-error" : undefined}
            />
            <span className="field-help" id="setup-server-url-help">{t("setup.serverUrlHelp")}</span>
          </div>
          {canReuseRemoteEnrollment ? (
            <div className="enrollment-note">
              <span className="section-kicker">{t("setup.enrollment")}</span>
              <strong>{t("setup.reuseEnrollment")}</strong>
              <span>{t("setup.reuseEnrollmentHelp")}</span>
            </div>
          ) : (
            <div className="field-group">
              <label htmlFor="setup-pairing-code">{t("setup.pairingCode")}</label>
              <input
                id="setup-pairing-code"
                type="password"
                value={pairingCode}
                onChange={(event) => setPairingCode(event.target.value)}
                placeholder="cg_pair_…"
                autoComplete="off"
                spellCheck={false}
                disabled={mutationBusy}
                aria-describedby="setup-pairing-code-help"
                aria-invalid={pairingInvalid || undefined}
                aria-errormessage={pairingInvalid ? "setup-error" : undefined}
              />
              <span className="field-help" id="setup-pairing-code-help">{t("setup.pairingCodeHelp")}</span>
            </div>
          )}
        </div>
      )}

      {mode === "share" && (
        <fieldset className="provider-row provider-fieldset" role="radiogroup" aria-labelledby="quick-share-provider-legend">
          <legend id="quick-share-provider-legend">{t("setup.providerLegend")}</legend>
          {(["cloudflare", "openai", "none"] as QuickShareProvider[]).map((value) => (
            <div
              className={`provider-option ${provider === value ? "selected" : ""}`}
              key={value}
            >
              <input
                id={`quick-share-provider-${value}`}
                type="radio"
                name="quick-share-provider"
                value={value}
                checked={provider === value}
                onChange={() => setProvider(value)}
                disabled={mutationBusy}
                aria-describedby={`quick-share-provider-${value}-description`}
                data-codegpt-control={`quick-share-provider-${value}`}
              />
              <label htmlFor={`quick-share-provider-${value}`}>
                <strong>{providerLabel(value, t)}</strong>
                <span id={`quick-share-provider-${value}-description`}>{providerDescription(value, t)}</span>
              </label>
            </div>
          ))}
        </fieldset>
      )}

      {mode === "local" && state.openai_tunnel_configured && !state.regular_tunnel && (
        <label className="setup-choice-card" htmlFor="setup-connect-chatgpt">
          <input
            id="setup-connect-chatgpt"
            type="checkbox"
            checked={connectAfterSetup}
            onChange={(event) => setConnectAfterSetup(event.target.checked)}
            disabled={mutationBusy}
          />
          <span>
            <strong>{t("setup.connectChatGptAfterSetup")}</strong>
            <small>{t("setup.connectChatGptAfterSetupHelp")}</small>
          </span>
        </label>
      )}

      {mode === "remote" && (
        <details className="advanced-enrollment">
          <summary>{t("setup.advancedEnrollment")}</summary>
          <p>{t("setup.advancedEnrollmentHelp")}</p>
        </details>
      )}

      {error && (
        <div className="error-card" role="alert" id="setup-error">
          <strong>{presentation?.title}</strong>
          <span>{presentation?.action}</span>
          <details>
            <summary>{t("common.details")}</summary>
            <code>{error.code}</code>
            <p>{error.message}</p>
          </details>
          {error.code === "project_not_loaded" && (
            <div className="setup-recovery-actions">
              <button
                type="button"
                className="secondary-button"
                onClick={() => void run()}
                disabled={mutationBusy}
                data-codegpt-action="activate-project"
              >
                {t("setup.reloadProject")}
              </button>
              <span>{t("setup.reloadProjectHelp")}</span>
            </div>
          )}
        </div>
      )}

      <div className="setup-actions">
        <button
          type="submit"
          className="primary-button"
          disabled={
            mutationBusy ||
            !project ||
            (mode === "remote" &&
              (!serverUrl.trim() || (!canReuseRemoteEnrollment && !pairingCode.trim())))
          }
          data-codegpt-action={mode === "local" ? "configure-local" : mode === "remote" ? "configure-remote" : "start-quick-share"}
        >
          {mutationBusy ? t("common.checking") : actionLabel(mode, canReuseRemoteEnrollment, t)}
        </button>
        <span className="action-help">
          {mutationBusy ? t("setup.verifying") : t("setup.noTerminal")}
        </span>
      </div>
    </form>
  );
}

type Translate = ReturnType<typeof useLocale>["t"];

function modeLabel(mode: SetupMode, t: Translate) {
  return mode === "local" ? t("setup.localLabel") : mode === "remote" ? t("setup.remoteLabel") : t("setup.shareLabel");
}

function setupTitle(mode: SetupMode, t: Translate) {
  return mode === "local"
    ? t("setup.localTitle")
    : mode === "remote"
      ? t("setup.remoteTitle")
      : t("setup.shareTitle");
}

function setupDescription(mode: SetupMode, t: Translate) {
  if (mode === "local") return t("setup.localDescription");
  if (mode === "remote") return t("setup.remoteDescription");
  return t("setup.shareDescription");
}

function actionLabel(mode: SetupMode, canReuseRemoteEnrollment: boolean, t: Translate) {
  if (mode === "local") return t("setup.setUp");
  if (mode === "remote") return canReuseRemoteEnrollment ? t("setup.reconnect") : t("setup.connect");
  return t("setup.startShare");
}

function sameServerOrigin(left: string, right: string) {
  return left.trim().replace(/\/+$/, "").toLowerCase() === right.trim().replace(/\/+$/, "").toLowerCase();
}

function providerLabel(provider: QuickShareProvider, t: Translate) {
  if (provider === "cloudflare") return "Cloudflare";
  if (provider === "openai") return "OpenAI Secure Tunnel";
  return t("common.noChatGpt");
}

function providerDescription(provider: QuickShareProvider, t: Translate) {
  if (provider === "cloudflare") return t("provider.cloudflareDescription");
  if (provider === "openai") return t("provider.openaiDescription");
  return t("provider.localDescription");
}
