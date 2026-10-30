import { useEffect, useRef, useState } from "react";
import { workflowApi } from "./Approvals";
import MemberPicker from "./MemberPicker";

type RepositoryAccessData = {
  currentUserId: string;
  canManage: boolean;
  members: { userId: string; displayName: string }[];
  repositories: {
    repositoryUrl: string;
    managerUserId: string | null;
    managerName: string | null;
  }[];
  requests: {
    id: string;
    repositoryUrl: string;
    requesterId: string;
    requesterName: string;
    managerUserId: string | null;
    status: "pending" | "resolved";
    note: string;
    createdAt: string;
    resolvedAt: string | null;
  }[];
};
export default function RepositoryAccess({
  projectId,
  repositoryUrls,
}: {
  projectId: string;
  repositoryUrls: string[];
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
        "공용 서버 업데이트가 필요합니다. 저장소 담당자·접근 요청 기능은 최신 API 배포 후 사용할 수 있어요.",
      );
    if (response.status >= 500)
      throw Error(
        "서버의 저장소 접근 요청 기능을 사용할 수 없어요. 관리자에게 서버 적용 상태를 확인해주세요.",
      );
    const result = await response.json();
    if (!response.ok)
      throw Error(result.message || "저장소 접근 요청을 불러오지 못했어요.");
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
  }, [projectId, repositoryUrls.join("|")]);
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
          <h2>저장소 담당자 · 접근 요청</h2>
          <p>
            요청 → 담당자가 GitHub에서 초대 → 작업자가 초대 수락 → 내 PC 접근
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
        담당자는 초대할 GitHub 권한이 있는 프로젝트 멤버로 지정해주세요. 담당자
        지정만으로 GitHub 권한이 생기지는 않습니다. 접근 요청은 프로젝트 채널과
        아래 요청 목록에 남습니다. 담당자는 자신에게 배정된 요청을 여기서
        확인하고 GitHub 초대를 직접 진행합니다.
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
      {!data && !error && <p role="status">담당자 정보를 불러오는 중…</p>}
      {data && (
        <p className="project-local-help">
          내가 담당한 미처리 접근 요청{" "}
          {
            data.requests.filter(
              (request) =>
                request.managerUserId === data.currentUserId &&
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
          data.canManage || repo.managerUserId === data.currentUserId;
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
            {data.canManage ? (
              <MemberPicker
                label="저장소 담당자"
                items={data.members}
                value={repo.managerUserId ? [repo.managerUserId] : []}
                disabled={busy}
                onChange={(ids) =>
                  void mutate(
                    "/manager",
                    {
                      repositoryUrl: repo.repositoryUrl,
                      managerUserId: ids.at(-1) || null,
                    },
                    "저장소 담당자를 저장했어요.",
                    "PATCH",
                  )
                }
              />
            ) : (
              <p>
                저장소 담당자:{" "}
                {repo.managerName ||
                  "미지정 · 프로젝트 관리자에게 지정을 요청해주세요."}
              </p>
            )}
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
              disabled={busy || myPending || !repo.managerUserId}
              onClick={() =>
                void mutate(
                  "/requests",
                  {
                    repositoryUrl: repo.repositoryUrl,
                    note: notes[repo.repositoryUrl] || "",
                  },
                  "접근 요청을 저장하고 프로젝트 채널에 기록했어요. 담당자는 이 화면에서 요청을 확인할 수 있습니다.",
                )
              }
            >
              {myPending ? "담당자 확인 대기" : "담당자에게 접근 요청"}
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
                        : "담당자 처리 완료 · 초대 수락 후 접근 재확인 필요"}
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
                          "담당자 처리 완료로 표시했어요. 작업자는 GitHub 초대를 수락하고 접근을 재확인해야 합니다.",
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
