import { useEffect, useState } from "react";
import { workflowApi } from "./Approvals";
import "./stage-settings.css";
type Mode = "document" | "design" | "code" | "test" | "deploy";
type Step = {
  id: string;
  name: string;
  completionMode: Mode;
  dependsOn: string[];
};
type Settings = {
  stageTypes: { id: string; name: string; completionMode: Mode }[];
  presets: { id: string; name: string; stages: Step[] }[];
  canManage: boolean;
};
const modes: [Mode, string][] = [
  ["document", "문서 확정"],
  ["design", "시안 확정"],
  ["code", "코드"],
  ["test", "테스트"],
  ["deploy", "배포"],
];
const key = () => crypto.randomUUID();
export default function StageSettings({ projectId }: { projectId: string }) {
  const [data, setData] = useState<Settings>();
  const [original, setOriginal] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let live = true;
    setData(undefined);
    workflowApi<Settings>(`/projects/${projectId}/stage-settings`)
      .then((d) => {
        if (live) {
          setData(d);
          setOriginal(JSON.stringify(d));
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [projectId]);
  const update = (d: Settings) => {
    setData(d);
    setNotice("");
  };
  async function save() {
    if (!data || busy) return;
    setBusy(true);
    setError("");
    try {
      const d = await workflowApi<Settings>(
        `/projects/${projectId}/stage-settings`,
        data,
      );
      setData(d);
      setOriginal(JSON.stringify(d));
      setNotice("단계 설정을 저장했어요. 기존 업무는 변경되지 않습니다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <section className="pw-panel">
        <h2>단계 유형 · 프리셋</h2>
        {error ? (
          <p role="alert" className="pw-error">
            {error}
          </p>
        ) : (
          <p>불러오는 중…</p>
        )}
      </section>
    );
  return (
    <section className="pw-panel stage-settings">
      <h2>단계 유형 · 프리셋</h2>
      <p>
        회의에서 사용할 작업 단계와 자주 쓰는 순서를 설정하세요. 담당자와
        승인자는 회의에서 지정합니다.
      </p>
      <fieldset disabled={!data.canManage || busy}>
        <h3>단계 유형</h3>
        {data.stageTypes.map((t, i) => (
          <div className="ss-row" key={t.id}>
            <input
              aria-label="단계 유형 이름"
              maxLength={100}
              value={t.name}
              onChange={(e) =>
                update({
                  ...data,
                  stageTypes: data.stageTypes.map((v, n) =>
                    n === i ? { ...v, name: e.target.value } : v,
                  ),
                })
              }
            />
            <select
              aria-label="완료 방식"
              value={t.completionMode}
              onChange={(e) =>
                update({
                  ...data,
                  stageTypes: data.stageTypes.map((v, n) =>
                    n === i
                      ? { ...v, completionMode: e.target.value as Mode }
                      : v,
                  ),
                })
              }
            >
              {modes.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="pw-secondary"
              disabled={data.stageTypes.length === 1}
              onClick={() =>
                update({
                  ...data,
                  stageTypes: data.stageTypes.filter((_, n) => n !== i),
                })
              }
            >
              삭제
            </button>
          </div>
        ))}
        <button
          type="button"
          className="pw-secondary"
          disabled={data.stageTypes.length >= 30}
          onClick={() =>
            update({
              ...data,
              stageTypes: [
                ...data.stageTypes,
                { id: key(), name: "새 단계", completionMode: "document" },
              ],
            })
          }
        >
          + 단계 유형
        </button>
        <h3>업무 순서 프리셋</h3>
        {data.presets.map((preset, pi) => {
          const change = (stages: Step[]) =>
            update({
              ...data,
              presets: data.presets.map((p, n) =>
                n === pi ? { ...p, stages } : p,
              ),
            });
          return (
            <section className="ss-preset" key={preset.id}>
              <div className="ss-row">
                <input
                  aria-label="프리셋 이름"
                  maxLength={100}
                  value={preset.name}
                  onChange={(e) =>
                    update({
                      ...data,
                      presets: data.presets.map((p, n) =>
                        n === pi ? { ...p, name: e.target.value } : p,
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  className="pw-secondary"
                  onClick={() =>
                    update({
                      ...data,
                      presets: data.presets.filter((_, n) => n !== pi),
                    })
                  }
                >
                  프리셋 삭제
                </button>
              </div>
              {preset.stages.map((s, si) => (
                <div className="ss-step" key={s.id}>
                  <div className="ss-row">
                    <span>{si + 1}</span>
                    <input
                      aria-label="프리셋 단계 이름"
                      maxLength={100}
                      value={s.name}
                      onChange={(e) =>
                        change(
                          preset.stages.map((v, n) =>
                            n === si ? { ...v, name: e.target.value } : v,
                          ),
                        )
                      }
                    />
                    <select
                      aria-label="프리셋 완료 방식"
                      value={s.completionMode}
                      onChange={(e) =>
                        change(
                          preset.stages.map((v, n) =>
                            n === si
                              ? { ...v, completionMode: e.target.value as Mode }
                              : v,
                          ),
                        )
                      }
                    >
                      {modes.map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="pw-secondary"
                      disabled={preset.stages.length === 1}
                      onClick={() =>
                        change(
                          preset.stages
                            .filter((v) => v.id !== s.id)
                            .map((v) => ({
                              ...v,
                              dependsOn: v.dependsOn.filter(
                                (id) => id !== s.id,
                              ),
                            })),
                        )
                      }
                    >
                      삭제
                    </button>
                  </div>
                  <div className="ss-deps">
                    <span>선행 단계</span>
                    {preset.stages.slice(0, si).map((prev) => (
                      <label key={prev.id}>
                        <input
                          type="checkbox"
                          checked={s.dependsOn.includes(prev.id)}
                          onChange={(e) =>
                            change(
                              preset.stages.map((v) =>
                                v.id === s.id
                                  ? {
                                      ...v,
                                      dependsOn: e.target.checked
                                        ? [...v.dependsOn, prev.id]
                                        : v.dependsOn.filter(
                                            (id) => id !== prev.id,
                                          ),
                                    }
                                  : v,
                              ),
                            )
                          }
                        />
                        {prev.name}
                      </label>
                    ))}
                    {si === 0 && <span>없음 · 바로 시작</span>}
                  </div>
                </div>
              ))}
              <select
                aria-label="프리셋에 단계 추가"
                value=""
                disabled={preset.stages.length >= 30}
                onChange={(e) => {
                  const t = data.stageTypes.find(
                    (t) => t.id === e.target.value,
                  );
                  if (t)
                    change([
                      ...preset.stages,
                      {
                        id: key(),
                        name: t.name,
                        completionMode: t.completionMode,
                        dependsOn: preset.stages.length
                          ? [preset.stages.at(-1)!.id]
                          : [],
                      },
                    ]);
                }}
              >
                <option value="">+ 단계 선택</option>
                {data.stageTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </section>
          );
        })}
        <button
          type="button"
          className="pw-secondary"
          disabled={data.presets.length >= 30}
          onClick={() =>
            update({
              ...data,
              presets: [
                ...data.presets,
                {
                  id: key(),
                  name: "새 프리셋",
                  stages: [
                    {
                      id: key(),
                      name: data.stageTypes[0].name,
                      completionMode: data.stageTypes[0].completionMode,
                      dependsOn: [],
                    },
                  ],
                },
              ],
            })
          }
        >
          + 프리셋
        </button>
      </fieldset>
      {error && (
        <p className="pw-error" role="alert">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {data.canManage && (
        <button
          type="button"
          className="pw-primary"
          disabled={busy || JSON.stringify(data) === original}
          onClick={() => void save()}
        >
          {busy ? "저장 중…" : "단계 설정 저장"}
        </button>
      )}
    </section>
  );
}
