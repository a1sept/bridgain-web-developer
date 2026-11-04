import { useEffect, useState } from "react";
import { workflowApi } from "../Approvals";
type Policy = {
  mode: "duration" | "deadline";
  minimumMinutes: number;
  reference: "scheduled" | "actual";
  graceMinutes: number;
  lateEntry: "allow" | "block";
  endPresenceMinutes: number | null;
  includeWaiting: boolean;
};
export default function StudyAttendanceSettings({
  base,
  canManage,
}: {
  base: string;
  canManage: boolean;
}) {
  const [policy, setPolicy] = useState<Policy | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [saved, setSaved] = useState(false);
  useEffect(() => {
    let active = true;
    workflowApi<{ attendance: Policy }>(`${base}/settings`)
      .then((r) => {
        if (active) setPolicy(r.attendance);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [base]);
  const update = (p: Partial<Policy>) => {
    setSaved(false);
    setPolicy((v) => (v ? { ...v, ...p } : v));
  };
  return (
    <section id="study-attendance-policy" className="study-settings-card" aria-labelledby="study-attendance-title">
      <header><h3 id="study-attendance-title">출석 규칙</h3>
      <p>
        이후 시작하는 회차에 적용됩니다. 진행 중·종료된 회차의 기준은
        유지됩니다.
      </p></header>
      {!policy && !error && <p role="status">출석 규칙을 불러오는 중…</p>}
      {error && <p role="alert">{error}</p>}
      {policy && (
        <form
          className="study-form" aria-busy={busy}
          onSubmit={async (e) => {
            e.preventDefault();
            if (busy) return;
            setBusy(true);
            setError("");
            try {
              await workflowApi(
                `${base}/settings`,
                { attendance: policy },
                "PATCH",
              );
              setSaved(true);
            } catch (e) {
              setError(e instanceof Error ? e.message : "저장 실패");
            } finally {
              setBusy(false);
            }
          }}
        >
          <fieldset className="study-settings-group" disabled={!canManage || busy}>
            <legend>인정 방식</legend>
            <div className="study-policy-choices">
              <button
                type="button"
                aria-pressed={policy.mode === "duration"}
                onClick={() => update({ mode: "duration" })}
              >
                <strong>참여 시간만</strong><span>입장 시각과 관계없이 참여 시간을 확인합니다.</span><small>{policy.mode === "duration" ? "선택됨" : "선택"}</small>
              </button>
              <button
                type="button"
                aria-pressed={policy.mode === "deadline"}
                onClick={() => update({ mode: "deadline" })}
              >
                <strong>입장 시각 + 참여 시간</strong><span>정해진 시각 안에 입장하고 참여 시간을 채워야 합니다.</span><small>{policy.mode === "deadline" ? "선택됨" : "선택"}</small>
              </button>
            </div>
            <label>
              최소 참여 시간 (분)
              <input
                type="number"
                min="1"
                max="1440"
                required
                value={policy.minimumMinutes || ""}
                placeholder="예: 30"
                onChange={(e) =>
                  update({ minimumMinutes: Number(e.target.value) })
                }
              />
            </label>
          </fieldset>
            {policy.mode === "deadline" && (
              <fieldset className="study-settings-group" disabled={!canManage || busy}>
                <legend>입장 기준</legend><div className="study-settings-fields">
                <label>
                  입장 기준
                  <select
                    value={policy.reference}
                    onChange={(e) =>
                      update({
                        reference: e.target.value as Policy["reference"],
                      })
                    }
                  >
                    <option value="scheduled">예정 시작 시각</option>
                    <option value="actual">실제 시작 시각</option>
                  </select>
                </label>
                <label>
                  시작 후 입장 허용 시간 (분)
                  <input
                    type="number"
                    required
                    min="0"
                    max="1440"
                    value={policy.graceMinutes}
                    onChange={(e) =>
                      update({ graceMinutes: Number(e.target.value) })
                    }
                  />
                </label>
                <label>
                  허용 시간 이후
                  <select
                    value={policy.lateEntry}
                    onChange={(e) =>
                      update({
                        lateEntry: e.target.value as Policy["lateEntry"],
                      })
                    }
                  >
                    <option value="allow">
                      입장 허용 · 지각 처리
                    </option>
                    <option value="block">입장 차단</option>
                  </select>
                </label>
                <p className="study-field-help">{policy.lateEntry === "allow" ? "늦게 들어온 회원은 지각으로 표시하며 출석으로 인정하지 않습니다." : "허용 시간이 지나면 발표실에 입장할 수 없습니다."}</p>
              </div></fieldset>
            )}
          <fieldset className="study-settings-group" disabled={!canManage || busy}>
            <legend>추가 확인 조건</legend>
            <label>
              종료 근처에도 접속해야 하나요?
              <select
                value={policy.endPresenceMinutes === null ? "off" : "on"}
                onChange={(e) =>
                  update({
                    endPresenceMinutes: e.target.value === "off" ? null : 10,
                  })
                }
              >
                <option value="off">최소 참여 시간만 확인</option>
                <option value="on">종료 근처 접속도 확인</option>
              </select>
            </label>
            {policy.endPresenceMinutes !== null && (
              <label>
                예정 종료 몇 분 전 접속 확인
                <input
                  type="number"
                  required
                  min="0"
                  max="1440"
                  value={policy.endPresenceMinutes}
                  onChange={(e) =>
                    update({ endPresenceMinutes: Number(e.target.value) })
                  }
                />
              </label>
            )}
            <label>
              운영진 부재로 대기한 시간
              <select
                value={String(policy.includeWaiting)}
                onChange={(e) =>
                  update({ includeWaiting: e.target.value === "true" })
                }
              >
                <option value="false">참여 시간에서 제외</option>
                <option value="true">참여 시간에 포함</option>
              </select>
            </label>
          </fieldset>
          <footer className="study-settings-footer">
            {canManage && <button className="pw-primary" disabled={busy}>{busy ? "저장 중…" : "출석 규칙 저장"}</button>}
            {saved && <p role="status">출석 규칙을 저장했습니다.</p>}
          </footer>
        </form>
      )}
    </section>
  );
}
