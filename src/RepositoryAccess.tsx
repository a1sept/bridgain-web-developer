import { useEffect, useRef, useState } from "react";
import { workflowApi } from "./Approvals";

type RepositoryAccessData = {
  currentUserId: string;
  canManage: boolean;
  repositories: {
    repositoryUrl: string;
    registeredByUserId: string | null;
    registeredByName: string | null;
    recipientUserId: string | null;
    recipientName: string | null;
    recipientSource:
      "registrant" | "project_creator" | "project_admin" | "unavailable";
  }[];
  requests: {
    id: string;
    repositoryUrl: string;
    requesterId: string;
    requesterName: string;
    recipientUserId: string | null;
    status: "pending" | "resolved";
    note: string;
    createdAt: string;
    resolvedAt: string | null;
  }[];
};
export default function RepositoryAccess({
  projectId,
  repositoryUrls,
  refreshVersion = 0,
}: {
  projectId: string;
  repositoryUrls: string[];
  refreshVersion?: number;
}) {
  const [data, setData] = useState<RepositoryAccessData | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const base = `/projects/${projectId}/repository-access`;
  const lock = useRef(false);
  async function readAccess() {
    const response = await fetch(`/api/workspace${base}`, {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (response.status === 404)
      throw Error(
        "공용 서버 업데이트가 필요합니다. 저장소 등록자·접근 요청 기능은 최신 API 배포 후 사용할 수 있어요.",
      );
    if (response.status >= 500)
      throw Error(
        "서버의 저장소 접근 요청 기능을 사용할 수 없어요. 관리자에게 서버 적용 상태를 확인해주세요.",
      );
    const result = await response.json();
    if (!response.ok)
      throw Error(result.message || "저장소 접근 요청을 불러오지 못했어요.");
    if (
      !Array.isArray(result.repositories) ||
      result.repositories.some(
        (repo: { recipientSource?: string }) => !repo.recipientSource,
      )
    ) {
      throw Error(
        "공용 서버 업데이트가 필요합니다. 저장소 등록자 기반 접근 요청 기능을 적용해주세요.",
      );
    }
    return result as RepositoryAccessData;
  }
  async function load() {
    setData(await readAccess());
  }
  useEffect(() => {
    let active = true;
    setError("");
    setData(null);
    void readAccess()
      .then((result) => {
        if (active) setData(result);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [projectId, repositoryUrls.join("|"), refreshVersion]);
  async function mutate(
    path: string,
    body: object,
    message: string,
    method = "POST",
  ) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await workflowApi(base + path, body, method);
      await load();
      setNotice(message);
    } catch (e) {
      setError(e instanceof Error ? e.message : "처리하지 못했어요.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className="pw-panel project-repo-access"
      aria-label="저장소 접근 요청"
    >
      <header className="project-local-heading">
        <div>
          <h2>저장소 등록자 · 접근 요청</h2>
          <p>
            요청 → 등록자가 GitHub에서 초대 → 작업자가 초대 수락 → 내 PC 접근
            재확인 → 내려받기
          </p>
        </div>
        <button
          type="button"
          className="pw-secondary"
          disabled={busy}
          onClick={() => {
            setError("");
            void load().catch((e) => setError(e.message));
          }}
        >
          새로고침
        </button>
      </header>
      <p className="project-local-help">
        저장소를 등록한 사람에게 접근 확인 요청이 자동 전달됩니다. 등록 기록이
        없는 기존 저장소는 프로젝트 생성자에게, 등록자가 참여 중이 아니면
        관리자에게 요청합니다. 요청은 프로젝트 채널과 아래 목록에 기록됩니다.
        GitHub 초대는 수신자가 직접 진행해야 합니다.
      </p>
      {error && (
        <p className="pw-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="lw-notice" role="status">
          {notice}
        </p>
      )}
      {!data && !error && <p role="status">등록자 정보를 불러오는 중…</p>}
      {data && (
        <p className="project-local-help">
          내게 전달된 미처리 접근 요청{" "}
          {
            data.requests.filter(
              (request) =>
                request.recipientUserId === data.currentUserId &&
                request.status === "pending",
            ).length
          }
          건
        </p>
      )}
      {data?.repositories.map((repo) => {
        const myPending = data.requests.some(
          (request) =>
            request.repositoryUrl === repo.repositoryUrl &&
            request.requesterId === data.currentUserId &&
            request.status === "pending",
        );
        const manageable =
          data.canManage || repo.recipientUserId === data.currentUserId;
        const githubUrl =
          /^https:\/\/github\.com\/[a-z0-9-]+\/[a-z0-9_.-]+$/i.test(
            repo.repositoryUrl,
          )
            ? `${repo.repositoryUrl}/settings/access`
            : null;
        return (
          <article
            className="project-repo-access-card"
            key={repo.repositoryUrl}
          >
            <strong>
              {repo.repositoryUrl.replace("https://github.com/", "")}
            </strong>
            <p>
              저장소 등록자:{" "}
              {repo.registeredByName || "기존 저장소 · 등록 기록 없음"}
            </p>
            <p>
              접근 요청 수신자:{" "}
              {repo.recipientName || "현재 수신 가능한 관리자가 없습니다."}
              {repo.recipientSource === "project_creator" &&
                " (기존 저장소: 프로젝트 생성자에게 요청)"}
              {repo.recipientSource === "project_admin" &&
                " (등록자 부재: 프로젝트 관리자에게 요청)"}
            </p>
            {manageable && githubUrl && (
              <a
                className="project-repo-external"
                href={githubUrl}
                target="_blank"
                rel="noreferrer"
              >
                GitHub에서 권한 관리 ↗
              </a>
            )}
            <label className="project-access-note">
              접근 요청 메모
              <input
                value={notes[repo.repositoryUrl] || ""}
                maxLength={500}
                placeholder="초대받을 GitHub 아이디를 알려주세요."
                onChange={(event) =>
                  setNotes((previous) => ({
                    ...previous,
                    [repo.repositoryUrl]: event.target.value,
                  }))
                }
                disabled={busy || myPending}
              />
            </label>
            <button
              type="button"
              className="pw-secondary"
              disabled={busy || myPending || !repo.recipientUserId}
              onClick={() =>
                void mutate(
                  "/requests",
                  {
                    repositoryUrl: repo.repositoryUrl,
                    note: notes[repo.repositoryUrl] || "",
                  },
                  "접근 요청을 저장하고 프로젝트 채널에 기록했어요. 수신자는 이 화면에서 요청을 확인할 수 있습니다.",
                )
              }
            >
              {myPending ? "접근 확인 대기" : "등록자에게 접근 확인 요청"}
            </button>
            {data.requests
              .filter(
                (request) =>
                  request.repositoryUrl === repo.repositoryUrl &&
                  (manageable || request.requesterId === data.currentUserId),
              )
              .map((request) => (
                <div className="project-access-request" key={request.id}>
                  <div>
                    <strong>{request.requesterName}</strong>
                    <span>
                      {request.status === "pending"
                        ? "접근 요청 중"
                        : "수신자 처리 완료 · 초대 수락 후 접근 재확인 필요"}
                    </span>
                    {request.note && <p>{request.note}</p>}
                  </div>
                  {manageable && request.status === "pending" && (
                    <button
                      type="button"
                      className="pw-secondary"
                      disabled={busy}
                      onClick={() =>
                        void mutate(
                          `/requests/${request.id}`,
                          { status: "resolved" },
                          "수신자 처리 완료로 표시했어요. 작업자는 GitHub 초대를 수락하고 접근을 재확인해야 합니다.",
                          "PATCH",
                        )
                      }
                    >
                      GitHub 초대 안내 완료
                    </button>
                  )}
                </div>
              ))}
          </article>
        );
      })}
      {data && !data.repositories.length && (
        <p className="project-local-help">
          프로젝트 공용 저장소를 먼저 등록하고 저장해주세요.
        </p>
      )}
    </section>
  );
}
