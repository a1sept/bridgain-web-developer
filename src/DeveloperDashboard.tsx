import { useEffect, useMemo, useState } from "react";
import "./developer-dashboard.css";

export type DashboardProject = {
  repositoryUrls?: string[];
  id: string;
  name: string;
  description: string | null;
  status: string;
  members: { displayName: string }[];
};
type Request = {
  id: string;
  title: string;
  status: string;
  workflowStage?: string;
  priority: string;
  createdAt: string;
  creatorName: string;
  projectId: string;
  projectName: string;
};
type Props = {
  projects: DashboardProject[];
  userName: string;
  projectName?: string;
  refreshKey?: number;
  onOpenProject: (id: string) => void;
  onOpenRequest: (projectId: string, requestId: string) => void;
  onCreate: () => void;
};
const statusNames: Record<string, string> = {
  preparing: "준비 중",
  received: "요청 접수",
  in_progress: "진행 중",
  review: "검토",
  revision: "수정 요청",
  completed: "완료",
  released: "배포됨",
  active: "진행 중",
  archived: "보관됨",
};
const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
function Icon({ kind }: { kind: "folder" | "clock" | "check" | "alert" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <>
        {kind === "folder" ? (
          <path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
        ) : (
          <>
            <circle cx="12" cy="12" r="9" />
            {kind === "clock" ? (
              <path d="M12 6v6l4 2" />
            ) : kind === "check" ? (
              <path d="m8 12 3 3 5-6" />
            ) : (
              <path d="M12 7v6m0 3v1" />
            )}
          </>
        )}
      </>
    </svg>
  );
}

export default function DeveloperDashboard({
  projects,
  userName,
  projectName,
  refreshKey,
  onOpenRequest,
  onCreate,
}: Props) {
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const projectSource = JSON.stringify(
    projects.map(({ id, name }) => ({ id, name })),
  );
  useEffect(() => {
    const joinedProjects = JSON.parse(projectSource) as {
      id: string;
      name: string;
    }[];
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20000);
    let disposed = false;
    setLoading(true);
    setFailed(false);
    const load = async () => {
      let cursor = 0;
      const result: Request[] = [];
      await Promise.all(
        Array.from({ length: Math.min(4, joinedProjects.length) }, async () => {
          while (cursor < joinedProjects.length) {
            const project = joinedProjects[cursor++];
            const response = await fetch(
              `/api/workspace/projects/${encodeURIComponent(project.id)}/requests`,
              {
                credentials: "same-origin",
                cache: "no-store",
                signal: controller.signal,
              },
            );
            if (!response.ok) throw new Error("요청 목록을 불러오지 못했어요.");
            const data = (await response.json()) as {
              requests: Omit<Request, "projectId" | "projectName">[];
            };
            result.push(
              ...data.requests.map((item) => ({
                ...item,
                status: item.workflowStage || item.status,
                projectId: project.id,
                projectName: project.name,
              })),
            );
          }
        }),
      );
      if (!disposed)
        setRequests(
          result.sort(
            (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt),
          ),
        );
    };
    void load()
      .catch(() => {
        if (!disposed) {
          setFailed(true);
          controller.abort();
        }
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [projectSource, retry, refreshKey]);
  const filtered = useMemo(
    () =>
      requests.filter((item) =>
        `${item.title} ${item.projectName} ${item.creatorName}`
          .toLocaleLowerCase()
          .includes(query.toLocaleLowerCase()),
      ),
    [requests, query],
  );
  const completed = requests.filter((item) =>
    ["completed", "released"].includes(item.status),
  ).length;
  const inProgress = requests.filter((item) =>
    ["in_progress", "review", "revision"].includes(item.status),
  ).length;
  const urgent = requests.filter(
    (item) =>
      item.priority === "urgent" &&
      !["completed", "released"].includes(item.status),
  ).length;
  const metrics = [
    {
      label: projectName ? "전체 요청" : "전체 프로젝트",
      value: projectName ? requests.length : projects.length,
      icon: "folder" as const,
    },
    { label: "진행 중 요청", value: inProgress, icon: "clock" as const },
    { label: "완료 요청", value: completed, icon: "check" as const },
    { label: "긴급 요청", value: urgent, icon: "alert" as const },
  ];
  return (
    <div className="dd-dashboard">
      <div className="dd-intro">
        <div>
          <span className="dd-eyebrow">YOUR WORKSPACE</span>
          <h1>
            {projectName || (
              <>
                안녕하세요, {userName}님 <span aria-hidden="true">👋</span>
              </>
            )}
          </h1>
          <p>
            {projectName
              ? "이 프로젝트의 요청과 진행 상황을 한눈에 확인하세요."
              : "프로젝트와 요청의 진행 상황을 한눈에 확인하세요."}
          </p>
        </div>
        <button className="dd-primary" onClick={onCreate}>
          {projectName ? "요청 보기" : "＋ 새 프로젝트"}
        </button>
      </div>
      <div className="dd-metrics">
        {metrics.map((metric, index) => (
          <article
            className={`dd-metric dd-metric-${metric.icon}`}
            key={metric.label}
          >
            <span className="dd-metric-icon">
              <Icon kind={metric.icon} />
            </span>
            <p>{metric.label}</p>
            <strong>
              {(index > 0 || projectName) && (loading || failed)
                ? "—"
                : metric.value}
              <small>
                {(index > 0 || projectName) && (loading || failed)
                  ? loading
                    ? "불러오는 중"
                    : "확인 필요"
                  : "개"}
              </small>
            </strong>
          </article>
        ))}
      </div>
      <section className="dd-panel" aria-labelledby="dd-recent-title">
        <div className="dd-panel-heading">
          <div>
            <h2 id="dd-recent-title">{showAll ? "전체 요청" : "최근 요청"}</h2>
            <p>참여 중인 프로젝트에 등록된 요청이에요.</p>
          </div>
          <button
            className="dd-text-button"
            onClick={() => setShowAll(!showAll)}
          >
            {showAll ? "최근 요청만 보기" : "전체 보기"}{" "}
            <span aria-hidden="true">↗</span>
          </button>
        </div>
        <label className="dd-search">
          <span aria-hidden="true">⌕</span>
          <input
            aria-label="요청 검색"
            placeholder="요청 제목, 프로젝트, 요청자 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        {loading ? (
          <div className="dd-empty" role="status">
            요청을 불러오고 있어요.
          </div>
        ) : failed ? (
          <div className="dd-empty" role="alert">
            <h3>요청을 불러오지 못했어요.</h3>
            <p>연결 상태를 확인하고 다시 시도해주세요.</p>
            <button
              className="dd-secondary"
              onClick={() => setRetry((value) => value + 1)}
            >
              다시 시도
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="dd-empty">
            <span className="dd-empty-icon">
              <Icon kind="folder" />
            </span>
            <h3>
              {query ? "검색 결과가 없어요." : "아직 등록된 요청이 없어요."}
            </h3>
            <p>
              {query
                ? "다른 검색어로 찾아보세요."
                : "프로젝트에 요청이 등록되면 여기에서 확인할 수 있어요."}
            </p>
          </div>
        ) : (
          <div className="dd-table-scroll">
            <table className="dd-table">
              <thead>
                <tr>
                  <th>요청 제목</th>
                  <th>프로젝트</th>
                  <th>상태</th>
                  <th>작성일</th>
                  <th>요청자</th>
                </tr>
              </thead>
              <tbody>
                {(showAll ? filtered : filtered.slice(0, 8)).map((item) => (
                  <tr key={`${item.projectId}-${item.id}`}>
                    <td>
                      <button
                        className="dd-row-link"
                        onClick={() => onOpenRequest(item.projectId, item.id)}
                      >
                        {item.title}
                        {item.priority === "urgent" && (
                          <span className="dd-urgent-label">긴급</span>
                        )}
                      </button>
                    </td>
                    <td>{item.projectName}</td>
                    <td>
                      <span className={`dd-status dd-status-${item.status}`}>
                        {statusNames[item.status] ?? item.status}
                      </span>
                    </td>
                    <td>
                      <time dateTime={item.createdAt}>
                        {formatDate(item.createdAt)}
                      </time>
                    </td>
                    <td>{item.creatorName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export function DeveloperProjectList({
  projects,
  onOpenProject,
  onCreate,
}: Pick<Props, "projects" | "onOpenProject" | "onCreate">) {
  const [layout, setLayout] = useState<"list" | "grid">("list");
  const [query, setQuery] = useState("");
  const filtered = projects.filter((project) =>
    project.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
  );
  return (
    <div className="dd-projects">
      <div className="dd-intro">
        <div>
          <span className="dd-eyebrow">PROJECTS</span>
          <h1>프로젝트</h1>
          <p>함께 진행하는 프로젝트를 찾아보세요.</p>
        </div>
        <button className="dd-primary" onClick={onCreate}>
          ＋ 새 프로젝트
        </button>
      </div>
      <div className="dd-project-toolbar">
        <label className="dd-search">
          <span aria-hidden="true">⌕</span>
          <input
            aria-label="프로젝트 검색"
            placeholder="프로젝트 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div className="dd-view-toggle" aria-label="프로젝트 표시 방식">
          <button
            aria-pressed={layout === "list"}
            onClick={() => setLayout("list")}
          >
            ☷ 리스트형
          </button>
          <button
            aria-pressed={layout === "grid"}
            onClick={() => setLayout("grid")}
          >
            ▦ 폴더형
          </button>
        </div>
      </div>
      {filtered.length === 0 ? (
        <div className="dd-panel dd-empty">
          <h2>
            {query ? "검색 결과가 없어요." : "첫 프로젝트를 시작해보세요."}
          </h2>
          <p>
            {query
              ? "다른 프로젝트 이름을 입력해주세요."
              : "프로젝트를 만들고 함께할 멤버를 초대하세요."}
          </p>
          {!query && (
            <button className="dd-primary" onClick={onCreate}>
              프로젝트 만들기
            </button>
          )}
        </div>
      ) : layout === "grid" ? (
        <div className="dd-project-grid">
          {filtered.map((project) => (
            <button
              className="dd-project-card"
              key={project.id}
              onClick={() => onOpenProject(project.id)}
            >
              <div className="dd-card-top">
                <span className="dd-folder-icon">
                  <Icon kind="folder" />
                </span>
                <span className={`dd-status dd-status-${project.status}`}>
                  {statusNames[project.status] ?? project.status}
                </span>
              </div>
              <h2>{project.name}</h2>
              <p>{project.description || "프로젝트 소개가 아직 없어요."}</p>
              <div className="dd-card-bottom">
                <span>참여자 {project.members.length}명</span>
                <span>
                  {project.repositoryUrls?.length
                    ? `저장소 ${project.repositoryUrls.length}개 등록`
                    : "저장소 미등록"}
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="dd-panel dd-table-scroll">
          <table className="dd-table dd-project-table">
            <thead>
              <tr>
                <th>프로젝트명</th>
                <th>상태</th>
                <th>참여자</th>
                <th>저장소 연결</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((project) => (
                <tr key={project.id}>
                  <td>
                    <button
                      className="dd-row-link"
                      onClick={() => onOpenProject(project.id)}
                    >
                      <span className="dd-inline-folder">
                        <Icon kind="folder" />
                      </span>
                      {project.name}
                    </button>
                    <p className="dd-project-description">
                      {project.description || "프로젝트 소개가 아직 없어요."}
                    </p>
                  </td>
                  <td>
                    <span className={`dd-status dd-status-${project.status}`}>
                      {statusNames[project.status] ?? project.status}
                    </span>
                  </td>
                  <td>
                    <span>{project.members.length}명</span>
                    <small className="dd-member-names">
                      {project.members
                        .slice(0, 3)
                        .map((member) => member.displayName)
                        .join(", ")}
                      {project.members.length > 3 ? " 외" : ""}
                    </small>
                  </td>
                  <td>
                    <span className="dd-repository-status">
                      {project.repositoryUrls?.length
                        ? `${project.repositoryUrls.length}개 등록`
                        : "미등록"}
                    </span>
                    <small className="dd-member-names">
                      {project.repositoryUrls?.[0]?.replace(
                        "https://github.com/",
                        "",
                      ) || "프로젝트 설정에서 추가"}
                    </small>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
