import { useEffect, useState } from "react";
import "./project-overview.css";

type Member = { userId: string; displayName: string; accountType: string };
type Request = {
  id: string;
  title: string;
  status: string;
  workflowStage?: string;
  type: string;
  priority: string;
  createdAt: string;
  creatorName: string;
};
type Task = {
  id: string;
  title: string;
  status: string;
  assignees: { displayName: string }[];
  dueDate?: string | null;
};
type Meeting = {
  id: string;
  title: string;
  scheduledAt: string;
  durationMinutes: number;
  location?: string | null;
  notes?: string | null;
  status: string;
};
type Section =
  "requests" | "tasks" | "meetings" | "documents" | "activity" | "members";
type Props = {
  project: {
    id: string;
    name: string;
    description?: string | null;
    members: Member[];
  };
  onSection: (section: Section) => void;
  onOpenRequest: (id: string) => void;
  refreshKey?: number;
};
const priorities: Record<string, string> = {
  urgent: "긴급",
  high: "높음",
  normal: "보통",
  low: "낮음",
};
const types: Record<string, string> = {
  feature: "기능 추가",
  bug: "버그 수정",
  other: "기타",
};
const statuses: Record<string, string> = {
  todo: "진행 전",
  in_progress: "진행 중",
  done: "개발 완료",
  released: "배포 완료",
  completed: "완료",
  review: "검토 중",
  blocked: "보류",
};
const formatDate = (value: string, time = false) =>
  new Date(value).toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(time ? ({ hour: "2-digit", minute: "2-digit" } as const) : {}),
  });
export default function ProjectOverview({
  project,
  onSection,
  onOpenRequest,
  refreshKey,
}: Props) {
  const [data, setData] = useState<{
    requests: Request[];
    tasks: Task[];
    meetings: Meeting[];
  } | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError("");
    const read = async <T,>(section: string): Promise<T> => {
      const response = await fetch(
        `/api/workspace/projects/${project.id}/${section}`,
        {
          signal: controller.signal,
          credentials: "same-origin",
          cache: "no-store",
        },
      );
      if (!response.ok)
        throw new Error(
          "프로젝트 현황을 불러오지 못했어요. 다시 시도해주세요.",
        );
      return response.json();
    };
    Promise.all([
      read<{ requests: Request[] }>("requests"),
      read<{ tasks: Task[] }>("tasks"),
      read<{ meetings: Meeting[] }>("meetings"),
    ])
      .then(([requests, tasks, meetings]) => {
        if (!controller.signal.aborted)
          setData({
            requests: requests.requests.map((r) => ({
              ...r,
              status: r.workflowStage || r.status,
            })),
            tasks: tasks.tasks,
            meetings: meetings.meetings,
          });
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error
              ? e.message
              : "프로젝트 현황을 불러오지 못했어요.",
          );
      });
    return () => controller.abort();
  }, [project.id, refreshKey, retry]);
  const heading = (title: string, section: Section, action = "전체 보기") => (
    <div className="po-card-heading">
      <h2>{title}</h2>
      <button type="button" onClick={() => onSection(section)}>
        {action}
        <span aria-hidden="true"> ›</span>
      </button>
    </div>
  );
  const empty = (text: string, section: Section, action: string) => (
    <div className="po-empty">
      <p>{text}</p>
      <button type="button" onClick={() => onSection(section)}>
        {action} →
      </button>
    </div>
  );
  const complete =
    data?.requests.filter((r) => ["completed", "released"].includes(r.status))
      .length ?? 0;
  const percent = data?.requests.length
    ? Math.round((complete / data.requests.length) * 100)
    : 0;
  const pending =
    data?.requests.filter((r) => ["review", "revision"].includes(r.status)) ??
    [];
  const scheduled =
    data?.meetings
      .filter(
        (m) =>
          m.status !== "cancelled" &&
          m.status !== "completed" &&
          new Date(m.scheduledAt).getTime() >= Date.now(),
      )
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
      .slice(0, 3) ?? [];
  const recent =
    data?.meetings
      .filter(
        (m) =>
          m.status !== "cancelled" &&
          (m.status === "completed" ||
            new Date(m.scheduledAt).getTime() < Date.now()),
      )
      .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))
      .slice(0, 2) ?? [];
  return (
    <section className="po-page" aria-label={`${project.name} 개요`}>
      <header className="po-header">
        <div>
          <span>{project.name}</span>
          <h1>
            개요 <small>Overview</small>
          </h1>
          <p>요청부터 개발 업무까지, 프로젝트 현황을 한눈에 확인하세요.</p>
        </div>
        <button
          type="button"
          className="po-primary"
          onClick={() => onSection("tasks")}
        >
          ＋ 업무 관리
        </button>
      </header>
      {error ? (
        <div className="po-error" role="alert">
          {error}
          <button type="button" onClick={() => setRetry((n) => n + 1)}>
            다시 시도
          </button>
        </div>
      ) : !data ? (
        <p className="po-loading" role="status">
          프로젝트 현황을 불러오는 중이에요.
        </p>
      ) : (
        <div className="po-layout">
          <div className="po-main">
            <div className="po-top">
              <section className="po-card">
                <h2>요청 완료율</h2>
                <div className="po-progress">
                  <strong>
                    {percent}
                    <small>%</small>
                  </strong>
                  <progress
                    max="100"
                    value={percent}
                    aria-label="요청 완료율"
                  />
                </div>
                <p className="po-muted">
                  전체 {data.requests.length}개 요청 중 {complete}개 완료·배포
                </p>
              </section>
              <section className="po-card">
                {heading("검토·확인 필요한 요청", "requests", "요청 보기")}
                {pending.length ? (
                  <ul className="po-pending">
                    {pending.slice(0, 3).map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => onOpenRequest(r.id)}
                        >
                          <span>{r.title}</span>
                          <span className={`po-badge ${r.status}`}>
                            {r.status === "review" ? "검토" : "검토"}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="po-muted">검토·수정 단계의 요청이 없어요.</p>
                )}
              </section>
            </div>
            <section className="po-card">
              {heading("요청", "requests")}
              {data.requests.length ? (
                <div className="po-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>요청 내용</th>
                        <th>우선순위</th>
                        <th>유형</th>
                        <th>요청일</th>
                        <th>요청자</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...data.requests]
                        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                        .slice(0, 5)
                        .map((r) => (
                          <tr key={r.id}>
                            <td>
                              <button
                                className="po-title-link"
                                type="button"
                                onClick={() => onOpenRequest(r.id)}
                              >
                                {r.title}
                                <small>요청 상세 보기</small>
                              </button>
                            </td>
                            <td>
                              <span className={`po-badge ${r.priority}`}>
                                {priorities[r.priority] ?? r.priority}
                              </span>
                            </td>
                            <td>{types[r.type] ?? r.type}</td>
                            <td>{formatDate(r.createdAt)}</td>
                            <td>{r.creatorName}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                empty("아직 등록된 요청이 없어요.", "requests", "요청 보기")
              )}
            </section>
            <section className="po-card">
              {heading("업무 Task", "tasks", "보드로 가기")}
              {data.tasks.length ? (
                <div className="po-table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>상태</th>
                        <th>업무</th>
                        <th>담당자</th>
                        <th>기한</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.tasks.slice(0, 6).map((t) => (
                        <tr key={t.id}>
                          <td>
                            <span className={`po-badge ${t.status}`}>
                              {statuses[t.status] ?? t.status}
                            </span>
                          </td>
                          <td>
                            <button
                              className="po-title-link"
                              type="button"
                              onClick={() => onSection("tasks")}
                            >
                              {t.title}
                            </button>
                          </td>
                          <td>
                            {t.assignees.map((a) => a.displayName).join(", ") ||
                              "미배정"}
                          </td>
                          <td>{t.dueDate ? formatDate(t.dueDate) : "미정"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                empty(
                  "요청을 등록하고 회의 또는 긴급 승인 절차를 진행해주세요.",
                  "tasks",
                  "업무 관리하기",
                )
              )}
            </section>
          </div>
          <aside className="po-aside">
            <section className="po-card">
              {heading("프로젝트 참여자", "members", "관리")}
              <ul className="po-members">
                {project.members.slice(0, 6).map((m) => (
                  <li key={m.userId}>
                    <span className="po-avatar" aria-hidden="true">
                      {m.displayName.slice(0, 1)}
                    </span>
                    <div>
                      <strong>{m.displayName}</strong>
                      <small>
                        {m.accountType === "client" ? "의뢰자" : "개발팀"}
                      </small>
                    </div>
                  </li>
                ))}
              </ul>
              {project.members.length > 6 && (
                <p className="po-muted">외 {project.members.length - 6}명</p>
              )}
            </section>
            <section className="po-card">
              {heading("회의", "meetings", "회의실")}
              <h3>예정된 회의</h3>
              {scheduled.length ? (
                scheduled.map((m) => (
                  <button
                    type="button"
                    className="po-meeting"
                    key={m.id}
                    onClick={() => onSection("meetings")}
                  >
                    <time>{formatDate(m.scheduledAt, true)}</time>
                    <strong>{m.title}</strong>
                    <span>
                      {m.durationMinutes}분
                      {m.location ? ` · ${m.location}` : ""}
                    </span>
                  </button>
                ))
              ) : (
                <p className="po-muted">예정된 회의가 없어요.</p>
              )}
              <div className="po-divider" />
              <h3>최근 회의</h3>
              {recent.length ? (
                recent.map((m) => (
                  <button
                    type="button"
                    className="po-meeting"
                    key={m.id}
                    onClick={() => onSection("meetings")}
                  >
                    <time>{formatDate(m.scheduledAt, true)}</time>
                    <strong>{m.title}</strong>
                    <p>{m.notes || "등록된 회의록이 없어요."}</p>
                  </button>
                ))
              ) : (
                <p className="po-muted">지난 회의가 없어요.</p>
              )}
            </section>
          </aside>
        </div>
      )}
    </section>
  );
}
