export const apiJson = (value: unknown, status = 200) => Response.json(value, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
export async function boundedRequest(request: Request, maximum = 65_536): Promise<Request | Response> {
  const url = new URL(request.url);
  if (request.method === 'GET' || request.method === 'HEAD') return request;
  if (request.headers.get('Origin') !== url.origin || request.headers.get('Sec-Fetch-Site') === 'cross-site') return apiJson({ error: 'forbidden' }, 403);
  if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') return apiJson({ error: 'invalid_content_type' }, 415);
  if (Number(request.headers.get('Content-Length')) > maximum) return apiJson({ error: 'too_large' }, 413);
  const reader = request.body?.getReader();
  if (!reader) return apiJson({ error: 'invalid' }, 400);
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximum) { await reader.cancel(); return apiJson({ error: 'too_large' }, 413); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const headers = new Headers(request.headers); headers.delete('Content-Length');
  return new Request(request, { headers, body: bytes });
}
