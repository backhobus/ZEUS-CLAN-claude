const json = (data, status = 502) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'X-Content-Type-Options': 'nosniff'
  }
});

export async function onRequestGet({ request, env }) {
  if (!env.APPS_SCRIPT_URL) {
    return json({ error: 'service_not_configured' }, 500);
  }

  const requestUrl = new URL(request.url);
  const id = String(requestUrl.searchParams.get('id') || '').trim();
  if (!/^[a-zA-Z0-9_-]{10,200}$/.test(id)) {
    return json({ error: 'invalid_image_id' }, 400);
  }

  try {
    const url = new URL(env.APPS_SCRIPT_URL);
    url.searchParams.set('action', 'hallImage');
    url.searchParams.set('id', id);
    const upstream = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Cache-Control': 'no-cache'
      },
      cache: 'no-store',
      redirect: 'follow'
    });

    if (!upstream.ok) return json({ error: 'upstream_error' }, 502);

    let result;
    try {
      result = await upstream.json();
    } catch (error) {
      return json({ error: 'invalid_upstream_response' }, 502);
    }

    const mimeType = String(result?.mimeType || '').toLowerCase();
    const base64 = String(result?.base64 || '');
    if (result?.error || !/^image\/[a-z0-9.+-]+$/.test(mimeType) || !base64) {
      return json({ error: result?.error || 'image_unavailable' }, 502);
    }

    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': mimeType,
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        'Pragma': 'no-cache',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  } catch (error) {
    return json({ error: 'upstream_error' }, 502);
  }
}
