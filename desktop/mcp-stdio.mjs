import { createInterface } from "node:readline";
const endpoint = process.env.BRIDGAIN_MCP_ENDPOINT,
  token = process.env.BRIDGAIN_MCP_TOKEN;
if (!endpoint || !token || !/^http:\/\/127\.0\.0\.1:\d+\/mcp$/.test(endpoint))
  throw Error("Bridgain MCP 연결 정보가 없습니다.");
for await (const line of createInterface({ input: process.stdin })) {
  try {
    const request = JSON.parse(line);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + token,
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(30000),
    });
    if (request.id !== undefined) {
      if (!response.ok) throw Error("Bridgain 도구 호출에 실패했습니다.");
      process.stdout.write(JSON.stringify(await response.json()) + "\n");
    }
  } catch (e) {
    let id = null;
    try {
      id = JSON.parse(line).id;
    } catch {}
    if (id !== undefined)
      process.stdout.write(
        JSON.stringify({
          jsonrpc: "2.0",
          id,
          error: { code: -32603, message: e.message },
        }) + "\n",
      );
  }
}
