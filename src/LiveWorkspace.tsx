import ProjectChannel from "./ProjectChannel";
import ProjectMembers from "./ProjectMembers";
import Approvals, { workflowApi } from "./Approvals";
import type { RepositoryRelation } from "./RepositoryFields";
import ProjectSettings from "./ProjectSettings";
import ProjectTasks from "./ProjectTasks";
import Deployments from "./Deployments";
import ProjectResources from "./ProjectResources";
import ActivityHistory from "./ActivityHistory";
import ProjectOverview from "./ProjectOverview";
import DeveloperShell, {
  type DeveloperView,
  type ProjectSection,
} from "./DeveloperShell";
import DeveloperDashboard, { DeveloperProjectList } from "./DeveloperDashboard";
import RequestBoard from "./RequestBoard";
import CreateProjectPage from "./CreateProjectPage";
import MobileProjectAction from "./MobileProjectAction";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import "./project-workspace.css";
import "./live-workspace.css";

type User = { id: string; displayName: string; accountType: "client" | "team" };
type Member = {
  userId: string;
  displayName: string;
  accountType: "client" | "team";
  positions: string[];
  permissionRole?: string;
  canApproveMerge?: boolean;
  canApproveTasks?: boolean;
  accessRole?: string;
};
type Team = {
  id: string;
  name: string;
  permissionRole: string;
  members: Member[];
};
type Project = {
  repositoryUrls?: string[];
  repositoryRelations?: RepositoryRelation[];
  canManage: boolean;
  permissions?: string[];
  isOwner?: boolean;
  rolesConfigured?: boolean;
  id: string;
  teamId: string;
  name: string;
  description: string;
  status: string;
  members: Member[];
};
type Invitation = {
  id: string;
  projectId?: string;
  teamId?: string;
  projectName?: string;
  projectDescription?: string;
  createdAt?: string;
  teamName?: string;
  inviterName: string;
  inviteeId: string;
  inviteeName: string;
  inviteeAccountType?: string | null;
  status: string;
  direction: string;
};
type Workspace = {
  teams: Team[];
  projects: Project[];
  invitations: Invitation[];
  userId: string;
};
const positions: Record<string, string> = {
  planner: "기획자",
  designer: "디자이너",
  developer: "개발자",
};
const roles: Record<string, string> = {
  owner: "소유자",
  admin: "관리자",
  member: "일반 멤버",
  manager: "프로젝트 관리자",
  contributor: "참여자",
  client: "의뢰자",
};
const statuses: Record<string, string> = {
  preparing: "준비 중",
  in_progress: "진행 중",
  completed: "완료",
  pending: "대기 중",
  accepted: "수락됨",
  declined: "거절됨",
  canceled: "취소됨",
  expired: "만료됨",
};
async function request<T>(
  path: string,
  body?: object,
  method = "POST",
): Promise<T> {
  const signal = AbortSignal.timeout(15000);
  const headers: Record<string, string> = {};
  if (body !== undefined) {
    const csrf = await fetch("/api/auth/csrf", {
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
    if (!csrf.ok) throw new Error("보안 확인에 실패했어요. 다시 시도해주세요.");
    headers["X-CSRF-Token"] = (await csrf.json()).csrfToken;
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(`/api/workspace${path}`, {
    credentials: "same-origin",
    cache: "no-store",
    signal,
    headers,
    method: body === undefined ? "GET" : method,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = response.status === 204 ? undefined : await response.json();
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? "로그인이 만료되었어요. 새로고침 후 다시 로그인해주세요."
        : data?.message || "요청을 처리하지 못했어요. 다시 시도해주세요.",
    );
  return data as T;
}
function MemberEditor({
  member,
  team,
  busy,
  onSave,
}: {
  member: Member;
  team: Team;
  busy: boolean;
  onSave: (userId: string, body: object) => void;
}) {
  const [selected, setSelected] = useState(member.positions || []);
  const [role, setRole] = useState(member.permissionRole || "member");
  const [canApproveMerge, setCanApproveMerge] = useState(
    member.canApproveMerge ?? false,
  );
  const canEdit =
    team.permissionRole === "owner" ||
    (team.permissionRole === "admin" && member.permissionRole === "member");
  const canRole =
    team.permissionRole === "owner" && member.permissionRole !== "owner";
  return (
    <div className="lw-member-editor">
      <div className="pw-member">
        <span className="pw-avatar">{member.displayName.slice(0, 1)}</span>
        <div>
          <strong>{member.displayName}</strong>
          <p>
            {roles[member.permissionRole || "member"]}
            {member.canApproveMerge ? " · 병합 승인자" : ""}
          </p>
        </div>
      </div>
      {canEdit ? (
        <div className="lw-member-controls">
          <fieldset disabled={busy}>
            <legend className="lw-sr">{member.displayName} 직무</legend>
            {Object.entries(positions).map(([value, label]) => (
              <label key={value}>
                <input
                  type="checkbox"
                  checked={selected.includes(value)}
                  onChange={(e) =>
                    setSelected(
                      e.target.checked
                        ? [...selected, value]
                        : selected.filter((x) => x !== value),
                    )
                  }
                />
                {label}
              </label>
            ))}
          </fieldset>
          <label>
            <input
              type="checkbox"
              checked={canApproveMerge}
              disabled={busy || member.accountType !== "team"}
              onChange={(e) => setCanApproveMerge(e.target.checked)}
            />
            병합 승인자
          </label>
          {canRole && (
            <select
              aria-label={`${member.displayName} 관리 권한`}
              disabled={busy}
              value={role}
              onChange={(e) => setRole(e.target.value)}
            >
              <option value="member">일반 멤버</option>
              <option value="admin">관리자</option>
            </select>
          )}
          <button
            className="pw-secondary"
            disabled={busy}
            onClick={() =>
              onSave(member.userId, {
                positions: selected,
                canApproveMerge,
                ...(canRole ? { permissionRole: role } : {}),
              })
            }
          >
            저장
          </button>
        </div>
      ) : (
        <p className="pw-muted">
          {selected.map((x) => positions[x]).join(" · ") || "직무 미지정"}
        </p>
      )}
    </div>
  );
}
export default function LiveWorkspace({
  user,
  onLogout,
}: {
  user: User;
  onLogout: () => Promise<void>;
}) {
  const [requestPath, setRequestPath] = useState(window.location.pathname);
  function openRequests(id: string) {
    setView("projects");
    setCreating(false);
    const path = `/projects/${id}/requests`;
    window.history.pushState({}, "", path);
    setRequestPath(path);
    window.scrollTo(0, 0);
  }
  const [creating, setCreating] = useState(
    window.location.pathname === "/projects/new",
  );
  useEffect(() => {
    const onPop = () => {
      setCreating(window.location.pathname === "/projects/new");
      setRequestPath(window.location.pathname);
      const saved = window.history.state;
      setView(
        ["dashboard", "projects", "activity", "invitations", "teams", "approvals"].includes(
          saved?.developerView,
        )
          ? saved.developerView
          : "dashboard",
      );
      setProjectId(
        typeof saved?.projectId === "string" ? saved.projectId : null,
      );
      setProjectSection(
        [
          "overview",
          "tasks",
          "deployments",
          "approvals",
          "meetings",
          "documents",
          "activity",
          "channel",
          "members",
          "settings",
        ].includes(saved?.projectSection)
          ? saved.projectSection
          : "overview",
      );
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  function leaveCreate() {
    window.history.replaceState({}, "", "/");
    setRequestPath("/");
    setView("projects");
    setCreating(false);
  }
  const [data, setData] = useState<Workspace | null>(null);
  const [inviteDetailId, setInviteDetailId] = useState<string | null>(null);
  const inviteDialog = useRef<HTMLDialogElement>(null);
  const inviteDetail = data?.invitations.find(
    (i) => i.id === inviteDetailId && i.direction === "received",
  );
  useEffect(() => {
    if (inviteDetail && !inviteDialog.current?.open)
      inviteDialog.current?.showModal();
    if (!inviteDetail) inviteDialog.current?.close();
  }, [inviteDetail]);

  const [view, setView] = useState<DeveloperView>(() =>
    ["dashboard", "projects", "activity", "invitations", "teams", "approvals"].includes(
      window.history.state?.developerView,
    )
      ? window.history.state.developerView
      : "dashboard",
  );
  const [projectSection, setProjectSection] = useState<ProjectSection>(() =>
    [
      "overview",
      "tasks",
      "deployments",
      "approvals",
      "meetings",
      "documents",
      "activity",
      "channel",
      "members",
      "settings",
    ].includes(window.history.state?.projectSection)
      ? window.history.state.projectSection
      : "overview",
  );
  const [projectId, setProjectId] = useState<string | null>(() =>
    typeof window.history.state?.projectId === "string"
      ? window.history.state.projectId
      : null,
  );
  const [taskRequestId, setTaskRequestId] = useState<string | undefined>();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const lock = useRef(false);
  const [modal, setModal] = useState<"create" | "invite" | null>(null);
  const [target, setTarget] = useState<{
    type: "projects" | "teams";
    id: string;
    name: string;
  } | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [teamId, setTeamId] = useState("");
  const [inviteId, setInviteId] = useState("");
  const [found, setFound] = useState<User | null>(null);
  const [modalError, setModalError] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  const isTeam = user.accountType === "team";
  const [dashboardRefresh, setDashboardRefresh] = useState(0);
  const desktopBridge = window.bridgainDesktop;
  const codexProjectSignature =
    data && isTeam
      ? JSON.stringify(
          data.projects
            .filter((p) => p.canManage)
            .map((p) => [p.id, p.name])
            .sort((a, b) => a[0].localeCompare(b[0])),
        )
      : undefined;
  useEffect(() => {
    if (!desktopBridge?.syncProjects || codexProjectSignature === undefined)
      return;
    let active = true;
    void desktopBridge
      .syncProjects()
      .catch((error: unknown) => ({
        synced: 0,
        error:
          error instanceof Error
            ? error.message
            : "Codex 프로젝트 연결에 실패했어요.",
      }))
      .then((result) => {
        if (active)
          window.dispatchEvent(
            new CustomEvent("bridgain:codex-sync", { detail: result }),
          );
      });
    return () => {
      active = false;
    };
  }, [desktopBridge, codexProjectSignature, user.id]);

  const reload = useCallback(async () => {
    const next = await request<Workspace>("");
    setData(next);
    setDashboardRefresh((v) => v + 1);
  }, []);
  useEffect(() => {
    let active = true;
    request<Workspace>("")
      .then((next) => {
        if (active) setData(next);
      })
      .catch((err) => {
        if (active)
          setError(
            err instanceof Error ? err.message : "서버에 연결하지 못했어요.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (modal && !dialog.current?.open) dialog.current?.showModal();
    else if (!modal) dialog.current?.close();
  }, [modal]);
  async function run(
    action: () => Promise<void>,
    message = "",
    inModal = false,
  ) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setModalError("");
    setNotice("");
    try {
      await action();
      if (message) setNotice(message);
    } catch (err) {
      const text =
        err instanceof Error ? err.message : "서버에 연결하지 못했어요.";
      if (inModal && dialog.current?.open) setModalError(text);
      else setError(text);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function openCreate() {
    setView("projects");
    setProjectId(null);
    setRequestPath("/projects/new");
    window.history.pushState({}, "", "/projects/new");
    setCreating(true);
    window.scrollTo(0, 0);
  }
  function openInvite(
    type: "teams" | "projects",
    id: string,
    targetName: string,
  ) {
    setTarget({ type, id, name: targetName });
    setInviteId("");
    setFound(null);
    setModalError("");
    setModal("invite");
  }
  function navigate(next: typeof view) {
    setView(next);
    setProjectId(null);
    setCreating(false);
    setRequestPath("/");
    window.history.pushState({ developerView: next }, "", "/");
  }
  function openProject(id: string, section: ProjectSection = "overview") {
    setTaskRequestId(undefined);
    setView("projects");
    setCreating(false);
    setRequestPath("/");
    setProjectId(id);
    setProjectSection(section);
    window.history.pushState(
      { developerView: "projects", projectId: id, projectSection: section },
      "",
      "/",
    );
  }
  function openRequest(projectId: string, requestId: string) {
    openRequests(projectId);
    const path = `/projects/${projectId}/requests/${requestId}`;
    window.history.replaceState({}, "", path);
    setRequestPath(path);
  }
  async function copyId() {
    try {
      await navigator.clipboard.writeText(user.id);
      setNotice("내 사용자 ID를 복사했어요. 초대할 사람에게 전달해주세요.");
    } catch {
      setError("복사하지 못했어요. 화면의 사용자 ID를 직접 복사해주세요.");
    }
  }
  const project = data?.projects.find((p) => p.id === projectId);
  const [approvalPending, setApprovalPending] = useState(0);
  const [eligibleApproval, setEligibleApproval] = useState(false);
  useEffect(() => {
    let live = true;
    const load = () =>
      workflowApi<{
        pendingCount: number;
        canApproveTasks: boolean;
      }>("/approvals")
        .then((d) => {
          if (live) {
            setApprovalPending(d.pendingCount);
            setEligibleApproval(d.canApproveTasks);
          }
        })
        .catch(() => {});
    void load();
    const timer = window.setInterval(load, 30000);
    window.addEventListener("bridgain:approvals-changed", load);
    return () => {
      live = false;
      window.clearInterval(timer);
      window.removeEventListener("bridgain:approvals-changed", load);
    };
  }, [dashboardRefresh]);
  const showApprovals =
    eligibleApproval ||
    !!data?.projects.some((p) => p.permissions?.includes("approvals.work")) ||
    !!data?.teams.some((t) => ["owner", "admin"].includes(t.permissionRole)) ||
    !!data?.projects.some((p) =>
      p.members.some((m) => m.userId === user.id && m.canApproveTasks),
    );
  const team = data?.teams.find((t) => t.id === project?.teamId);
  const canManage = isTeam && project?.canManage === true;
  const received =
    data?.invitations.filter((i) => i.direction === "received") || [];
  const changeInvitation = (
    id: string,
    action: "accept" | "decline" | "cancel",
  ) =>
    void run(
      async () => {
        await request(`/invitations/${id}/respond`, { action });
        setInviteDetailId(null);
        await reload();
      },
      action === "accept"
        ? "초대를 수락했어요. 참여 목록을 확인해주세요."
        : action === "decline"
          ? "초대를 거절했어요."
          : "초대를 취소했어요.",
    );
  function submit(event: FormEvent) {
    event.preventDefault();
    void run(
      async () => {
        if (modal === "create") {
          await request("/projects", {
            name: name.trim(),
            description: description.trim(),
            ...(teamId ? { teamId } : {}),
          });
        } else if (modal === "invite" && target && found) {
          await request(`/${target.type}/${target.id}/invitations`, {
            userId: found.id,
          });
        } else return;
        setModal(null);
        await reload();
        setNotice("저장했어요.");
      },
      "",
      true,
    );
  }
  useEffect(() => {
    const changed = () => {
      void reload();
      setDashboardRefresh((v) => v + 1);
    };
    window.addEventListener("bridgain:ai-applied", changed);
    return () => window.removeEventListener("bridgain:ai-applied", changed);
  }, [reload]);
  useEffect(() => {
    const openSettings = (event: Event) => {
      const id = (event as CustomEvent<{ projectId: string }>).detail
        ?.projectId;
      if (id && data?.projects.some((p) => p.id === id))
        openProject(id, "settings");
    };
    window.addEventListener("bridgain:project-settings", openSettings);
    return () =>
      window.removeEventListener("bridgain:project-settings", openSettings);
  }, [data]);
  const requestProjectId = requestPath.match(
    /^\/projects\/([^/]+)\/requests(?:\/|$)/,
  )?.[1];
  function shell(children: ReactNode) {
    const selectedId = requestProjectId || projectId || undefined;
    return (
      <DeveloperShell
        active={requestProjectId || creating ? "projects" : view}
        userName={user.displayName}
        projects={data?.projects || []}
        selectedId={selectedId}
        projectPermissions={
          data?.projects.find((p) => p.id === selectedId)?.permissions
        }
        section={requestProjectId ? "requests" : projectSection}
        pending={received.filter((i) => i.status === "pending").length}
        approvalPending={approvalPending}
        showApprovals={showApprovals}
        onNavigate={navigate}
        onProject={openProject}
        onSection={(section) => {
          if (!selectedId) return;
          if (section === "requests") openRequests(selectedId);
          else openProject(selectedId, section);
        }}
        onLogout={() => void run(onLogout)}
      >
        {children}
      </DeveloperShell>
    );
  }
  if (requestProjectId && data) {
    const requestProject = data.projects.find((p) => p.id === requestProjectId);
    return shell(
      <RequestBoard
        onMeetings={(rid, meetingId) => {
          if (!requestProjectId) return;
          window.sessionStorage.removeItem("bridgain-open-meeting");
          window.sessionStorage.removeItem("bridgain-meeting-request");
          if (meetingId)
            window.sessionStorage.setItem("bridgain-open-meeting", meetingId);
          else window.sessionStorage.setItem("bridgain-meeting-request", rid);
          openProject(requestProjectId, "meetings");
        }}
        onTasks={(rid) => {
          openProject(requestProjectId, "tasks");
          setTaskRequestId(rid);
        }}
        user={user}
        project={requestProject}
        projects={data.projects}
        onBack={() => {
          openProject(requestProjectId);
        }}
        onInfo={() => {
          openProject(requestProjectId, "members");
        }}
      />,
    );
  }
  if (creating && isTeam && data)
    return shell(
      <CreateProjectPage
        user={user}
        teams={data.teams}
        onBack={leaveCreate}
        onLookup={(id) => request<User>(`/users/${encodeURIComponent(id)}`)}
        onSearch={async (query, type) =>
          (
            await request<{ users: User[] }>(
              `/users?q=${encodeURIComponent(query)}&accountType=${type}`,
            )
          ).users
        }
        onCreate={async (values) => {
          const created = await request<Project>("/projects", values);
          leaveCreate();
          setView("projects");
          setProjectId(created.id);
          setProjectSection("members");
          void run(
            reload,
            values.inviteeIds.length
              ? "프로젝트를 만들고 참여 초대를 보냈어요."
              : "프로젝트를 만들었어요.",
          );
        }}
      />,
    );
  return shell(
    <div className={`pw-shell lw-shell${view === "activity" || (view === "projects" && project && projectSection === "activity") ? " lw-activity-shell" : ""}`}>
      <div className="pw-body">
        {view !== "activity" && !(view === "projects" && project) && (
          <header className="pw-topbar">
            <div className="project-page-title">
              <strong>
                {view === "dashboard"
                  ? "대시보드"
                  : view === "projects"
                    ? project
                      ? project.name
                      : "프로젝트"
                    : view === "teams"
                      ? "팀 관리"
                      : "받은 초대"}
              </strong>
            </div>
            <button
              className="pw-secondary"
              disabled={busy || loading}
              onClick={() => void run(reload, "최신 목록을 불러왔어요.")}
            >
              새로고침
            </button>
          </header>
        )}
        <main className="pw-main">
          {error && (
            <div className="lw-alert" role="alert">
              {error}
              <button
                className="pw-text-button"
                disabled={busy}
                onClick={() => void run(reload)}
              >
                다시 시도
              </button>
            </div>
          )}
          {notice && (
            <p className="lw-notice" role="status">
              {notice}
            </p>
          )}
          {loading ? (
            <section className="pw-empty" role="status">
              <h2>내 공간을 불러오고 있어요</h2>
              <p>잠시만 기다려주세요.</p>
            </section>
          ) : !data ? (
            <section className="pw-empty">
              <h2>목록을 불러오지 못했어요</h2>
              <p>연결을 확인한 뒤 다시 시도해주세요.</p>
            </section>
          ) : (
            <>
              {view === "activity" && <ActivityHistory currentUser={user} refreshKey={dashboardRefresh} />}
              {view === "approvals" && (
                <Approvals
                  onTask={(pid, tid) => {
                    window.sessionStorage.setItem("bridgain-task", tid);
                    openProject(pid, "tasks");
                  }}
                  onChanged={() => {
                    setDashboardRefresh((v) => v + 1);
                    void reload();
                  }}
                />
              )}
              {view === "dashboard" && (
                <DeveloperDashboard
                  refreshKey={dashboardRefresh}
                  userName={user.displayName}
                  projects={data.projects}
                  onOpenProject={openProject}
                  onOpenRequest={openRequest}
                  onCreate={openCreate}
                />
              )}
              {view === "projects" && !project && (
                <DeveloperProjectList
                  projects={data.projects}
                  onOpenProject={openProject}
                  onCreate={openCreate}
                />
              )}
              {view === "projects" &&
                project &&
                projectSection === "overview" && (
                  <ProjectOverview
                    project={project}
                    refreshKey={dashboardRefresh}
                    onSection={(section) =>
                      section === "requests"
                        ? openRequests(project.id)
                        : openProject(project.id, section)
                    }
                    onOpenRequest={(rid) => openRequest(project.id, rid)}
                  />
                )}
              {view === "projects" &&
                project &&
                projectSection === "settings" && (
                  <ProjectSettings
                    key={project.id}
                    project={project}
                    canManage={
                      project.permissions
                        ? project.permissions.includes("project.settings")
                        : canManage
                    }
                    onSave={async (values) => {
                      await request(`/projects/${project.id}`, values, "PATCH");
                      await reload();
                    }}
                  />
                )}
              {view === "projects" &&
                project &&
                projectSection === "approvals" && (
                  <Approvals
                    projectId={project.id}
                    onTask={(pid, tid) => {
                      window.sessionStorage.setItem("bridgain-task", tid);
                      openProject(pid, "tasks");
                    }}
                    onChanged={() => {
                      setDashboardRefresh((v) => v + 1);
                      void reload();
                    }}
                  />
                )}
              {view === "projects" &&
                project &&
                projectSection === "deployments" && (
                  <Deployments
                    projectId={project.id}
                    canDeploy={!!project.permissions?.includes("deploy.run")}
                    refreshKey={dashboardRefresh}
                    onChanged={() => {
                      setDashboardRefresh((v) => v + 1);
                      void reload();
                    }}
                    onTask={(tid) => {
                      window.sessionStorage.setItem("bridgain-task", tid);
                      openProject(project.id, "tasks");
                    }}
                  />
                )}
              {view === "projects" &&
                project &&
                projectSection === "channel" && (
                  <ProjectChannel
                    key={project.id}
                    projectId={project.id}
                    onOpen={(kind, id) => {
                      if (kind === "task") {
                        window.sessionStorage.setItem("bridgain-task", id);
                        openProject(project.id, "tasks");
                      } else {
                        window.sessionStorage.setItem(
                          "bridgain-open-meeting",
                          id,
                        );
                        openProject(project.id, "meetings");
                      }
                    }}
                  />
                )}
              {view === "projects" && project && projectSection === "tasks" && (
                <ProjectTasks
                  refreshKey={dashboardRefresh}
                  key={project.id}
                  project={project}
                  userId={user.id}
                  onDocument={(documentId, versionId) => {
                    window.sessionStorage.setItem(
                      "bridgain-document-version",
                      JSON.stringify({ documentId, versionId }),
                    );
                    openProject(project.id, "documents");
                  }}
                  onCreateRequest={() => {
                    window.history.pushState(
                      {},
                      "",
                      `/projects/${project.id}/requests/new?origin=development`,
                    );
                    window.dispatchEvent(new PopStateEvent("popstate"));
                  }}
                  onApprovals={() => openProject(project.id, "approvals")}
                  onDeployments={() => openProject(project.id, "deployments")}
                  initialRequestId={taskRequestId}
                  onOpenRequest={(rid) => openRequest(project.id, rid)}
                  onChanged={() => setDashboardRefresh((v) => v + 1)}
                />
              )}
              {view === "projects" &&
                project &&
                (projectSection === "meetings" ||
                  projectSection === "documents" ||
                  projectSection === "activity") && (
                  projectSection === "activity" ? (
                    <ActivityHistory currentUser={user} refreshKey={dashboardRefresh} project={{id:project.id,name:project.name}} />
                  ) : (
                  <ProjectResources
                    refreshKey={dashboardRefresh}
                    key={`${project.id}/${projectSection}`}
                    projectId={project.id}
                    permissions={project.permissions}
                    rolesConfigured={project.rolesConfigured}
                    members={project.members}
                    onApprovals={() => openProject(project.id, "approvals")}
                    onTask={(tid) => {
                      window.sessionStorage.setItem("bridgain-task", tid);
                      openProject(project.id, "tasks");
                    }}
                    section={projectSection}
                    onChanged={() => setDashboardRefresh((v) => v + 1)}
                  />
                  )
                )}
              {view === "projects" &&
                project &&
                projectSection === "members" && (
                  <>
                    <button
                      className="pw-back"
                      onClick={() => navigate("projects")}
                    >
                      ← 프로젝트 목록
                    </button>
                    <div className="pw-heading">
                      <div>
                        <p className="pw-eyebrow">PROJECT</p>
                        <h1>{project.name}</h1>
                        <button
                          className="pw-text-button"
                          onClick={() => openRequests(project.id)}
                        >
                          요청 목록 보기 →
                        </button>
                        <p>{project.description || "등록된 설명이 없어요."}</p>
                      </div>
                      {canManage && (
                        <div className="lw-actions">
                          <button
                            className="pw-primary"
                            onClick={() =>
                              openInvite("projects", project.id, project.name)
                            }
                          >
                            참여자 초대
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="pm-members-layout">
                      <ProjectMembers
                        key={project.id}
                        projectId={project.id}
                        members={project.members}
                        userId={user.id}
                        onChanged={reload}
                        invitations={data.invitations.filter(
                          (i) =>
                            i.projectId === project.id &&
                            i.direction === "sent",
                        )}
                        canManageInvitations={canManage}
                        invitationBusy={busy}
                        onCancelInvitation={(id) =>
                          changeInvitation(id, "cancel")
                        }
                      />
                    </div>
                  </>
                )}
              {view === "invitations" && (
                <>
                  <div className="pw-heading">
                    <div>
                      <p className="pw-eyebrow">LET'S CONNECT</p>
                      <h1>
                        함께하자는 초대<span>.</span>
                      </h1>
                      <p>초대 내용을 확인하고 참여를 결정하세요.</p>
                    </div>
                    <button
                      className="pw-secondary"
                      onClick={() => void copyId()}
                    >
                      내 ID 복사
                    </button>
                  </div>
                  <code className="lw-inline-id">{user.id}</code>
                  {received.map((i) => (
                    <section
                      className={`pw-invitation lw-invite-card ${i.status === "pending" ? "is-pending" : ""}`}
                      key={i.id}
                    >
                      <div className="lw-invite-top">
                        <span className="lw-envelope" aria-hidden="true">
                          <svg
                            width="24"
                            height="24"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <rect x="3" y="5" width="18" height="14" rx="3" />
                            <path d="m4 7 8 6 8-6" />
                          </svg>
                        </span>
                        <span className={`lw-invite-status status-${i.status}`}>
                          {statuses[i.status]}
                        </span>
                      </div>
                      <div className="pw-invitation-copy">
                        <p className="pw-eyebrow">
                          {i.projectId ? "프로젝트 초대" : "팀 초대"}
                        </p>
                        <h2>
                          {i.status === "accepted" && i.projectId ? (
                            <a
                              className="lw-invite-project-link"
                              href={`/projects/${i.projectId}/requests`}
                              onClick={(event) => {
                                if (
                                  event.button !== 0 ||
                                  event.metaKey ||
                                  event.ctrlKey ||
                                  event.shiftKey ||
                                  event.altKey
                                )
                                  return;
                                event.preventDefault();
                                openRequests(i.projectId!);
                              }}
                            >
                              {i.projectName || i.teamName}
                              <span aria-hidden="true"> ↗</span>
                            </a>
                          ) : i.status === "pending" ? (
                            <button
                              type="button"
                              className="lw-invite-open"
                              onClick={() => {
                                setError("");
                                setInviteDetailId(i.id);
                              }}
                            >
                              {i.projectName || i.teamName}
                              <span aria-hidden="true"> ›</span>
                            </button>
                          ) : (
                            i.projectName || i.teamName
                          )}
                        </h2>
                        <p>{i.inviterName}님이 초대했어요.</p>
                        {isTeam && i.status === "pending" && (
                          <p>
                            수락하면 프로젝트와 소유 개발팀에 함께 참여해요.
                          </p>
                        )}
                      </div>
                      {i.status === "pending" && (
                        <p className="lw-invite-hint">
                          초대 내용 확인하기 <span aria-hidden="true">→</span>
                        </p>
                      )}
                    </section>
                  ))}
                  {!received.length && (
                    <section className="pw-empty">
                      <h3>받은 초대가 없어요</h3>
                      <p>내 사용자 ID를 전달하고 초대를 기다려주세요.</p>
                    </section>
                  )}
                </>
              )}
              {view === "teams" && isTeam && (
                <>
                  <div className="pw-heading">
                    <div>
                      <p className="pw-eyebrow">OUR TEAM</p>
                      <h1>
                        각자의 전문성을 한곳에<span>.</span>
                      </h1>
                      <p>
                        직무와 병합 승인 권한은 관리 역할과 별도로 지정해요.
                        소유자는 모든 팀원, 관리자는 일반 멤버의 승인 권한을
                        변경할 수 있어요.
                      </p>
                    </div>
                  </div>
                  {data.teams.map((t) => (
                    <section className="pw-panel lw-section" key={t.id}>
                      <div className="pw-panel-title">
                        <h2>
                          {t.name} <span>{roles[t.permissionRole]}</span>
                        </h2>
                      </div>
                      {t.members.map((m) => (
                        <MemberEditor
                          key={`${m.userId}:${m.permissionRole}:${m.canApproveMerge}:${(m.positions || []).join(",")}`}
                          member={m}
                          team={t}
                          busy={busy}
                          onSave={(id, body) =>
                            void run(async () => {
                              await request(
                                `/teams/${t.id}/members/${id}`,
                                body,
                                "PATCH",
                              );
                              await reload();
                            }, "팀원 정보를 저장했어요.")
                          }
                        />
                      ))}
                    </section>
                  ))}
                  {!data.teams.length && (
                    <section className="pw-empty">
                      <h3>아직 소속된 팀이 없어요</h3>
                      <p>
                        프로젝트를 처음 만들면 1인 팀이 생성됩니다. 다른 팀의
                        초대를 받아 참여할 수도 있어요.
                      </p>
                      <button className="pw-primary" onClick={openCreate}>
                        프로젝트 만들기
                      </button>
                    </section>
                  )}
                </>
              )}
            </>
          )}
        </main>
      </div>
      {isTeam &&
        data &&
        !loading &&
        view === "projects" &&
        !project &&
        !modal && <MobileProjectAction onCreate={openCreate} disabled={busy} />}
      <dialog
        className="pw-dialog"
        ref={dialog}
        aria-label={modal === "invite" ? "참여자 초대" : "프로젝트 만들기"}
        onCancel={(e) => {
          if (busy) e.preventDefault();
          else setModal(null);
        }}
        onClose={() => setModal(null)}
      >
        <button
          className="pw-dialog-close"
          aria-label="닫기"
          disabled={busy}
          onClick={() => setModal(null)}
        >
          ×
        </button>
        <form onSubmit={submit}>
          <h2>
            {modal === "invite"
              ? "함께할 사람을 초대해요"
              : "새 프로젝트를 시작해요"}
          </h2>
          <fieldset disabled={busy}>
            {modal === "invite" ? (
              <>
                <p>
                  {target?.name} ·{" "}
                  {target?.type === "teams"
                    ? "개발팀 계정만 팀에 참여할 수 있어요."
                    : "가입된 개발팀 계정 또는 의뢰자를 초대하세요."}
                </p>
                <label>
                  <span>사용자 ID</span>
                  <div className="pw-lookup">
                    <input
                      required
                      value={inviteId}
                      onChange={(e) => {
                        setInviteId(e.target.value);
                        setFound(null);
                      }}
                      placeholder="초대할 사람의 사용자 ID"
                    />
                    <button
                      type="button"
                      className="pw-secondary"
                      disabled={!inviteId.trim() || busy}
                      onClick={() =>
                        void run(
                          async () => {
                            setFound(null);
                            const result = await request<User>(
                              `/users/${encodeURIComponent(inviteId.trim())}`,
                            );
                            setFound(result);
                          },
                          "",
                          true,
                        )
                      }
                    >
                      계정 확인
                    </button>
                  </div>
                </label>
                {found && (
                  <div className="pw-found">
                    <strong>{found.displayName}</strong>
                    <p>
                      {found.accountType === "client" ? "의뢰자" : "개발팀"}{" "}
                      계정
                    </p>
                  </div>
                )}
              </>
            ) : (
              <>
                <label>
                  <span>프로젝트 이름</span>
                  <input
                    required
                    maxLength={100}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="어떤 프로젝트를 시작하나요?"
                  />
                </label>
                <label>
                  <span>설명</span>
                  <textarea
                    maxLength={2000}
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="함께할 사람들에게 프로젝트를 소개해주세요"
                  />
                </label>
                {modal === "create" && (
                  <label>
                    <span>소유 팀</span>
                    <select
                      value={teamId}
                      onChange={(e) => setTeamId(e.target.value)}
                    >
                      <option value="">내 팀 자동 선택 / 없으면 생성</option>
                      {data?.teams
                        .filter((t) =>
                          ["owner", "admin"].includes(t.permissionRole),
                        )
                        .map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
              </>
            )}
            {modalError && (
              <p className="pw-error" role="alert">
                {modalError}
              </p>
            )}
            <div className="pw-dialog-footer">
              <button
                type="button"
                className="pw-secondary"
                onClick={() => setModal(null)}
              >
                취소
              </button>
              <button
                className="pw-primary"
                type="submit"
                disabled={busy || (modal === "invite" ? !found : !name.trim())}
              >
                {busy
                  ? "처리 중…"
                  : modal === "invite"
                    ? "초대 보내기"
                    : "저장"}
              </button>
            </div>
          </fieldset>
        </form>
      </dialog>
      <dialog
        ref={inviteDialog}
        className="lw-invite-detail"
        aria-labelledby="invite-detail-title"
        onCancel={(event) => {
          if (busy) event.preventDefault();
          else setInviteDetailId(null);
        }}
        onClose={() => setInviteDetailId(null)}
      >
        {inviteDetail && (
          <>
            <header>
              <span>받은 초대</span>
              <button
                type="button"
                aria-label="초대 상세 닫기"
                disabled={busy}
                onClick={() => setInviteDetailId(null)}
              >
                ×
              </button>
            </header>
            <div className="lw-invite-detail-body">
              <span className="lw-invite-status">
                {statuses[inviteDetail.status]}
              </span>
              <h2 id="invite-detail-title">
                {inviteDetail.projectName || inviteDetail.teamName}
              </h2>
              <p>
                {inviteDetail.inviterName}님이 함께할 프로젝트에 초대했어요.
              </p>
              <dl>
                <div>
                  <dt>초대한 사람</dt>
                  <dd>{inviteDetail.inviterName}</dd>
                </div>
                <div>
                  <dt>참여 역할</dt>
                  <dd>{isTeam ? "개발팀 참여자" : "의뢰자"}</dd>
                </div>
                {inviteDetail.createdAt && (
                  <div>
                    <dt>초대 일시</dt>
                    <dd>
                      {new Date(inviteDetail.createdAt).toLocaleDateString(
                        "ko-KR",
                      )}
                    </dd>
                  </div>
                )}
              </dl>
              <h3>프로젝트 소개</h3>
              <p className="lw-invite-description">
                {inviteDetail.projectDescription ||
                  "등록된 프로젝트 설명이 없어요."}
              </p>
              <p className="lw-invite-detail-note">
                {isTeam
                  ? "수락하면 프로젝트와 소유 개발팀에 함께 참여해요."
                  : "수락하면 프로젝트의 요청 목록을 확인하고 새로운 요청을 작성할 수 있어요."}
              </p>
              {error && (
                <p role="alert" className="lw-alert">
                  {error}
                </p>
              )}
            </div>
            {inviteDetail.status === "pending" && (
              <footer>
                <button
                  type="button"
                  className="pw-secondary"
                  disabled={busy}
                  onClick={() => changeInvitation(inviteDetail.id, "decline")}
                >
                  거절
                </button>
                <button
                  type="button"
                  className="pw-primary"
                  disabled={busy}
                  onClick={() => changeInvitation(inviteDetail.id, "accept")}
                >
                  {busy ? "처리 중…" : "초대 수락"}
                </button>
              </footer>
            )}
          </>
        )}
      </dialog>
    </div>,
  );
}
