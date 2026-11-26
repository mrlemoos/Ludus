export function forwardUpgrade(request: Request, player: string): RequestInit {
  const headers = new Headers(request.headers);
  headers.set('Upgrade', 'websocket');
  headers.set('X-Player', player);
  const internal: string[] = [];
  for (const name of headers.keys()) {
    if (name.toLowerCase().startsWith('x-') && name.toLowerCase() !== 'x-player') {
      internal.push(name);
    }
  }
  for (const name of internal) {
    headers.delete(name);
  }
  // Returned as fetch init so the caller can pass the original Request through.
  // Replacing that Request drops the browser WebSocket and the Durable Object
  // ends up talking to a different socket.
  return { headers };
}
export function acknowledgeClose(socket: WebSocket, code: number) {
  const legal = code >= 1000 && code < 5000 && ![1004, 1005, 1006, 1015].includes(code);
  if (legal) {
    try {
      socket.close(code, 'Closed');
      return;
    } catch {
      /* A coded reply was refused. Reply without a status code. */
    }
  }
  try {
    socket.close();
  } catch {
    /* The handshake is already complete. */
  }
}
export function apiJson(value: unknown, status = 200) {
  return Response.json(value, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}
export async function boundedRequest(
  request: Request,
  maximum = 65_536,
): Promise<Request | Response> {
  const url = new URL(request.url);
  if (request.method === 'GET' || request.method === 'HEAD') {
    return request;
  }
  if (
    request.headers.get('Origin') !== url.origin ||
    request.headers.get('Sec-Fetch-Site') === 'cross-site'
  ) {
    return apiJson({ error: 'forbidden' }, 403);
  }
  if (request.headers.get('Content-Type')?.split(';')[0].trim() !== 'application/json') {
    return apiJson({ error: 'invalid_content_type' }, 415);
  }
  if (Number(request.headers.get('Content-Length')) > maximum) {
    return apiJson({ error: 'too_large' }, 413);
  }
  const reader = request.body?.getReader();
  if (!reader) {
    return apiJson({ error: 'invalid' }, 400);
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    size += value.byteLength;
    if (size > maximum) {
      await reader.cancel();
      return apiJson({ error: 'too_large' }, 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const headers = new Headers(request.headers);
  headers.delete('Content-Length');
  return new Request(request, { headers, body: bytes });
}
