import { useRef, useState, type FormEvent } from "react";
import "./create-project-page.css";
export type CreatePerson = {
  id: string;
  displayName: string;
  accountType: "team" | "client";
};
export type CreateValues = {
  name: string;
  description: string;
  teamId?: string;
  inviteeIds: string[];
};
type Props = {
  teams: { id: string; name: string; permissionRole: string }[];
  user: CreatePerson;
  onBack: () => void;
  onLookup: (id: string) => Promise<CreatePerson>;
  onSearch?: (query: string, type: "client" | "team") => Promise<CreatePerson[]>;
  onCreate: (values: CreateValues) => Promise<void>;
  preview?: boolean;
};
export default function CreateProjectPage({
  teams,
  user,
  onBack,
  onLookup,
  onSearch,
  onCreate,
  preview = false,
}: Props) {
  const available = teams.filter((t) =>
    ["owner", "admin"].includes(t.permissionRole),
  );
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [teamId, setTeamId] = useState(available[0]?.id || "");
  const [members, setMembers] = useState<CreatePerson[]>([]);
  const [ids, setIds] = useState({ client: "", team: "" });
  const [error, setError] = useState("");
  const [lookupError, setLookupError] = useState({ client: "", team: "" });
  const [busy, setBusy] = useState(false);
  const [searching, setSearching] = useState<"client" | "team" | null>(null);
  const locked = useRef(false);
  const [results, setResults] = useState<{client: CreatePerson[]; team: CreatePerson[]}>({client: [], team: []});
  const [searched, setSearched] = useState({client: false, team: false});
  async function add(type: "client" | "team") {
    if (locked.current) return;
    const query = ids[type].trim();
    if (query.length < 2) {
      setLookupError(v => ({...v, [type]: "이름·닉네임은 두 글자 이상 입력해주세요."}));
      return;
    }
    locked.current = true;
    setSearching(type);
    setResults(v => ({...v, [type]: []}));
    setSearched(v => ({...v, [type]: false}));
    setLookupError(v => ({...v, [type]: ""}));
    try {
      const people = onSearch ? await onSearch(query, type) : [await onLookup(query)];
      setResults(v => ({...v, [type]: people.filter(p => p.accountType === type && p.id !== user.id)}));
      setSearched(v => ({...v, [type]: true}));
    } catch (e) {
      setLookupError(v => ({...v, [type]: e instanceof Error ? e.message : "검색하지 못했어요. 다시 시도해주세요."}));
    } finally {
      locked.current = false;
      setSearching(null);
    }
  }
  function selectPerson(person: CreatePerson) {
    if (busy || locked.current || members.some(m => m.id === person.id)) return;
    if (members.length >= 20) {
      setLookupError(v => ({...v, [person.accountType]: "한 번에 최대 20명까지 초대할 수 있어요."}));
      return;
    }
    setMembers(v => [...v, person]);
    setLookupError(v => ({...v, [person.accountType]: ""}));
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (locked.current || !name.trim()) return;
    locked.current = true;
    setBusy(true);
    setError("");
    try {
      await onCreate({
        name: name.trim(),
        description: description.trim(),
        ...(teamId ? { teamId } : {}),
        inviteeIds: members.map((m) => m.id),
      });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "프로젝트를 생성하지 못했어요.",
      );
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="cp-page">
      <header className="cp-header">
        <div>
          <button
            type="button"
            aria-label="프로젝트 목록으로 돌아가기"
            disabled={busy}
            onClick={onBack}
          >
            ←
          </button>
          <strong>프로젝트 생성</strong>
          <a href={preview ? "/preview" : "/"}>
            bridgain<span>.</span>
          </a>
        </div>
      </header>
      <main className="cp-main">
        <div className="cp-heading">
          <span className="cp-eyebrow">
            NEW PROJECT{preview ? " · 미리보기" : ""}
          </span>
          <h1>새로운 프로젝트 생성하기</h1>
          <p>프로젝트 정보를 입력하고 함께할 사람을 초대하세요.</p>
        </div>
        <form onSubmit={submit}>
          <div className="cp-layout">
            <section className="cp-panel" aria-labelledby="cp-info">
              <h2 id="cp-info">프로젝트 정보</h2>
              <label className="cp-label" htmlFor="cp-name">
                프로젝트 이름
              </label>
              <input
                id="cp-name"
                required
                maxLength={120}
                value={name}
                disabled={busy}
                placeholder="프로젝트 이름을 입력하세요"
                onChange={(e) => setName(e.target.value)}
              />
              <p className="cp-help">
                생성 후에도 프로젝트 관리에서 변경할 수 있어요.
              </p>
              <label className="cp-label" htmlFor="cp-description">
                프로젝트 설명 <small>선택</small>
              </label>
              <textarea
                id="cp-description"
                rows={4}
                maxLength={2000}
                disabled={busy}
                value={description}
                placeholder="어떤 프로젝트인지 간단히 소개해주세요"
                onChange={(e) => setDescription(e.target.value)}
              />
              <label className="cp-label" htmlFor="cp-owner-team">
                소유 개발팀
              </label>
              <select
                id="cp-owner-team"
                value={teamId}
                disabled={busy}
                onChange={(e) => setTeamId(e.target.value)}
              >
                <option value="">내 소유 팀 사용 / 없으면 1인 팀 생성</option>
                {available.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
              <p className="cp-help">선택한 팀의 프로젝트로 생성돼요.</p>
            </section>
            <section className="cp-panel" aria-labelledby="cp-people">
              <h2 id="cp-people">함께할 사람</h2>
              {(["client", "team"] as const).map((type) => (
                <div className="cp-invite-group" key={type}>
                  <label className="cp-label" htmlFor={`cp-${type}`}>
                    {type === "client"
                      ? "의뢰자 멤버 초대하기"
                      : "개발팀 멤버 초대하기"}
                    <small>선택</small>
                  </label>
                  <div className="cp-lookup">
                    <input
                      id={`cp-${type}`}
                      value={ids[type]}
                      disabled={busy || searching !== null}
                      placeholder={
                        type === "client"
                          ? "의뢰자 이름·닉네임 또는 ID"
                          : "개발팀 이름·닉네임 또는 ID"
                      }
                      maxLength={100}
                      onChange={(e) => {
                        setIds((v) => ({ ...v, [type]: e.target.value }));
                        setResults(v => ({...v, [type]: []}));
                        setSearched(v => ({...v, [type]: false}));
                        setLookupError(v => ({...v, [type]: ""}));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          if (ids[type].trim()) void add(type);
                        }
                      }}
                    />
                    <button
                      type="button"
                      aria-label={
                        type === "client"
                          ? "의뢰자 검색"
                          : "개발팀 멤버 검색"
                      }
                      disabled={busy || searching !== null || !ids[type].trim()}
                      onClick={() => void add(type)}
                    >
                      {searching === type ? "…" : "검색"}
                    </button>
                  </div>
                  {lookupError[type] && (
                    <p className="cp-error" role="alert">
                      {lookupError[type]}
                    </p>
                  )}
                  {searched[type] && (
                    <div className="cp-search-results" aria-label={type === "client" ? "의뢰자 검색 결과" : "개발팀 검색 결과"}>
                      <p role="status">{results[type].length ? `검색 결과 ${results[type].length}명 · 초대할 사람을 선택하세요` : "일치하는 회원이 없어요. 이름이나 ID를 확인해주세요."}</p>
                      {results[type].map(person => {
                        const selected = members.some(m => m.id === person.id);
                        return <button key={person.id} type="button" disabled={busy || selected} onClick={() => selectPerson(person)}>
                          <span className="cp-result-avatar" aria-hidden="true">{person.displayName.slice(0, 1)}</span>
                          <span className="cp-result-person"><strong>{person.displayName}</strong><small>ID {person.id}</small></span>
                          <span>{selected ? "추가됨" : "＋ 추가"}</span>
                        </button>;
                      })}
                      {results[type].length === 20 && <p>최대 20명까지 표시돼요. 이름을 더 입력해 검색 범위를 좁혀주세요.</p>}
                    </div>
                  )}
                  <div className="cp-chips">
                    {type === "team" && (
                      <span className="cp-chip cp-self">
                        {user.displayName} (나)<small>자동 참여</small>
                      </span>
                    )}
                    {members
                      .filter((m) => m.accountType === type)
                      .map((m) => (
                        <span className="cp-chip" key={m.id}>
                          {m.displayName}
                          <button
                            type="button"
                            disabled={busy}
                            aria-label={`${m.displayName} 초대 목록에서 제외`}
                            onClick={() =>
                              setMembers((v) => v.filter((x) => x.id !== m.id))
                            }
                          >
                            ×
                          </button>
                        </span>
                      ))}
                  </div>
                </div>
              ))}
              <p className="cp-help cp-invite-note">
                가입한 사용자의 이름·닉네임 또는 ID로 검색해 추가할 수 있어요. 프로젝트 생성 시 초대가
                전달되며, 상대방이 수락하면 참여합니다.
              </p>
            </section>
          </div>
          {error && (
            <p className="cp-error cp-submit-error" role="alert">
              {error}
            </p>
          )}
          <footer className="cp-footer">
            <p>
              {members.length
                ? `${members.length}명에게 참여 초대를 보냅니다.`
                : "멤버는 프로젝트 생성 후에도 초대할 수 있어요."}
            </p>
            <button
              type="submit"
              disabled={busy || searching !== null || !name.trim()}
            >
              {busy ? "생성 중…" : "생성하기"}
            </button>
          </footer>
        </form>
      </main>
    </div>
  );
}
