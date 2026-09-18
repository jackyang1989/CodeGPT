import { useCallback, useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { desktopApi } from "./lib/desktop-api";
import type {
  ActivityEntry,
  DesktopError,
  DesktopState,
} from "./models/topology";
import { FirstRun } from "./features/onboarding/FirstRun";
import { Dashboard } from "./features/dashboard/Dashboard";
import { ProjectsPanel } from "./features/projects/ProjectsPanel";
import { ConnectionPanel } from "./features/connection/ConnectionPanel";
import { ActivityPanel } from "./features/activity/ActivityPanel";
import { SettingsPanel } from "./features/settings/SettingsPanel";
import { LANGUAGES, useLocale } from "./i18n/locale";
import { desktopErrorPresentation, normalizeDesktopError, runtimeLabel, operationLabel } from "./i18n/presentation";
import { ThemeProvider, useTheme } from "./theme/theme";

type Navigation = "home" | "projects" | "connection" | "activity" | "settings";

const NAVIGATION: Navigation[] = ["home", "projects", "connection", "activity", "settings"];

function renderNavIcon(item: Navigation) {
  switch (item) {
    case "home":
      return (
        <svg className="nav-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      );
    case "projects":
      return (
        <svg className="nav-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
        </svg>
      );
    case "connection":
      return (
        <svg className="nav-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 12.55a11 11 0 0 1 14.08 0" />
          <path d="M1.42 9a16 16 0 0 1 21.16 0" />
          <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
          <line x1="12" y1="20" x2="12.01" y2="20" />
        </svg>
      );
    case "activity":
      return (
        <svg className="nav-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      );
    case "settings":
      return (
        <svg className="nav-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
  }
}

const REGULAR_TUNNEL_OBSERVATION_INTERVAL_MS = 1_500;
const CHATGPT_ACTIVITY_OBSERVATION_INTERVAL_MS = 30_000;
const ACTIVE_OPERATION_OBSERVATION_INTERVAL_MS = 1_000;

function AppContent() {
  const { locale, setLocale, t } = useLocale();
  const { resolvedTheme, toggleTheme } = useTheme();
  const [state, setState] = useState<DesktopState | null>(null);
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [navigation, setNavigation] = useState<Navigation>("home");
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<DesktopError | null>(null);
  const [cancelSubmittingId, setCancelSubmittingId] = useState<string | null>(null);
  const [showSetup, setShowSetup] = useState(false);
  const [startupAttempt, setStartupAttempt] = useState(0);
  const [windowFocused, setWindowFocused] = useState(true);
  const stateVersionRef = useRef(0);
  const mainRef = useRef<HTMLElement>(null);
  const hasRegularTunnel = Boolean(state?.regular_tunnel);
  const hasCurrentOperation = Boolean(state?.current_operation);
  const hasLoadedState = Boolean(state);
  const shouldObserveChatgptActivity = Boolean(
    state?.readiness.runtime_ready
      && !state.chatgpt_activity?.observed
      && !hasCurrentOperation
      && !refreshing
      && windowFocused,
  );

  useEffect(() => {
    const onFocus = () => setWindowFocused(true);
    const onBlur = () => setWindowFocused(false);
    window.addEventListener("focus", onFocus);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  useEffect(() => {
    mainRef.current?.focus({ preventScroll: true });
    mainRef.current?.scrollTo?.({ top: 0 });
  }, [navigation, showSetup]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listen<unknown>("desktop:navigate", (event) => {
      if (event.payload !== "activity" && event.payload !== "settings") return;
      setShowSetup(false);
      setNavigation(event.payload);
    }).then((stopListening) => {
      if (disposed) stopListening();
      else unlisten = stopListening;
    }).catch(() => {
      // Host navigation is optional. Ordinary in-window navigation remains
      // usable if the native event subscription is unavailable.
    });
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    const navigateWithKeyboard = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.repeat) return;
      const page = NAVIGATION[Number(event.key) - 1];
      if (!page) return;
      event.preventDefault();
      setNavigation(page);
    };
    window.addEventListener("keydown", navigateWithKeyboard);
    return () => window.removeEventListener("keydown", navigateWithKeyboard);
  }, []);

  const openSetup = () => {
    setShowSetup(true);
    setNavigation("home");
  };

  const commitState = useCallback((next: DesktopState) => {
    stateVersionRef.current += 1;
    setState(next);
  }, []);

  const commitChatgptActivity = useCallback((next: DesktopState) => {
    stateVersionRef.current += 1;
    setState((current) => {
      if (!current) return next;
      if (current.chatgpt_activity?.observed && !next.chatgpt_activity?.observed) return current;
      return { ...current, chatgpt_activity: next.chatgpt_activity };
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const initial = await desktopApi.getState();
        if (cancelled) return;
        // Keep first-run setup mounted through intermediate topology snapshots
        // and the optional Tunnel handoff, including their error/retry paths.
        if (!initial.topology) setShowSetup(true);
        commitState(initial);
        if (initial.current_operation) return;
        const resumeExisting = Boolean(
          initial.topology
          && initial.runtime_autostart
          && initial.topology.experience === "full",
        );
        // A fresh Desktop must stay in product setup until the user chooses
        // the real project and runtime topology. Silently bootstrapping the
        // Desktop workspace creates a fake "configured" happy path and makes
        // users configure the product twice before ChatGPT can use their code.
        if (!resumeExisting) return;

        setRefreshing(true);
        try {
          let next = await desktopApi.resumeSavedRuntime();
          if (cancelled) return;
          commitState(next);
          if (shouldStartPreferredTunnel(next)) {
            next = await desktopApi.startRegularTunnel();
            if (!cancelled) commitState(next);
          }
        } catch (value) {
          if (!cancelled) setError(normalizeDesktopError(value));
        } finally {
          if (!cancelled) setRefreshing(false);
        }
      } catch (value) {
        if (!cancelled) setError(normalizeDesktopError(value));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [commitState, startupAttempt]);

  useEffect(() => {
    if (!hasLoadedState) return;

    let cancelled = false;
    let timeoutId: number | undefined;
    const interval = hasCurrentOperation || refreshing
      ? ACTIVE_OPERATION_OBSERVATION_INTERVAL_MS
      : REGULAR_TUNNEL_OBSERVATION_INTERVAL_MS;

    const scheduleObservation = () => {
      timeoutId = window.setTimeout(() => {
        void (async () => {
          const observedVersion = stateVersionRef.current;
          try {
            const next = await desktopApi.getState();
            if (!cancelled && stateVersionRef.current === observedVersion) {
              commitState(next);
            }
          } catch {
            // Observation is best-effort. A transient invoke failure must not
            // create an error storm or a second concurrent observer.
          } finally {
            if (!cancelled) scheduleObservation();
          }
        })();
      }, interval);
    };

    scheduleObservation();
    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [commitState, hasCurrentOperation, hasLoadedState, hasRegularTunnel, refreshing]);

  useEffect(() => {
    if (!shouldObserveChatgptActivity) return;

    let cancelled = false;
    let timeoutId: number | undefined;
    const observe = async () => {
      try {
        const next = await desktopApi.observeChatgptActivity();
        if (!cancelled) commitChatgptActivity(next);
      } catch {
        // Observation is best-effort. Keep the runtime usable and retry only
        // while the Desktop window remains focused.
      } finally {
        if (!cancelled) {
          timeoutId = window.setTimeout(
            () => void observe(),
            CHATGPT_ACTIVITY_OBSERVATION_INTERVAL_MS,
          );
        }
      }
    };

    void observe();
    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [commitChatgptActivity, shouldObserveChatgptActivity]);

  useEffect(() => {
    if (navigation === "activity") {
      void desktopApi.activity().then(setActivity).catch(() => undefined);
    }
  }, [navigation, state?.activity_sequence]);

  const runStateOperation = async (operation: () => Promise<DesktopState>) => {
    setError(null);
    try {
      commitState(await operation());
    } catch (value) {
      setError(normalizeDesktopError(value));
    }
  };

  const chooseLocalProject = async () => {
    if (!state || state.current_operation) return;
    const topology = state.topology;
    if (
      !topology ||
      topology.experience !== "full" ||
      topology.server.kind !== "local" ||
      !state.project ||
      !state.readiness.runtime_ready
    ) {
      openSetup();
      return;
    }
    setError(null);
    try {
      const selection = await open({
        directory: true,
        multiple: false,
        title: t("setup.chooseProject"),
      });
      if (typeof selection !== "string") return;
      try {
        commitState(await desktopApi.activateLocalProject(selection));
      } catch (value) {
        const normalized = normalizeDesktopError(value);
        if (
          normalized.code !== "project_activation_capability_unavailable" &&
          normalized.code !== "project_activation_restart_required"
        ) {
          throw normalized;
        }
        // Older Runners may need the existing bounded Local Setup fallback to
        // refresh only the Desktop-owned Runner. Keep the user's already-running
        // Tunnel untouched and do not require a second confirmation click.
        commitState(await desktopApi.configureLocal(selection));
      }
      setShowSetup(false);
    } catch (value) {
      setError(normalizeDesktopError(value));
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await runStateOperation(desktopApi.refresh);
    } finally {
      setRefreshing(false);
    }
  };

  const resumeRuntime = async () => {
    setRefreshing(true);
    setError(null);
    try {
      let next = await desktopApi.resumeSavedRuntime();
      commitState(next);
      if (shouldStartPreferredTunnel(next)) {
        next = await desktopApi.startRegularTunnel();
        commitState(next);
      }
    } catch (value) {
      setError(normalizeDesktopError(value));
    } finally {
      setRefreshing(false);
    }
  };

  const cancelCurrentOperation = async () => {
    const observed = state?.current_operation;
    if (!observed || !observed.cancellable || observed.phase === "cancelling") return;
    setCancelSubmittingId(observed.id);
    setError(null);
    try {
      commitState(await desktopApi.cancelOperation(observed.id));
    } catch (value) {
      setError(normalizeDesktopError(value));
    } finally {
      setCancelSubmittingId((current) => current === observed.id ? null : current);
    }
  };

  if (!state) {
    return (
      <main className="splash">
        <div className="splash-brand"><span className="splash-title">CodeGPT</span></div>
        {error ? (
          <section className="startup-error" aria-label="CodeGPT">
            <AppError error={error} />
            <button
              className="primary-button"
              type="button"
              onClick={() => {
                setError(null);
                setStartupAttempt((attempt) => attempt + 1);
              }}
              data-codegpt-action="retry-desktop-startup"
            >
              {t("common.retry")}
            </button>
          </section>
        ) : (
          <span role="status">{t("app.loading")}</span>
        )}
      </main>
    );
  }

  const needsSetup = !state.topology || showSetup;

  return (
    <div className="app-shell app-layout-top">
      <header className="app-top-header" data-tauri-drag-region>
        <div className="header-left" data-tauri-drag-region>
          <div className="brand" aria-label="CodeGPT">
            <span className="brand-name">Code<span className="brand-accent">GPT</span></span>
          </div>
        </div>

        <div className="header-center" data-tauri-drag-region>
          <nav aria-label={t("nav.main")} className="top-nav">
            {NAVIGATION.map((item, index) => (
              <button
                key={item}
                className={`top-nav-btn ${navigation === item ? "active" : ""}`}
                onClick={() => setNavigation(item)}
                aria-current={navigation === item ? "page" : undefined}
                aria-keyshortcuts={`Control+${index + 1} Meta+${index + 1}`}
                title={`${t(`nav.${item}`)} (⌘ / Ctrl + ${index + 1})`}
                data-codegpt-action={`navigate-${item}`}
              >
                <span className="nav-icon-wrapper" aria-hidden="true">
                  {renderNavIcon(item)}
                </span>
                <span className="nav-label-text">{t(`nav.${item}`)}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="header-right">
          <div
            className={`header-status-chip ${state.readiness.runtime_ready ? "is-ready" : "is-pending"}`}
            title={`${runtimeLabel(state, t)} · ${sidebarConnectionLabel(state, t)}`}
          >
            <i className={`status-dot ${state.readiness.runtime_ready ? "ready" : "unknown"}`} aria-hidden="true" />
            <span className="header-status-detail">{sidebarConnectionLabel(state, t)}</span>
          </div>

          <div className="header-divider" aria-hidden="true" />

          <button
            type="button"
            className="header-theme-toggle"
            onClick={toggleTheme}
            aria-label={resolvedTheme === "dark" ? t("theme.toggleLight") : t("theme.toggleDark")}
            title={resolvedTheme === "dark" ? t("theme.toggleLight") : t("theme.toggleDark")}
            data-codegpt-control="theme-toggle"
          >
            {resolvedTheme === "dark" ? (
              <svg className="theme-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="4" />
                <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
              </svg>
            ) : (
              <svg className="theme-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
              </svg>
            )}
          </button>

          <div className="header-locale">
            <label htmlFor="desktop-sidebar-locale" className="sr-only">{t("locale.label")}</label>
            <select
              id="desktop-sidebar-locale"
              aria-label={t("locale.label")}
              value={locale}
              onChange={(event) => setLocale(event.target.value as typeof locale)}
              data-codegpt-control="locale"
              className="top-locale-select"
            >
              {LANGUAGES.map((language) => <option key={language.value} value={language.value}>{language.label}</option>)}
            </select>
          </div>
        </div>
      </header>

      <main className="main-content" ref={mainRef} tabIndex={-1}>
        {navigation === "home" && showSetup && state.topology && (
          <button className="back-button" onClick={() => setShowSetup(false)}>
            <span aria-hidden="true">← </span>{t("home.backToOverview")}
          </button>
        )}
        {state.current_operation && (
          <section
            className={`operation-status ${state.current_operation.phase}`}
            role="status"
            aria-live="polite"
            aria-label={t("operation.statusLabel")}
            data-codegpt-operation={state.current_operation.kind}
          >
            <div>
              <span className="section-kicker">
                {state.current_operation.phase === "cancelling"
                  ? t("operation.cancelling")
                  : t("operation.running")}
              </span>
              <strong>{operationLabel(state.current_operation.kind, t)}</strong>
              <span>{t("operation.cancelNote")}</span>
            </div>
            {state.current_operation.cancellable && (
              <button
                className="secondary-button"
                type="button"
                disabled={
                  state.current_operation.phase === "cancelling" ||
                  cancelSubmittingId === state.current_operation.id
                }
                onClick={() => void cancelCurrentOperation()}
                data-codegpt-action="cancel-desktop-operation"
              >
                {state.current_operation.phase === "cancelling"
                  ? t("operation.cancelling")
                  : t("operation.cancel")}
              </button>
            )}
          </section>
        )}
        {error && <AppError error={error} onDismiss={() => setError(null)} />}
        {navigation === "home" && (needsSetup ? (
          <FirstRun
            state={state}
            onState={commitState}
            chooseModeFirst={showSetup}
            onComplete={() => setShowSetup(false)}
          />
        ) : (
          <Dashboard
            state={state}
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            onResumeRuntime={() => void resumeRuntime()}
            onConnectChatGpt={() => void runStateOperation(desktopApi.startRegularTunnel)}
            onChooseProject={() => void chooseLocalProject()}
            onChangeSetup={openSetup}
            onNavigate={setNavigation}
            onStopQuickShare={() => void runStateOperation(desktopApi.stopQuickShare)}
            onStopRuntime={() => void runStateOperation(desktopApi.stopLocalRuntime)}
          />
        ))}
        {navigation === "projects" && (
          <ProjectsPanel
            state={state}
            onChooseProject={() => void chooseLocalProject()}
            onState={commitState}
          />
        )}
        {navigation === "connection" && <ConnectionPanel state={state} onState={commitState} />}
        {navigation === "activity" && <ActivityPanel activity={activity} />}
        {navigation === "settings" && <SettingsPanel state={state} onState={commitState} />}
      </main>
    </div>
  );
}

function sidebarConnectionLabel(state: DesktopState, t: ReturnType<typeof useLocale>["t"]) {
  if (!state.readiness.runtime_ready) return t("workspace.afterStart");
  if (state.regular_tunnel?.status !== "error" && state.readiness.runtime_ready && state.chatgpt_activity?.observed) {
    return t("sidebar.chatgptObserved");
  }
  if (state.readiness.ready_for_chatgpt) return t("sidebar.chatgptReady");
  if (state.regular_tunnel?.status === "ready" && state.regular_tunnel.ready_for_chatgpt) return t("sidebar.tunnelWaiting");
  return t("sidebar.connectionIncomplete");
}

function shouldStartPreferredTunnel(state: DesktopState) {
  return state.preferred_connection === "open_ai_tunnel" &&
    state.topology?.experience === "full" &&
    state.topology.server.kind === "local" &&
    state.readiness.runtime_ready &&
    state.openai_tunnel_configured &&
    !state.regular_tunnel;
}

function AppError({
  error,
  onDismiss,
}: {
  error: DesktopError;
  onDismiss: () => void;
}) {
  const { t } = useLocale();
  const presentation = desktopErrorPresentation(error, t);
  return (
    <div className="error-card app-error" role="alert">
      <div className="error-header">
        <div className="error-titles">
          <strong>{presentation.title}</strong>
          <span className="error-action-text">{presentation.action}</span>
        </div>
        <button
          type="button"
          className="error-dismiss-btn"
          onClick={onDismiss}
          title="关闭"
          aria-label="关闭"
        >
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
      <details className="error-details">
        <summary>{t("common.details")}</summary>
        <code>{error.code}</code>
        <p>{error.message}</p>
      </details>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
