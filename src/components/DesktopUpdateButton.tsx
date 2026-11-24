import { useEffect, useState } from "react";
import type { DesktopUpdateState } from "../desktop";
import ControlIcon from "./ControlIcon";
import "./desktop-update.css";

export default function DesktopUpdateButton() {
  const bridge = window.bridgainDesktop;
  const [state, setState] = useState<DesktopUpdateState>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const receive = (value: DesktopUpdateState) => { if (active) setState(value); };
    const unsubscribe = bridge?.onUpdate?.(receive);
    void bridge?.updateState?.().then(receive).catch(() => {});
    return () => { active = false; unsubscribe?.(); };
  }, [bridge]);
  const label = state?.phase === "downloading" ? `${state.percent}%`
    : state?.phase === "checking" ? "확인 중"
    : state?.phase === "ready" ? "설치하기"
    : state?.phase === "error" || error ? "다시 시도" : "업데이트";
  const title = !bridge?.updateApp ? "화면 새로고침 (앱 업데이트는 새 설치형 앱에서 지원)"
    : [state?.version && `현재 버전 ${state.version}`, state?.availableVersion && `새 버전 ${state.availableVersion}`, state?.message || error || "앱 업데이트 확인 / 화면 새로고침"].filter(Boolean).join(" · ");
  return <div className="desktop-update">
    <button type="button" title={title} aria-label={title} disabled={busy} onClick={async () => {
      if (!bridge?.updateApp) {
        if (window.confirm("저장하지 않은 내용을 먼저 저장해주세요. 화면을 새로 불러올까요?")) window.location.reload();
        return;
      }
      setBusy(true); setError("");
      try { setState(await bridge.updateApp()); }
      catch { setError("업데이트 요청에 실패했습니다. 다시 시도해주세요."); }
      finally { setBusy(false); }
    }}>
      <ControlIcon name="refresh" size={16} />
      <span aria-live="polite">{label}</span>
    </button>
  </div>;
}
