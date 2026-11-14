const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  }
});

export async function onRequestGet({ env }) {
  // 명예의 전당 열람에는 IP 국가 및 BLOCKED_APPLICATION_IPS 검사를 적용하지 않습니다.
  if (!env.APPS_SCRIPT_URL) {
    return json({ images: [], error: 'service_not_configured' }, 500);
  }

  try {
    const url = new URL(env.APPS_SCRIPT_URL);
    url.searchParams.set('action', 'hall');
    const upstream = await fetch(url.toString(), {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      redirect: 'follow'
    });
    const body = await upstream.text();

    if (!upstream.ok) {
      return json({ images: [], error: 'upstream_error' }, 502);
    }

    let result;
    try {
      result = JSON.parse(body);
    } catch (error) {
      return json({ images: [], error: 'invalid_upstream_response' }, 502);
    }

    return json(result, 200);
  } catch (error) {
    return json({ images: [], error: 'upstream_error' }, 502);
  }
}
