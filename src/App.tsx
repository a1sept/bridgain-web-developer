import { useEffect, useState } from 'react';

type Connection = 'loading' | 'ready' | 'error';

export default function App() {
  const [connection, setConnection] = useState<Connection>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    let active = true;
    setConnection('loading');
    async function check() {
      try {
        const response = await fetch('/api/health', { signal: controller.signal });
        if (!response.ok) throw new Error('Health check failed');
        const data: unknown = await response.json();
        const healthy = typeof data === 'object' && data !== null &&
          'status' in data && data.status === 'ok' &&
          'database' in data && data.database === 'connected';
        if (!healthy) throw new Error('Services not ready');
        if (active) setConnection('ready');
      } catch {
        if (active) setConnection('error');
      } finally {
        window.clearTimeout(timeout);
      }
    }
    void check();
    return () => { active = false; controller.abort(); window.clearTimeout(timeout); };
  }, [attempt]);

  return (
    <div className="shell">
      <header><a className="brand" href="/" aria-label="Bridgain 홈"><span className="mark">b</span>bridgain</a><span className="environment">개발 환경</span></header>
      <main>
        <p className="eyebrow">DEVELOPER WORKSPACE</p>
        <h1>개발자 공간의<br />첫 준비를 마쳤어요.</h1>
        <p className="intro">의뢰를 확인하고 작업을 함께 진행하는 공간입니다.</p>
        <section className="status-card" aria-labelledby="status-title">
          <div className="status-heading"><h2 id="status-title">서비스 연결 확인</h2><span className={`status-dot ${connection}`} /></div>
          <p role="status" aria-live="polite">{connection === 'loading' ? 'API와 데이터베이스 연결을 확인하고 있어요.' : connection === 'ready' ? 'API와 데이터베이스가 정상 연결됐어요.' : '연결을 확인하지 못했어요. API와 DB 실행 상태를 확인해주세요.'}</p>
          <button onClick={() => setAttempt((value) => value + 1)} disabled={connection === 'loading'}>다시 확인 <span aria-hidden="true">↗</span></button>
        </section>
        <p className="note">현재는 개발 환경 확인 화면입니다.<br />로그인과 업무 기능은 다음 단계에서 추가됩니다.</p>
      </main>
      <footer>BRIDGAIN <span>함께 만드는 다음 단계</span></footer>
    </div>
  );
}
