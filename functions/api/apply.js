const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff'
  }
});

function getBlockedIps(rawValue) {
  // Cloudflare Pages 변수에는 쉼표 또는 줄바꿈으로 구분해 IP를 입력합니다.
  return new Set(
    String(rawValue || '')
      .split(/[\s,;]+/)
      .map(value => value.trim().toLowerCase())
      .filter(Boolean)
  );
}

function cleanText(value, maxLength, fallback = '') {
  const text = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  return (text || fallback).slice(0, maxLength);
}

function detectOs(userAgent, clientPlatform) {
  if (clientPlatform) return cleanText(clientPlatform, 100, '확인 불가');
  const ua = String(userAgent || '');
  if (/iPhone|iPad|iPod/i.test(ua)) return /iPad/i.test(ua) ? 'iPadOS' : 'iOS';
  if (/Android/i.test(ua)) return 'Android';
  if (/Windows NT/i.test(ua)) return 'Windows';
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS';
  if (/Linux/i.test(ua)) return 'Linux';
  return '확인 불가';
}

function decodeClientHint(value) {
  return String(value || '').trim().replace(/^"|"$/g, '');
}

export async function onRequestPost({ request, env }) {
  // 이 검사는 가입 신청 API에만 적용됩니다. 정적 페이지와 /api/hall에는 적용되지 않습니다.
  const ip = String(request.headers.get('CF-Connecting-IP') || '').trim().toLowerCase();
  if (!ip || ip === 'unknown') {
    return json({ ok: false, code: 'IP_MISSING' }, 403);
  }

  const country = String(request.cf?.country || '').trim().toUpperCase();
  if (country !== 'KR') {
    return json({ ok: false, code: 'COUNTRY_NOT_ALLOWED' }, 403);
  }

  const blockedIps = getBlockedIps(env.BLOCKED_APPLICATION_IPS);
  if (blockedIps.has(ip)) {
    return json({ ok: false, code: 'IP_BLOCKED' }, 403);
  }

  if (!env.APPS_SCRIPT_URL || !env.APPS_SCRIPT_TOKEN) {
    return json({ ok: false, code: 'SERVICE_NOT_CONFIGURED' }, 500);
  }

  let bodyText = '';
  let payload;
  try {
    bodyText = await request.text();
    if (!bodyText || bodyText.length > 20000) {
      return json({ ok: false, code: 'INVALID' }, 400);
    }
    payload = JSON.parse(bodyText);
  } catch (error) {
    return json({ ok: false, code: 'INVALID' }, 400);
  }

  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return json({ ok: false, code: 'INVALID' }, 400);
  }

  const userAgent = request.headers.get('User-Agent') || '';
  const hintedPlatform = decodeClientHint(request.headers.get('Sec-CH-UA-Platform'));
  const hintedModel = decodeClientHint(request.headers.get('Sec-CH-UA-Model'));

  // OS/기종은 보조 확인 정보입니다. 브라우저가 제공하지 않으면 '확인 불가'로 기록합니다.
  const os = cleanText(payload.os || detectOs(userAgent, hintedPlatform), 100, '확인 불가');
  const deviceModel = cleanText(hintedModel || payload.deviceModel, 100, '기종 확인 불가');

  const allowedPayload = {
    nick: cleanText(payload.nick, 100),
    uid: cleanText(payload.uid, 30).toUpperCase(),
    age: cleanText(payload.age, 100),
    why: cleanText(payload.why, 2000),
    tour: cleanText(payload.tour, 10),
    ipAddress: ip,
    os,
    deviceModel,
    apiToken: env.APPS_SCRIPT_TOKEN
  };

  try {
    const upstream = await fetch(env.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(allowedPayload),
      redirect: 'follow'
    });

    const responseText = await upstream.text();
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (error) {
      return json({ ok: false, code: 'UPSTREAM_ERROR' }, 502);
    }

    if (!upstream.ok || !result || result.ok !== true) {
      return json({ ok: false, code: result?.error === 'invalid' ? 'INVALID' : 'UPSTREAM_ERROR' }, 502);
    }

    return json({ ok: true }, 200);
  } catch (error) {
    return json({ ok: false, code: 'UPSTREAM_ERROR' }, 502);
  }
}
