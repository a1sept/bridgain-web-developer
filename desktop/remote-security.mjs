export function remoteOrigin(value) {
  if (!value) throw Error("BRIDGAIN_REMOTE_URL에 웹앱 주소를 설정해주세요.");
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || url.username ||
      url.password || url.pathname !== "/" || url.search || url.hash) {
    throw Error("BRIDGAIN_REMOTE_URL에는 경로와 인증정보가 없는 HTTP(S) 웹앱 주소를 입력해주세요.");
  }
  return url.origin;
}

export function isServiceUrl(value, origin) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username && !url.password && url.origin === origin;
  } catch { return false; }
}

export function externalUrl(value) {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) &&
      !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
