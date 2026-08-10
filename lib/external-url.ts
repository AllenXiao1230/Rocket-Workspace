import { isIP } from "node:net";
import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";

type ServiceKind = "AI" | "WEBHOOK";
type ExternalFetchOptions = Pick<RequestInit, "body" | "headers" | "method" | "signal">;
type ExternalDestination = { address?: string; family?: number; url: URL };

function isPrivateAddress(address: string) {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, "");
  if (normalized.startsWith("::ffff:")) return isPrivateAddress(normalized.slice(7));
  const family = isIP(normalized);
  if (family === 6) {
    return normalized === "::" || normalized === "::1" || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb") || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("100:") || normalized.startsWith("2001:db8:") || normalized.startsWith("3fff:") || normalized.startsWith("5f00:");
  }
  if (family !== 4) return false;
  const [a, b, c] = normalized.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && ((b === 0 && c === 0) || (b === 0 && c === 2) || b === 168)) || (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) || (a === 203 && b === 0 && c === 113) || a >= 224;
}

function allowedOllamaHosts() {
  return new Set((process.env.OLLAMA_ALLOWED_HOSTS || "ollama").split(",").map((host) => host.trim().toLowerCase()).filter(Boolean));
}

async function resolveExternalDestination(raw: string, kind: ServiceKind, provider?: "OPENAI_COMPATIBLE" | "OLLAMA"): Promise<ExternalDestination> {
  let url: URL;
  try { url = new URL(raw); } catch { throw new Error(`${kind === "AI" ? "AI 服務" : "Webhook"}網址格式不正確`); }
  if (url.username || url.password || url.hash) throw new Error("外部服務網址不可包含帳號、密碼或片段");
  const isOllama = kind === "AI" && provider === "OLLAMA";
  const host = url.hostname.toLowerCase();
  if (isOllama && url.protocol === "http:" && allowedOllamaHosts().has(host)) return { url };
  if (url.protocol !== "https:") throw new Error(isOllama ? "Ollama 僅能使用已允許的內部 HTTP 主機，其他服務必須使用 HTTPS" : "外部服務網址必須使用 HTTPS");
  if (isPrivateAddress(host)) throw new Error("外部服務網址不可指向本機或私有網路位址");
  try {
    const addresses = await lookup(host, { all: true, verbatim: true });
    if (!addresses.length || addresses.some((entry) => isPrivateAddress(entry.address))) throw new Error("blocked");
    return { url, address: addresses[0].address, family: addresses[0].family };
  } catch (error) {
    if (error instanceof Error && error.message === "blocked") throw new Error("外部服務網址不可指向本機或私有網路位址");
    throw new Error("外部服務網域無法解析");
  }
}

/** Validates outbound destinations before settings are saved and before use. */
export async function validateExternalUrl(raw: string, kind: ServiceKind, provider?: "OPENAI_COMPATIBLE" | "OLLAMA") {
  return (await resolveExternalDestination(raw, kind, provider)).url;
}

/**
 * Performs an external HTTPS request through the IP resolved during validation.
 * This prevents a DNS answer from changing between the public-address check and
 * the network connection. Deliberately allowlisted internal Ollama hosts retain
 * their normal HTTP connection path.
 */
export async function fetchExternalUrl(raw: string | URL, kind: ServiceKind, provider: "OPENAI_COMPATIBLE" | "OLLAMA" | undefined, options: ExternalFetchOptions) {
  const destination = await resolveExternalDestination(raw.toString(), kind, provider);
  if (!destination.address || destination.url.protocol === "http:") return fetch(destination.url, options);
  const headers = new Headers(options.headers);
  return new Promise<Response>((resolve, reject) => {
    const request = httpsRequest(destination.url, {
      method: options.method,
      headers: Object.fromEntries(headers.entries()),
      signal: options.signal ?? undefined,
      lookup: (hostname, _, callback) => {
        if (hostname.toLowerCase() !== destination.url.hostname.toLowerCase()) return callback(new Error("外部服務主機不符"), "", 0);
        callback(null, destination.address!, destination.family);
      },
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("error", reject);
      response.on("end", () => {
        const responseHeaders = new Headers();
        for (const [name, value] of Object.entries(response.headers)) for (const item of Array.isArray(value) ? value : [value]) if (item !== undefined) responseHeaders.append(name, String(item));
        resolve(new Response(Buffer.concat(chunks), { headers: responseHeaders, status: response.statusCode || 502, statusText: response.statusMessage }));
      });
    });
    request.on("error", reject);
    if (options.body) request.write(options.body);
    request.end();
  });
}
