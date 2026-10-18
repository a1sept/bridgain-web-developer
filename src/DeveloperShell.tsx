import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAi } from "./ai/AiWorkspace";
import "./developer-shell.css";
export type DeveloperView =
  "dashboard" | "projects" | "invitations" | "teams" | "approvals";
export type ProjectSection =
  | "overview"
  | "requests"
  | "tasks"
  | "meetings"
  | "documents"
  | "activity"
  | "members"
  | "settings"
  | "approvals";
type Props = {
  children: ReactNode;
  active: DeveloperView;
  userName: string;
  projects: { id: string; name: string; permissions?: string[] }[];
  selectedId?: string;
  projectPermissions?: string[];
  section?: ProjectSection;
  pending: number;
  approvalPending?: number;
  showApprovals?: boolean;
  onNavigate: (view: DeveloperView) => void;
  onProject: (id: string) => void;
  onSection: (section: ProjectSection) => void;
  onLogout: () => void;
};
const labels = {
  dashboard: "대시보드",
  projects: "프로젝트",
  invitations: "받은 초대",
  teams: "팀 관리",
  approvals: "승인함",
};
function Icon({ name }: { name: DeveloperView }) {
  return (
    <svg
      width="23"
      height="23"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === "dashboard" ? (
        <>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </>
      ) : name === "projects" ? (
        <path d="M3 7V5a2 2 0 0 1 2-2h5l3 4h6a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
      ) : name === "invitations" ? (
        <>
          <rect x="3" y="5" width="18" height="14" rx="3" />
          <path d="m3 7 9 6 9-6" />
        </>
      ) : (
        <>
          <circle cx="9" cy="8" r="3" />
          <path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5" />
        </>
      )}
    </svg>
  );
}
export default function DeveloperShell(p: Props) {
  const ai = useAi();
  useEffect(() => {
    const project = p.projects.find((x) => x.id === p.selectedId);
    if (project) ai.setProject(project);
  }, [p.selectedId, p.projects]);
  const [open, setOpen] = useState(false);
  const [contextHidden, setContextHidden] = useState(() => {
    try {
      return window.localStorage.getItem("bridgain-context-hidden") === "1";
    } catch {
      return false;
    }
  });
  const showContext = p.active === "projects" && !contextHidden;
  const toggleContext = (hidden: boolean) => {
    setContextHidden(hidden);
    try {
      window.localStorage.setItem(
        "bridgain-context-hidden",
        hidden ? "1" : "0",
      );
    } catch {}
  };
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!accountOpen) return;
    const close = (e: MouseEvent) => {
      if (!accountRef.current?.contains(e.target as Node))
        setAccountOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAccountOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [accountOpen]);
  const selected = p.projects.find((x) => x.id === p.selectedId);
  const act = (fn: () => void) => {
    fn();
    setOpen(false);
  };
  return (
    <div
      className={`ds-shell ${open ? "ds-menu-open" : ""} ${showContext ? "ds-with-context" : ""}`}
    >
      <header className="ds-mobile-bar">
        <button
          aria-label={open ? "메뉴 닫기" : "메뉴 열기"}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          ☰
        </button>
        <strong>{selected?.name || labels[p.active]}</strong>
        <span>bridgain.</span>
      </header>
      {open && (
        <button
          className="ds-scrim"
          aria-label="메뉴 닫기"
          onClick={() => setOpen(false)}
        />
      )}
      <aside className="ds-rail">
        <button
          className="ds-logo"
          aria-label="Bridgain 대시보드"
          onClick={() => act(() => p.onNavigate("dashboard"))}
        >
          b
        </button>
        <nav aria-label="개발자 전역 메뉴">
          {(Object.keys(labels) as DeveloperView[])
            .filter((v) => v !== "approvals" || p.showApprovals)
            .map((v) => (
              <button
                key={v}
                aria-current={p.active === v ? "page" : undefined}
                aria-expanded={
                  v === "projects" && p.active === "projects"
                    ? showContext
                    : undefined
                }
                onClick={() => {
                  // 데스크톱에서 현재 프로젝트 아이콘을 다시 누르면 VS Code처럼 사이드바를 접고 펼친다.
                  if (
                    v === "projects" &&
                    p.active === "projects" &&
                    window.matchMedia("(min-width: 761px)").matches
                  ) {
                    toggleContext(!contextHidden);
                    return;
                  }
                  if (v === "projects" && contextHidden) toggleContext(false);
                  act(() => p.onNavigate(v));
                }}
              >
                <Icon name={v} />
                <span>{labels[v]}</span>
                {v === "invitations" && p.pending > 0 && <i>{p.pending}</i>}
                {v === "approvals" && !!p.approvalPending && (
                  <i>{p.approvalPending}</i>
                )}
              </button>
            ))}
        </nav>
        <div className="ds-account" ref={accountRef}>
          <button
            className="ds-account-trigger"
            aria-label={`${p.userName} 계정 메뉴`}
            aria-expanded={accountOpen}
            onClick={() => setAccountOpen(!accountOpen)}
          >
            <span className="ds-avatar">{p.userName.slice(0, 1)}</span>
          </button>
          {accountOpen && (
            <div className="ds-account-menu">
              <strong title={p.userName}>{p.userName}</strong>
              <button
                onClick={() => {
                  setAccountOpen(false);
                  act(ai.openSettings);
                }}
              >
                AI 연결 설정
              </button>
              <button
                onClick={() => {
                  setAccountOpen(false);
                  act(ai.openPanel);
                }}
              >
                AI 채팅 열기
              </button>
              <button
                onClick={() => {
                  setAccountOpen(false);
                  p.onLogout();
                }}
              >
                로그아웃
              </button>
            </div>
          )}
        </div>
      </aside>
      {showContext && (
        <aside className="ds-context">
          <div className="ds-context-heading">
            <small>WORKSPACE</small>
            <strong>프로젝트</strong>
          </div>
          <button
            className="ds-context-back"
            aria-current={!selected ? "page" : undefined}
            onClick={() => act(() => p.onNavigate("projects"))}
          >
            모든 프로젝트 <span>{p.projects.length}</span>
          </button>
          <nav aria-label="프로젝트 바로가기">
            {p.projects.map((project) => (
              <button
                key={project.id}
                aria-current={selected?.id === project.id ? "page" : undefined}
                onClick={() => act(() => p.onProject(project.id))}
              >
                <span aria-hidden="true">▱ </span>
                {project.name}
              </button>
            ))}
          </nav>
          {!p.projects.length && (
            <p className="ds-context-empty">
              프로젝트를 만들면 여기에 표시돼요.
            </p>
          )}
        </aside>
      )}
      <div className="ds-content">
        {p.active === "projects" && selected && (
          <nav className="ds-project-tabs" aria-label="프로젝트 메뉴">
            {(
              [
                ["overview", "개요"],
                ["requests", "요청"],
                ["tasks", "업무"],
                ["approvals", "승인함"],
                ["meetings", "회의실"],
                ["documents", "문서"],
                ["activity", "활동 기록"],
                ["members", "참여자 관리"],
                ["settings", "설정"],
              ] as const
            ).filter(([key]) => {
              if (!p.projectPermissions) return true;
              const permission: Partial<Record<ProjectSection, string>> = {requests:"requests.read",tasks:"tasks.read",meetings:"meetings.read",documents:"documents.read",activity:"activity.read",settings:"project.settings"};
              return !permission[key] || p.projectPermissions.includes(permission[key]!);
            }).map(([key, label]) => (
              <button
                key={key}
                aria-current={p.section === key ? "page" : undefined}
                onClick={() => act(() => p.onSection(key))}
              >
                {label}
              </button>
            ))}
            <button
              className="ds-project-refresh"
              onClick={() => window.location.reload()}
            >
              새로고침
            </button>
          </nav>
        )}
        {p.children}
      </div>
    </div>
  );
}
