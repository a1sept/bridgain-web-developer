import { useEffect, useState } from "react";
import { workflowApi } from "../Approvals";
export default function StudyStorage({ base }: { base: string }) {
  const [data, setData] = useState<{
      usedBytes: number;
      limitBytes: number;
      unusedRetentionDays: number;
    } | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    workflowApi<NonNullable<typeof data>>(`${base}/storage`)
      .then((d) => {
        if (active) setData(d);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [base]);
  return (
    <section id="study-space-storage" className="study-settings-card" aria-labelledby="study-storage-title">
      <header><h3 id="study-storage-title">저장 공간</h3><p>사용량과 파일 보관 기준을 확인하세요.</p></header>
      {!data && !error && <p role="status">사용량을 불러오는 중…</p>}
      {error && <p role="alert">{error}</p>}
      {data && (
        <>
          <p>
            {(data.usedBytes / 1024 ** 2).toFixed(1)} MB /{" "}
            {(data.limitBytes / 1024 ** 3).toFixed(0)} GB 사용
          </p>
          <progress
            aria-label="저장 공간 사용량"
            value={data.usedBytes}
            max={data.limitBytes}
          />
        </>
      )}
      <p>이미지 최대 20 MB · PDF 100 MB · 영상 1 GB</p>
      <p>
        이미지는 표시용으로 최적화하며 원본은 유지합니다. 제출·발표 자료에
        연결되지 않은 업로드만 {data?.unusedRetentionDays ?? 7}일 후 정리합니다. 연결된 제출물과 발표 자료는
        자동 삭제하지 않습니다.
      </p>
    </section>
  );
}
