import { Children, isValidElement, memo, useEffect, useRef, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './message-body.css';

let diagramSequence = 0;
let diagramQueue: Promise<unknown> = Promise.resolve();
let mermaidModule: Promise<typeof import('mermaid')> | undefined;
function renderDiagram(source: string) {
  const task = diagramQueue.then(async () => {
    mermaidModule ??= import('mermaid');
    const { default: mermaid } = await mermaidModule;
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', suppressErrorRendering: true, theme: 'neutral' });
    return mermaid.render(`ai-diagram-${++diagramSequence}`, source);
  });
  diagramQueue = task.catch(() => undefined);
  return task;
}

function CopyButton({ source }: { source: string }) {
  const [status, setStatus] = useState('복사');
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timeout.current), []);
  async function copy() {
    try {
      await navigator.clipboard.writeText(source);
      setStatus('복사됨');
    } catch { setStatus('복사 실패'); }
    clearTimeout(timeout.current);
    timeout.current = setTimeout(() => setStatus('복사'), 2000);
  }
  return <button type="button" onClick={() => void copy()} aria-label="코드 복사">{status}</button>;
}

function CodeBlock({ source, language, streaming }: { source: string; language: string; streaming: boolean }) {
  const isDiagram = language.toLowerCase() === 'mermaid';
  const [showSource, setShowSource] = useState(false);
  const [result, setResult] = useState<{ source: string; svg?: string; error?: boolean }>();
  const [zoom, setZoom] = useState(1);
  useEffect(() => {
    if (!isDiagram || streaming) return;
    let cancelled = false;
    void renderDiagram(source).then(({ svg }) => {
      if (!cancelled) setResult({ source, svg });
    }).catch(() => {
      if (!cancelled) setResult({ source, error: true });
    });
    return () => { cancelled = true; };
  }, [source, streaming, isDiagram]);
  const current = result?.source === source ? result : undefined;
  const displayDiagram = isDiagram && !streaming && !showSource && !!current?.svg;
  return <section className="ai-code-block">
    <div className="ai-code-toolbar">
      <span>{language || '코드'}{isDiagram && streaming ? ' · 작성 중' : ''}</span>
      {isDiagram && <button type="button" aria-pressed={showSource} onClick={() => setShowSource(value => !value)}>{showSource ? '다이어그램' : '원문'}</button>}
      <CopyButton source={source} />
    </div>
    {isDiagram && !streaming && !showSource && !current && <p className="ai-diagram-notice" role="status">다이어그램을 그리는 중입니다.</p>}
    {isDiagram && !streaming && current?.error && <p className="ai-diagram-notice" role="status">다이어그램을 표시하지 못했습니다. 아래 원문을 확인해 주세요.</p>}
    {displayDiagram ? <>
      <div className="ai-diagram-controls">
        <button type="button" disabled={zoom <= 0.5} aria-label="다이어그램 축소" onClick={() => setZoom(value => Math.max(0.5, value - 0.25))}>−</button>
        <button type="button" onClick={() => setZoom(1)} aria-label="다이어그램 배율 초기화">{Math.round(zoom * 100)}%</button>
        <button type="button" disabled={zoom >= 3} aria-label="다이어그램 확대" onClick={() => setZoom(value => Math.min(3, value + 0.25))}>+</button>
      </div>
      <div className="ai-diagram-scroll" tabIndex={0} aria-label="Mermaid 다이어그램, 스크롤하여 탐색">
        <div className="ai-diagram-svg" style={{ width: `${zoom * 100}%` }} dangerouslySetInnerHTML={{ __html: current!.svg! }} />
      </div>
    </> : <pre><code>{source}</code></pre>}
  </section>;
}

function MarkdownPre({ children, streaming }: { children?: ReactNode; streaming: boolean }) {
  const child = Children.toArray(children)[0];
  if (!isValidElement<{ className?: string; children?: ReactNode }>(child)) return <pre>{children}</pre>;
  const source = String(child.props.children ?? '').replace(/\n$/, '');
  const language = /language-([^\s]+)/.exec(child.props.className ?? '')?.[1] ?? '';
  return <CodeBlock source={source} language={language} streaming={streaming} />;
}

const AiMessageBody = memo(function AiMessageBody({ body, streaming = false }: { body: string; streaming?: boolean }) {
  return <div className="ai-message-body"><ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{
    pre: ({ children }) => <MarkdownPre streaming={streaming}>{children}</MarkdownPre>,
    a: ({ children, href }) => <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>,
    table: ({ children }) => <div className="ai-markdown-table-scroll"><table>{children}</table></div>,
  }}>{body}</ReactMarkdown></div>;
});
export default AiMessageBody;
