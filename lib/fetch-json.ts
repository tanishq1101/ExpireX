// Safe JSON fetch: never throws the raw "Unexpected token '<' … is not valid JSON"
// error when an API route returns a non-JSON body (500 page, gateway timeout, etc.).
// Returns parsed JSON on success, or throws an Error with a clean, user-facing message.
export async function fetchJson<T = unknown>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    throw new Error("Network error — please check your connection and try again.");
  }

  const text = await res.text().catch(() => "");
  let data: unknown;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = undefined; // body wasn't JSON
    }
  }

  if (!res.ok) {
    const msg =
      data && typeof data === "object" && typeof (data as { error?: unknown }).error === "string"
        ? (data as { error: string }).error
        : `Something went wrong (${res.status}). Please try again.`;
    throw new Error(msg);
  }

  if (data === undefined) {
    throw new Error("The server returned an unexpected response. Please try again.");
  }
  return data as T;
}
