import { NextRequest, NextResponse } from "next/server";

const hits = new Map<string, { count: number; reset: number }>();
const MAX_PAGE = 5;
const PAGE_SIZE = 20;

function threeMonthsAgo(now: Date) {
  const from = new Date(now);
  from.setUTCMonth(from.getUTCMonth() - 3);
  return from.toISOString().slice(0, 10);
}

export async function GET(request: NextRequest) {
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const nowMs = Date.now();
  const bucket = hits.get(ip);
  if (!bucket || bucket.reset < nowMs) hits.set(ip, { count: 1, reset: nowMs + 60_000 });
  else if (bucket.count >= 30) return NextResponse.json({ error: "Search limit reached. Please wait one minute and try again." }, { status: 429 });
  else bucket.count += 1;

  const query = (request.nextUrl.searchParams.get("q") || "").trim().replace(/\s+/g, " ");
  const page = Math.min(MAX_PAGE, Math.max(1, Number(request.nextUrl.searchParams.get("page")) || 1));
  if (query.length < 2 || query.length > 80 || /[<>\u0000-\u001F]/.test(query)) {
    return NextResponse.json({ error: "Enter 2–80 plain-text characters." }, { status: 400 });
  }

  const retrievedAt = new Date();
  const fromDate = threeMonthsAgo(retrievedAt);
  const params = new URLSearchParams({
    "filter[searchTerm]": query,
    "filter[agencyId]": "CPSC",
    "filter[postedDate][ge]": fromDate,
    sort: "-postedDate",
    "page[number]": String(page),
    "page[size]": String(PAGE_SIZE),
    api_key: "DEMO_KEY",
  });

  try {
    const response = await fetch(`https://api.regulations.gov/v4/documents?${params}`, {
      headers: { Accept: "application/vnd.api+json", "User-Agent": "CPSC-Regulatory-Review-Workspace/1.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(`Official API returned ${response.status}`);
    const payload = await response.json();
    const records = (payload.data || []).map((item: any) => ({
      id: item.id,
      title: item.attributes?.title || "Untitled record",
      docketId: item.attributes?.docketId || null,
      documentType: item.attributes?.documentType || "Document",
      postedDate: item.attributes?.postedDate || null,
      commentEndDate: item.attributes?.commentEndDate || null,
      openForComment: Boolean(item.attributes?.openForComment),
      frDocNum: item.attributes?.frDocNum || null,
      regulationsUrl: `https://www.regulations.gov/document/${encodeURIComponent(item.id)}`,
      docketUrl: item.attributes?.docketId ? `https://www.regulations.gov/docket/${encodeURIComponent(item.attributes.docketId)}` : null,
    }));
    const meta = payload.meta || {};
    return NextResponse.json({
      query, agency: "CPSC", source: "Regulations.gov API v4 — documents endpoint",
      retrievedAt: retrievedAt.toISOString(), fromDate, toDate: retrievedAt.toISOString().slice(0, 10),
      page: meta.pageNumber || page, pageSize: meta.pageSize || PAGE_SIZE,
      totalElements: meta.totalElements ?? records.length, totalPages: Math.min(meta.totalPages || 1, MAX_PAGE),
      hasNextPage: Boolean(meta.hasNextPage) && page < MAX_PAGE, coverageLimit: `Up to ${MAX_PAGE * PAGE_SIZE} matching document records across the first ${MAX_PAGE} pages.`,
      records,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "The official Regulations.gov service did not respond. No cached or demo results were substituted.", source: "Regulations.gov API v4", fromDate, retrievedAt: retrievedAt.toISOString() }, { status: 502 });
  }
}
