import { useEffect, useState } from "react";
import type { DesktopProjectEntry, DesktopState } from "../../models/topology";
import { useLocale } from "../../i18n/locale";
import { projectReadinessLabel } from "../../i18n/presentation";
import { desktopApi } from "../../lib/desktop-api";

interface ProjectsPanelProps {
  state: DesktopState;
  onChooseProject: () => void;
  onState?: (state: DesktopState) => void;
}

export function ProjectsPanel({
  state,
  onChooseProject,
  onState,
}: ProjectsPanelProps) {
  const { t } = useLocale();
  const [searchQuery, setSearchQuery] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const operationBusy = Boolean(state.current_operation);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "o") {
        if (!operationBusy && !busyId) {
          e.preventDefault();
          onChooseProject();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onChooseProject, operationBusy, busyId]);

  // Normalize project list: prioritize state.projects, fallback to state.project
  let projects: DesktopProjectEntry[] = state.projects ?? [];
  if (projects.length === 0 && state.project) {
    projects = [
      {
        id: state.project.runtime_project_id ?? "current",
        name:
          state.project.path.split(/[\\/]/).filter(Boolean).pop() ?? "Project",
        path: state.project.path,
        allowed_root: state.project.allowed_root,
        is_git_repository: state.project.is_git_repository,
        is_active: true,
        disabled: false,
      },
    ];
  }

  const totalCount = projects.length;
  const enabledCount = projects.filter((p) => !p.disabled).length;

  const handleToggle = async (entry: DesktopProjectEntry) => {
    setActionError(null);
    setBusyId(entry.id);
    try {
      const nextEnabled = entry.disabled; // if currently disabled, next is enabled (true)
      const nextState = await desktopApi.toggleProjectEnabled(
        entry.id,
        nextEnabled,
      );
      onState?.(nextState);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionError(msg);
    } finally {
      setBusyId(null);
    }
  };

  const handleActivate = async (entry: DesktopProjectEntry) => {
    setActionError(null);
    setBusyId(entry.id);
    try {
      const nextState = await desktopApi.activateLocalProject(entry.path);
      onState?.(nextState);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionError(msg);
    } finally {
      setBusyId(null);
    }
  };

  const handleRemove = async (entry: DesktopProjectEntry) => {
    setActionError(null);
    setBusyId(entry.id);
    try {
      const nextState = await desktopApi.removeProject(entry.id);
      onState?.(nextState);
      setConfirmRemoveId(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionError(msg);
    } finally {
      setBusyId(null);
    }
  };

  const handleOpenFolder = async (entry: DesktopProjectEntry) => {
    try {
      await desktopApi.openProjectFolder(entry.path);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionError(msg);
    }
  };

  const handleCopyPath = (entry: DesktopProjectEntry) => {
    void navigator.clipboard.writeText(entry.path);
    setCopiedId(entry.id);
    setTimeout(() => {
      setCopiedId((prev) => (prev === entry.id ? null : prev));
    }, 2000);
  };

  return (
    <section
      className="page-section projects-page"
      aria-labelledby="projects-title"
      data-codegpt-page="projects"
    >
      <div className="page-header-row">
        <div>
          <h1 id="projects-title">{t("project.title")}</h1>
          <p className="lede">{t("project.description")}</p>
        </div>
        {totalCount > 0 && (
          <button
            className="primary-button add-project-btn"
            onClick={onChooseProject}
            disabled={operationBusy || Boolean(busyId)}
            data-codegpt-action={state.project ? "change-project" : "add-project"}
          >
            <svg
              className="btn-icon"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <line x1="10" y1="4" x2="10" y2="16" />
              <line x1="4" y1="10" x2="16" y2="10" />
            </svg>
            <span>{state.project ? t("project.change") : t("project.add")}</span>
          </button>
        )}
      </div>

      {actionError && (
        <div className="action-error-banner" role="alert">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)}>×</button>
        </div>
      )}

      {totalCount > 0 ? (
        <>
          <div className="projects-toolbar">
            <div className="projects-search-wrap">
              <svg
                className="search-icon"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <circle cx="8.5" cy="8.5" r="5.5" />
                <line x1="12.5" y1="12.5" x2="17" y2="17" />
              </svg>
              <input
                type="text"
                className="projects-search-input"
                placeholder={t("project.searchPlaceholder")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button
                  type="button"
                  className="search-clear-btn"
                  onClick={() => setSearchQuery("")}
                >
                  ×
                </button>
              )}
            </div>
            <div className="projects-summary-chip">
              <span className="summary-dot" />
              <span className="summary-stat">
                {t("project.countSummary", {
                  total: String(totalCount),
                  enabled: String(enabledCount),
                })}
              </span>
            </div>
          </div>

          <div className="project-cards-grid">
            {projects
              .filter((p) => {
                if (!searchQuery.trim()) return true;
                const q = searchQuery.toLowerCase();
                return (
                  p.name.toLowerCase().includes(q) ||
                  p.path.toLowerCase().includes(q)
                );
              })
              .map((project) => {
              const isBusy = busyId === project.id;
              const isRemoving = confirmRemoveId === project.id;
              const isDisabled = project.disabled;

              return (
                <article
                  key={project.id}
                  className={`project-card ${project.is_active ? "is-active" : ""} ${
                    isDisabled ? "is-disabled" : ""
                  }`}
                  data-codegpt-project={project.id}
                >
                  <div className="project-card-header">
                    <div className="project-avatar" aria-hidden="true">
                      {project.is_git_repository ? (
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        >
                          <circle cx="6" cy="6" r="3" />
                          <circle cx="6" cy="18" r="3" />
                          <circle cx="18" cy="9" r="3" />
                          <path d="M6 9v6" />
                          <path d="M9 9l6-3" />
                        </svg>
                      ) : (
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        >
                          <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
                        </svg>
                      )}
                    </div>

                    <div className="project-identity">
                      <div className="project-title-row">
                        <h3 className="project-name">{project.name}</h3>
                        <div className="badge-group">
                          {project.is_active && (
                            <span className="pill-badge pill-active">
                              <i className="status-dot-mini ready" />
                              {t("project.activeBadge")}
                            </span>
                          )}
                          {project.is_git_repository && (
                            <span className="pill-badge pill-git">Git</span>
                          )}
                        </div>
                      </div>
                      <span className="project-id-hint">ID: {project.id}</span>
                    </div>

                    {/* ChatGPT Access Toggle Switch */}
                    <div className="project-switch-block">
                      <div className="switch-text-row">
                        <span className="switch-title">
                          {t("project.chatgptAccess")}
                        </span>
                        <span
                          className={`switch-status-text ${
                            !isDisabled ? "status-on" : "status-off"
                          }`}
                        >
                          {!isDisabled
                            ? t("project.chatgptEnabled")
                            : t("project.chatgptDisabled")}
                        </span>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={!isDisabled}
                        aria-label={`${project.name} ChatGPT 访问控制`}
                        className={`modern-toggle-switch ${
                          !isDisabled ? "is-on" : "is-off"
                        }`}
                        onClick={() => void handleToggle(project)}
                        disabled={operationBusy || isBusy}
                        title={
                          isDisabled
                            ? t("project.chatgptDisabled")
                            : t("project.chatgptEnabled")
                        }
                      >
                        <span className="toggle-thumb" />
                      </button>
                    </div>
                  </div>

                  <div className="project-path-box">
                    <strong className="path-text" title={project.path}>
                      {project.path}
                    </strong>
                    <button
                      className="path-copy-btn"
                      onClick={() => handleCopyPath(project)}
                      title={t("project.copyPath")}
                    >
                      {copiedId === project.id ? (
                        <>
                          <svg
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            aria-hidden="true"
                          >
                            <polyline points="3 8 7 12 13 4" />
                          </svg>
                          <span>{t("project.pathCopied")}</span>
                        </>
                      ) : (
                        <>
                          <svg
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            aria-hidden="true"
                          >
                            <rect x="5" y="5" width="8" height="8" rx="1.5" />
                            <path d="M3 11V3a1 1 0 0 1 1-1h8" />
                          </svg>
                          <span>{t("project.copyPath")}</span>
                        </>
                      )}
                    </button>
                  </div>

                  {project.is_active && state.project && (
                    <div className="project-card-details">
                      <div className="detail-row">
                        <span className="detail-label">{t("project.status")}</span>
                        <span className="detail-val">{projectReadinessLabel(state.readiness.project, t)}</span>
                      </div>
                      <div className="detail-row">
                        <span className="detail-label">{t("project.git")}</span>
                        <span className="detail-val">
                          {state.project.is_git_repository
                            ? t("project.gitDetected")
                            : t("project.gitNotRequired")}
                        </span>
                      </div>
                      {state.project.allowed_root && state.project.allowed_root !== project.path && (
                        <div className="detail-row">
                          <span className="detail-label">{t("project.allowedRoot")}</span>
                          <span className="detail-val" title={state.project.allowed_root}>
                            {state.project.allowed_root}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Card Bottom Actions */}
                  <div className="project-card-footer">
                    <div className="card-actions-left">
                      {!project.is_active && (
                        <button
                          className="subtle-btn action-primary-tint"
                          onClick={() => void handleActivate(project)}
                          disabled={operationBusy || isBusy}
                          data-codegpt-action="set-active-project"
                        >
                          {t("project.setActive")}
                        </button>
                      )}
                      <button
                        className="subtle-btn"
                        onClick={() => void handleOpenFolder(project)}
                        title={t("project.openFinder")}
                        data-codegpt-action="open-in-finder"
                      >
                        <svg
                          className="btn-icon-inline"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                          aria-hidden="true"
                        >
                          <path d="M12 9v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h4" />
                          <polyline points="10 2 14 2 14 6" />
                          <line x1="7" y1="9" x2="14" y2="2" />
                        </svg>
                        {t("project.openFinder")}
                      </button>
                    </div>

                    <div className="card-actions-right">
                      {isRemoving ? (
                        <div className="inline-confirm-box">
                          <span className="confirm-prompt">确定移除？</span>
                          <button
                            className="danger-confirm-btn"
                            onClick={() => void handleRemove(project)}
                            disabled={operationBusy || isBusy}
                          >
                            确认
                          </button>
                          <button
                            className="cancel-btn"
                            onClick={() => setConfirmRemoveId(null)}
                          >
                            取消
                          </button>
                        </div>
                      ) : (
                        <button
                          className="subtle-btn btn-danger-tint"
                          onClick={() => setConfirmRemoveId(project.id)}
                          disabled={operationBusy || isBusy}
                          title={t("project.remove")}
                          data-codegpt-action="remove-project"
                        >
                          <svg
                            className="btn-icon-inline"
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            aria-hidden="true"
                          >
                            <polyline points="2 4 14 4" />
                            <path d="M5 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1" />
                            <path d="M12.5 4l-.8 9.2a1.5 1.5 0 0 1-1.5 1.4H5.8a1.5 1.5 0 0 1-1.5-1.4L3.5 4" />
                          </svg>
                          {t("project.remove")}
                        </button>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </>
      ) : (
        <div className="empty-project-state">
          <div className="empty-icon-wrap" aria-hidden="true">
            <svg
              className="empty-folder-svg"
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            >
              <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
              <line x1="12" y1="11" x2="12" y2="17" />
              <line x1="9" y1="14" x2="15" y2="14" />
            </svg>
          </div>
          <h3 className="empty-state-title">{t("project.emptyTitle")}</h3>
          <p className="empty-state-desc">{t("project.emptyDesc")}</p>
          <button
            className="primary-button hero-add-project-btn"
            onClick={onChooseProject}
            disabled={operationBusy}
            data-codegpt-action="add-project"
          >
            <svg
              className="btn-icon"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <line x1="10" y1="4" x2="10" y2="16" />
              <line x1="4" y1="10" x2="16" y2="10" />
            </svg>
            <span>{t("project.add")}</span>
            <kbd className="btn-shortcut">⌘O</kbd>
          </button>
        </div>
      )}
    </section>
  );
}
