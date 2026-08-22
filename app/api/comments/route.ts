import { NextRequest, NextResponse } from "next/server";

const hits = new Map<string, { count: number; reset: number }>();
const PAGE_SIZE = 20;
const apiKey=()=>process.env.REGULATIONS_GOV_API_KEY||"DEMO_KEY";

export async function GET(request: NextRequest) {
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const now = Date.now(), bucket = hits.get(ip);
  if (!bucket || bucket.reset < now) hits.set(ip, { count: 1, reset: now + 60_000 });
  else if (bucket.count >= 30) return NextResponse.json({ error: "Comment lookup limit reached. Please wait one minute." }, { status: 429 });
  else bucket.count += 1;
  const docketId = (request.nextUrl.searchParams.get("docketId") || "").trim();
  const page = Math.min(10, Math.max(1, Number(request.nextUrl.searchParams.get("page")) || 1));
  if (!/^CPSC-[A-Z0-9-]{4,40}$/i.test(docketId)) return NextResponse.json({ error: "A valid CPSC docket ID is required." }, { status: 400 });
  const retrievedAt = new Date().toISOString();
  const key=apiKey(),credentialMode=process.env.REGULATIONS_GOV_API_KEY?"configured_server_key":"shared_public_demo_key";
  const params = new URLSearchParams({ "filter[docketId]": docketId, "page[number]": String(page), "page[size]": String(PAGE_SIZE), sort: "-postedDate", api_key:key });
  try {
    const response = await fetch(`https://api.regulations.gov/v4/comments?${params}`, { headers: { Accept: "application/vnd.api+json", "User-Agent": "CPSC-Regulatory-Review-Workspace/1.0" }, cache: "no-store", signal: AbortSignal.timeout(12_000) });
    if (!response.ok) return NextResponse.json({error:response.status===429?(credentialMode==="shared_public_demo_key"?"The shared public Regulations.gov API quota is temporarily exhausted. Retry in about one minute. Dependable production access requires an administrator to configure REGULATIONS_GOV_API_KEY as a server-side Sites secret.":"The configured Regulations.gov credential was rate-limited. Retry later or have an administrator review its quota."):`The official Regulations.gov comments service returned ${response.status}. No submissions were substituted.`,docketId,retrievedAt,credentialMode},{status:response.status===429?429:502,headers:response.status===429?{"Retry-After":"60"}:undefined});
    const payload = await response.json(), meta = payload.meta || {};
    const comments = (payload.data || []).map((item:any)=>({ id:item.id, docketId, title:item.attributes?.title || "Public submission", postedDate:item.attributes?.postedDate || null, agencyId:item.attributes?.agencyId || "CPSC", withdrawn:Boolean(item.attributes?.withdrawn), url:`https://www.regulations.gov/comment/${encodeURIComponent(item.id)}` }));
    return NextResponse.json({ docketId, source:"Regulations.gov API v4 — comments endpoint", credentialMode, retrievedAt, page:meta.pageNumber||page, pageSize:meta.pageSize||PAGE_SIZE, totalElements:meta.totalElements??comments.length, officialTotalPages:meta.totalPages||1,totalPages:Math.min(meta.totalPages||1,10), hasNextPage:Boolean(meta.hasNextPage)&&page<10, comments, coverageLimit:`Official API reports ${meta.totalElements??comments.length} comments across ${meta.totalPages||1} page(s). This workspace displays 20 per page and exposes at most the first 10 pages; current page ${meta.pageNumber||page} returned ${comments.length}.` }, { headers:{"Cache-Control":"no-store"} });
  } catch {
    return NextResponse.json({ error:"The official Regulations.gov comments service did not respond. Retry later; no submissions were substituted.", docketId, retrievedAt, credentialMode }, { status:502 });
  }
}
