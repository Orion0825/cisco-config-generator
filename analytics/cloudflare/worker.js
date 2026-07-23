const TAIPEI_TIMEZONE = "Asia/Taipei";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(request, env),
      });
    }

    if (url.pathname === "/track" && request.method === "POST") {
      return handleTrack(request, env);
    }

    if (url.pathname === "/today" && request.method === "GET") {
      return handleToday(request, env, url);
    }

    return jsonResponse(request, env, { error: "Not found" }, 404);
  },
};

async function handleTrack(request, env) {
  if (!originAllowed(request, env)) {
    return jsonResponse(request, env, { error: "Origin not allowed" }, 403);
  }

  const body = await readJson(request);
  const site = safeToken(body.site, 48) || "cisco-config-generator";
  const visitorId = safeToken(body.visitorId, 96);
  const path = safeText(body.path, 160) || "/";
  const referrer = safeText(body.referrer, 240);
  const title = safeText(body.title, 120);
  const userAgent = safeText(request.headers.get("user-agent"), 240);

  if (!visitorId) {
    return jsonResponse(request, env, { error: "visitorId is required" }, 400);
  }

  const day = todayInTaipei();
  const createdAt = new Date().toISOString();

  await env.DB.prepare(
    "INSERT INTO visits (site, day, visitor_id, path, referrer, title, user_agent, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  ).bind(site, day, visitorId, path, referrer, title, userAgent, createdAt).run();

  return jsonResponse(request, env, { ok: true, day }, 200);
}

async function handleToday(request, env, url) {
  if (!ownerAuthorized(request, env)) {
    return jsonResponse(request, env, { error: "Unauthorized" }, 401);
  }

  const site = safeToken(url.searchParams.get("site"), 48) || "cisco-config-generator";
  const day = todayInTaipei();

  const pageViewsResult = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM visits WHERE site = ? AND day = ?"
  ).bind(site, day).first();

  const uniqueVisitorsResult = await env.DB.prepare(
    "SELECT COUNT(DISTINCT visitor_id) AS count FROM visits WHERE site = ? AND day = ?"
  ).bind(site, day).first();

  const topPathsResult = await env.DB.prepare(
    "SELECT path, COUNT(*) AS views FROM visits WHERE site = ? AND day = ? GROUP BY path ORDER BY views DESC LIMIT 5"
  ).bind(site, day).all();

  return jsonResponse(request, env, {
    site,
    date: day,
    pageViews: Number(pageViewsResult?.count || 0),
    uniqueVisitors: Number(uniqueVisitorsResult?.count || 0),
    topPaths: Array.isArray(topPathsResult?.results) ? topPathsResult.results : [],
    generatedAt: new Date().toISOString(),
  }, 200);
}

function ownerAuthorized(request, env) {
  const ownerKey = String(env.OWNER_KEY || "");
  if (!ownerKey) return false;
  return request.headers.get("X-Owner-Key") === ownerKey;
}

function originAllowed(request, env) {
  const allowed = String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!allowed.length) return true;

  const origin = request.headers.get("Origin");
  if (!origin) return true;
  return allowed.includes(origin);
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin");
  const allowOrigin = originAllowed(request, env) && origin ? origin : "*";

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,X-Owner-Key",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function jsonResponse(request, env, payload, status = 200) {
  return new Response(JSON.stringify(payload, null, 2), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...corsHeaders(request, env),
    },
  });
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function safeToken(value, maxLength) {
  const cleaned = String(value || "")
    .trim()
    .replace(/[^A-Za-z0-9_.:-]/g, "")
    .slice(0, maxLength);
  return cleaned;
}

function safeText(value, maxLength) {
  return String(value || "")
    .trim()
    .slice(0, maxLength);
}

function todayInTaipei() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TAIPEI_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
