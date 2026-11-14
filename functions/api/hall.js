const json = (data, status = 200) => new Response(JSON.stringify(data), {
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
    return json({ images: [], error: 'service_not_configured' }, 500);
  }

  try {
    const url = new URL(env.APPS_SCRIPT_URL);
    url.searchParams.set('action', 'hall');
    const upstream = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'Cache-Control': 'no-cache'
      },
      cache: 'no-store',
      redirect: 'follow'
    });

    if (!upstream.ok) {
      return json({ images: [], error: 'upstream_error' }, 502);
    }

    const body = await upstream.text();
    let result;
    try {
      result = JSON.parse(body);
    } catch (error) {
      return json({ images: [], error: 'invalid_upstream_response' }, 502);
    }

    if (!result || !Array.isArray(result.images) || result.error) {
      return json({ images: [], error: result?.error || 'invalid_upstream_response' }, 502);
    }

    return json(result);
  } catch (error) {
    return json({ images: [], error: 'upstream_error' }, 502);
  }
}
