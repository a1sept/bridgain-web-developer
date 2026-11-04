import { useEffect, useState } from "react";
import { workflowApi } from "../Approvals";
export type Attendance = {
  canAdjust?: boolean;
  ended: boolean;
  rows: {
    userId: string;
    name: string;
    seconds: number;
    late: boolean;
    eligible: boolean;
    firstJoinedAt: string | null;
    corrections?: {
      id: string;
      verdict: string;
      reason: string;
      actorName: string;
      createdAt: string;
    }[];
    entries: { joinedAt: string; leftAt: string }[];
  }[];
};

export function AttendanceTable({ report, url, busy, setBusy, setError, getReport }: {
  report: Attendance; url: string; busy: boolean;
  setBusy: (value: boolean) => void; setError: (value: string) => void;
  getReport: () => Promise<void>;
}) {
  return (
        <section>
          <h3>{report.ended ? "출석 결과" : "참여 기록 · 진행 중"}</h3>
          <div className="study-table-scroll">
            <table className="study-table">
              <thead>
                <tr>
                  <th>회원</th>
                  <th>참여 시간</th>
                  <th>판정</th>
                  <th>입퇴장 기록</th>
                </tr>
              </thead>
              <tbody>
                {report.rows.map((r) => (
                  <tr key={r.userId}>
                    <td>{r.name}</td>
                    <td>
                      {Math.floor(r.seconds / 60)}분 {r.seconds % 60}초
                    </td>
                    <td>
                      {r.corrections?.at(-1)?.verdict === "present"
                        ? "출석 인정 · 운영진 보정"
                        : r.corrections?.at(-1)?.verdict === "absent"
                          ? "미인정 · 운영진 보정"
                          : r.late
                            ? "지각 · 미인정"
                            : r.eligible
                              ? "기준 충족"
                              : r.firstJoinedAt
                                ? "시간·종료 조건 미충족"
                                : "미참여"}
                    </td>
                    <td>
                      <details>
                        <summary>접속 {r.entries.length}회</summary>
                        {r.entries.map((v, i) => (
                          <p key={i}>
                            {new Date(v.joinedAt).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul" })} –{" "}
                            {new Date(v.leftAt).toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul" })}
                          </p>
                        ))}
                      </details>
                      {!!r.corrections?.length && (
                        <details>
                          <summary>보정 기록 {r.corrections.length}건</summary>
                          {r.corrections.map((c) => (
                            <p key={c.id}>
                              {c.actorName} ·{" "}
                              {new Date(c.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} ·{" "}
                              {c.verdict === "present"
                                ? "인정"
                                : c.verdict === "absent"
                                  ? "미인정"
                                  : "자동 판정으로 복원"}
                              <br />
                              {c.reason}
                            </p>
                          ))}
                        </details>
                      )}
                      {report.canAdjust && report.ended && (
                        <details>
                          <summary>판정 보정</summary>
                          <p>
                            입퇴장 원본은 유지됩니다. 자동 판정:{" "}
                            {r.eligible ? "기준 충족" : "미충족"}
                          </p>
                          <form
                            className="study-form"
                            onSubmit={async (e) => {
                              e.preventDefault();
                              if (busy) return;
                              const f = new FormData(e.currentTarget);
                              setBusy(true);
                              setError("");
                              try {
                                await workflowApi(
                                  `${url}/attendance/${r.userId}`,
                                  {
                                    verdict: f.get("verdict"),
                                    reason: f.get("reason"),
                                  },
                                );
                                await getReport();
                              } catch (e) {
                                setError(
                                  e instanceof Error ? e.message : "보정 실패",
                                );
                              } finally {
                                setBusy(false);
                              }
                            }}
                          >
                            <label>
                              판정
                              <select name="verdict">
                                <option value="present">출석 인정</option>
                                <option value="absent">미인정</option>
                                <option value="automatic">
                                  자동 판정으로 복원
                                </option>
                              </select>
                            </label>
                            <label>
                              보정 사유
                              <textarea
                                name="reason"
                                required
                                maxLength={1000}
                              />
                            </label>
                            <button disabled={busy}>기록하고 적용</button>
                          </form>
                        </details>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
);
}
export default function StudyAttendanceRecord({ base, session }: {
  base: string; session: { id: string; status: string };
}) {
  const [report, setReport] = useState<Attendance | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const url = `${base}/sessions/${session.id}`;
  async function getReport() {
    setReport(await workflowApi<Attendance>(`${url}/attendance`));
  }
  useEffect(() => {
    if (session.status === "scheduled" || session.status === "canceled") return;
    let active = true;
    setBusy(true); setError("");
    workflowApi<Attendance>(`${url}/attendance`).then(r => { if (active) setReport(r); })
      .catch(e => { if (active) setError(e instanceof Error ? e.message : "참여 기록을 불러오지 못했습니다."); })
      .finally(() => { if (active) setBusy(false); });
    return () => { active = false; };
  }, [url, session.status, revision]);
  if (session.status === "scheduled") return <p className="study-empty">모임이 시작되면 참여 기록이 표시됩니다.</p>;
  if (session.status === "canceled") return <p className="study-empty">취소된 회차입니다.</p>;
  return <section className="study-attendance-record">
    <div className="study-heading"><p>입퇴장 시간과 출석 결과를 확인하세요.</p><button disabled={busy} onClick={() => setRevision(v => v + 1)}>기록 새로고침</button></div>
    {error && <p role="alert">{error}</p>}
    {busy && !report && <p role="status">참여 기록을 불러오는 중…</p>}
    {report && !report.rows.length && <p className="study-empty">아직 참여 기록이 없습니다.</p>}
    {report && report.rows.length > 0 && <AttendanceTable report={report} url={url} busy={busy} setBusy={setBusy} setError={setError} getReport={getReport} />}
  </section>;
}
