import { NextRequest, NextResponse } from "next/server";

const hits = new Map<string, { count: number; reset: number }>();
const MAX_PAGE = 5;
const PAGE_SIZE = 20;

function twelveMonthsAgo(now: Date) {
  const from = new Date(now);
  from.setUTCMonth(from.getUTCMonth() - 12);
  return from.toISOString().slice(0, 10);
}

async function federalRegisterFallback(query:string,scope:"year"|"all",page:number,retrievedAt:Date,fromDate:string|null){
  const words=[...new Set(query.toLowerCase().split(/\W+/).filter((x:string)=>x.length>2))].slice(0,5),terms=words.map(x=>x.slice(0,5));
  const payloads=await Promise.all(words.map(async word=>{const params=new URLSearchParams({"conditions[agencies][]":"consumer-product-safety-commission","conditions[term]":word,per_page:"1000",page:"1",order:"relevance"});if(fromDate)params.set("conditions[publication_date][gte]",fromDate);const response=await fetch(`https://www.federalregister.gov/api/v1/documents.json?${params}`,{headers:{Accept:"application/json","User-Agent":"CPSC-Regulatory-Review-Workspace/1.0"},cache:"no-store",signal:AbortSignal.timeout(12_000)});if(!response.ok)throw new Error("Federal Register fallback unavailable");return response.json()}));
  const unique=new Map<string,any>();for(const payload of payloads)for(const item of payload.results||[])unique.set(item.document_number,item);
  const ranked=[...unique.values()].map((item:any,index:number)=>{const title=(item.title||"").toLowerCase();return {item,index,score:terms.reduce((n:number,t:string)=>n+(title.includes(t)?1:0),0)}}).sort((a:any,b:any)=>b.score-a.score||a.index-b.index).map((x:any)=>x.item);
  const base=ranked.slice((page-1)*PAGE_SIZE,page*PAGE_SIZE);
  const details=await Promise.all(base.map(async(item:any)=>{try{const r=await fetch(`https://www.federalregister.gov/api/v1/documents/${encodeURIComponent(item.document_number)}.json`,{headers:{Accept:"application/json","User-Agent":"CPSC-Regulatory-Review-Workspace/1.0"},cache:"no-store",signal:AbortSignal.timeout(8_000)});return r.ok?await r.json():item}catch{return item}}));
  const records=details.map((item:any)=>{const rg=item.regulations_dot_gov_info||{},docketId=rg.docket_id||item.dockets?.[0]?.id||null,documentId=rg.document_id||`FR-${item.document_number}`;return {id:documentId,title:item.title||"Untitled record",docketId,documentType:item.type||"Federal Register document",postedDate:item.publication_date||null,commentEndDate:item.comments_close_on||null,openForComment:Boolean(item.comments_close_on&&new Date(item.comments_close_on)>=retrievedAt),frDocNum:item.document_number||null,regulationsUrl:rg.document_id?`https://www.regulations.gov/document/${encodeURIComponent(rg.document_id)}`:item.html_url,docketUrl:docketId?`https://www.regulations.gov/docket/${encodeURIComponent(docketId)}`:null}});
  const total=ranked.length,totalPages=Math.min(Math.ceil(total/PAGE_SIZE)||1,MAX_PAGE);
  return {query,agency:"CPSC",scope,source:scope==="all"?"FederalRegister.gov API — official historical search":"FederalRegister.gov API — official fallback after Regulations.gov rate limit/unavailability",retrievedAt:retrievedAt.toISOString(),fromDate,toDate:retrievedAt.toISOString().slice(0,10),page,totalElements:total,totalPages,hasNextPage:page<totalPages,coverageLimit:`The historical/fallback search unions up to 1,000 official Federal Register matches for each of the first five query terms, removes duplicates, ranks title-term overlap, and exposes the first ${MAX_PAGE} pages. It covers Federal Register documents, not every Regulations.gov document type.`,records};
}

export async function GET(request: NextRequest) {
  const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for")?.split(",")[0] || "unknown";
  const nowMs = Date.now();
  const bucket = hits.get(ip);
  if (!bucket || bucket.reset < nowMs) hits.set(ip, { count: 1, reset: nowMs + 60_000 });
  else if (bucket.count >= 30) return NextResponse.json({ error: "Search limit reached. Please wait one minute and try again." }, { status: 429 });
  else bucket.count += 1;

  const query = (request.nextUrl.searchParams.get("q") || "").trim().replace(/\s+/g, " ");
  const scope = request.nextUrl.searchParams.get("scope") === "all" ? "all" : "year";
  const page = Math.min(MAX_PAGE, Math.max(1, Number(request.nextUrl.searchParams.get("page")) || 1));
  if (query.length < 2 || query.length > 80 || /[<>\u0000-\u001F]/.test(query)) {
    return NextResponse.json({ error: "Enter 2–80 plain-text characters." }, { status: 400 });
  }

  const retrievedAt = new Date();
  const fromDate = scope === "year" ? twelveMonthsAgo(retrievedAt) : null;
  const params = new URLSearchParams({
    "filter[searchTerm]": query,
    "filter[agencyId]": "CPSC",
    "page[number]": String(page),
    "page[size]": String(PAGE_SIZE),
    api_key: "DEMO_KEY",
  });
  if (scope === "year") params.set("sort", "-postedDate");
  if (fromDate) params.set("filter[postedDate][ge]", fromDate);

  try {
    if(scope==="all")return NextResponse.json(await federalRegisterFallback(query,scope,page,retrievedAt,fromDate),{headers:{"Cache-Control":"no-store"}});
    const response = await fetch(`https://api.regulations.gov/v4/documents?${params}`, {
      headers: { Accept: "application/vnd.api+json", "User-Agent": "CPSC-Regulatory-Review-Workspace/1.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return NextResponse.json(await federalRegisterFallback(query,scope,page,retrievedAt,fromDate), { headers: { "Cache-Control": "no-store" } });
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
      query, agency: "CPSC", scope, source: "Regulations.gov API v4 — documents endpoint",
      retrievedAt: retrievedAt.toISOString(), fromDate, toDate: retrievedAt.toISOString().slice(0, 10),
      page: meta.pageNumber || page, pageSize: meta.pageSize || PAGE_SIZE,
      totalElements: meta.totalElements ?? records.length, totalPages: Math.min(meta.totalPages || 1, MAX_PAGE),
      hasNextPage: Boolean(meta.hasNextPage) && page < MAX_PAGE, coverageLimit: `Up to ${MAX_PAGE * PAGE_SIZE} matching document records across the first ${MAX_PAGE} pages.`,
      records,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    try{return NextResponse.json(await federalRegisterFallback(query,scope,page,retrievedAt,fromDate),{headers:{"Cache-Control":"no-store"}})}catch{return NextResponse.json({ error: "Neither Regulations.gov nor the official Federal Register fallback responded. No cached results were substituted.", source: "Regulations.gov API v4 and FederalRegister.gov API", fromDate, retrievedAt: retrievedAt.toISOString() }, { status: 502 })}
  }
}
