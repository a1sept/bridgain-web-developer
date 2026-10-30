import { createLocalId } from "./browser-id";
import { useEffect, useState } from "react";
import { workflowApi } from "./Approvals";
import "./stage-settings.css";
type Mode = "document" | "design" | "code" | "test" | "deploy";
type Settings = {
  stageTypes: { id: string; name: string; completionMode: Mode }[];
  // Preserve legacy presets when saving categories; there is no preset editor.
  presets: unknown[];
  canManage: boolean;
};
const modes: [Mode, string][] = [
  ["document", "문서 확정"],
  ["design", "시안 확정"],
  ["code", "코드"],
  ["test", "테스트"],
  ["deploy", "배포"],
];
const key = () => createLocalId();
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
      setNotice("카테고리 설정을 저장했어요. 기존 업무는 변경되지 않습니다.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "저장하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }
  if (!data)
    return (
      <section className="pw-panel">
        <h2>업무 카테고리</h2>
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
      <h2>업무 카테고리</h2>
      <p>
        회의와 긴급 승인에서 사용할 업무 카테고리와 완료 방식을 설정하세요.
      </p>
      <fieldset disabled={!data.canManage || busy}>
        <h3>카테고리 · 완료 방식</h3>
        {data.stageTypes.map((t, i) => (
          <div className="ss-row" key={t.id}>
            <input
              aria-label="카테고리 이름"
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
                { id: key(), name: "새 카테고리", completionMode: "document" },
              ],
            })
          }
        >
          + 카테고리
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
          {busy ? "저장 중…" : "카테고리 설정 저장"}
        </button>
      )}
    </section>
  );
}
