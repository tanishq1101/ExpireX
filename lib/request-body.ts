/** Enforce limits while streaming; Content-Length alone is optional/untrusted. */
export async function boundedBody(request: Request, maxBytes: number) {
  const declared = Number(request.headers.get('content-length'));
  if (declared > maxBytes) throw new Error('Request is too large');
  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBytes) { await reader.cancel(); throw new Error('Request is too large'); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return body;
}
export async function readJson(request: Request, maxBytes = 16384): Promise<unknown> {
  return JSON.parse(new TextDecoder().decode(await boundedBody(request, maxBytes)));
}
export async function readImageForm(request: Request) {
  const body = await boundedBody(request, 8 * 1024 * 1024 + 65536);
  return new Response(body, { headers: { 'Content-Type': request.headers.get('content-type') ?? '' } }).formData();
}
