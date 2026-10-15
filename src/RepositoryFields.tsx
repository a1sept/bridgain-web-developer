import "./repository-fields.css";

export default function RepositoryFields({ value, onChange, disabled = false }: {
  value: string[];
  onChange: (value: string[]) => void;
  disabled?: boolean;
}) {
  return <fieldset className="repo-fields" disabled={disabled}>
    <legend>GitHub 저장소 연결 <small>선택</small></legend>
    <p>기존 저장소 URL을 등록하세요. 건너뛰고 프로젝트 설정에서 추가해도 돼요.</p>
    {value.map((url, index) => <div className="repo-field-row" key={index}>
      <input type="url" aria-label={`GitHub 저장소 URL ${index + 1}`} maxLength={300}
        placeholder="https://github.com/owner/repository" value={url}
        onChange={e => onChange(value.map((v, i) => i === index ? e.target.value : v))} />
      <button type="button" aria-label={`저장소 ${index + 1} 등록 목록에서 제외`}
        onClick={() => onChange(value.filter((_, i) => i !== index))}>제외</button>
    </div>)}
    <button type="button" disabled={disabled || value.length >= 20}
      onClick={() => onChange([...value, ""])}>＋ 저장소 추가</button>
    <p>최대 20개 · URL 등록만 제공하며 GitHub 인증·접근 권한 확인은 포함하지 않아요. 내 작업 폴더는 데스크톱 앱에서 별도로 연결하세요.</p>
  </fieldset>;
}
