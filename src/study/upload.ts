export type StudyFile = {
  id: string;
  name: string;
  mime: string;
  size: number;
};
export async function uploadStudyFile(
  base: string,
  file: File,
  onProgress: (value: number) => void = () => {},
): Promise<StudyFile> {
  const csrf = await fetch("/api/auth/csrf", { credentials: "same-origin" });
  if (!csrf.ok) throw Error("로그인 상태를 확인해주세요.");
  const { csrfToken } = await csrf.json();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/workspace${base}/assets`);
    xhr.setRequestHeader("X-CSRF-Token", csrfToken);
    xhr.setRequestHeader("X-File-Name", encodeURIComponent(file.name));
    xhr.setRequestHeader(
      "Content-Type",
      file.type || "application/octet-stream",
    );
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable)
        onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onerror = () => reject(Error("업로드 연결이 끊겼습니다."));
    xhr.onload = () => {
      try {
        const r = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) resolve(r);
        else reject(Error(r.message || "업로드 실패"));
      } catch {
        reject(Error("업로드 응답을 확인하지 못했습니다."));
      }
    };
    xhr.send(file);
  });
}
