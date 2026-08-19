import {NextRequest,NextResponse} from "next/server";
const ALGORITHM="cpsc-comment-theme-matrix/1.0.0",DETAIL_LIMIT=8;
const TAXONOMY=[
 {label:"Regulatory burden and cost",words:["burden","cost","expense","paperwork","duplicat","economic"]},
 {label:"Consumer safety and risk",words:["safety","risk","hazard","injur","death","protect"]},
 {label:"Compliance, testing, and certification",words:["compliance","test","certif","enforce","standard","requirement"]},
 {label:"Small entities and market effects",words:["small business","small entit","manufacturer","retailer","importer","market"]},
 {label:"Regulatory clarity and process",words:["clarity","guidance","interpret","definition","process","procedure","deadline"]},
 {label:"Evidence and data",words:["data","evidence","study","analysis","estimate","research"]},
 {label:"Innovation, competition, and consumer choice",words:["innovation","competition","choice","technology","entrant","design"]},
];
const clean=(v:unknown)=>typeof v==="string"?v.replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim():"";
const apiKey=()=>process.env.REGULATIONS_GOV_API_KEY||"DEMO_KEY";
async function getJson(url:string){const r=await fetch(url,{headers:{Accept:"application/vnd.api+json","User-Agent":"CPSC-Regulatory-Review-Workspace/1.0"},cache:"no-store",signal:AbortSignal.timeout(12_000)});if(!r.ok)throw new Error(`Official Regulations.gov API returned ${r.status}`);return r.json()}
export async function GET(request:NextRequest){
 const docketId=(request.nextUrl.searchParams.get("docketId")||"").trim(),documentId=(request.nextUrl.searchParams.get("documentId")||"").trim();
 if(!/^CPSC-[A-Z0-9-]{4,40}$/i.test(docketId))return NextResponse.json({error:"A valid selected CPSC docket ID is required. The comment-theme matrix cannot run for a record without an official docket identifier.",documentId},{status:422});
 const retrievedAt=new Date().toISOString(),key=apiKey();
 try{
  const params=new URLSearchParams({"filter[docketId]":docketId,"page[number]":"1","page[size]":"50",sort:"postedDate",api_key:key}),listing=await getJson(`https://api.regulations.gov/v4/comments?${params}`),listed=listing.data||[],meta=listing.meta||{};
  const selected=listed.filter((x:any)=>!x.attributes?.withdrawn).slice(0,DETAIL_LIMIT);
  const details=await Promise.all(selected.map(async(item:any)=>{try{return (await getJson(`https://api.regulations.gov/v4/comments/${encodeURIComponent(item.id)}?api_key=${encodeURIComponent(key)}`)).data}catch{return item}}));
  const comments=details.map((item:any)=>{const a=item.attributes||{},text=clean(a.comment),first=clean(a.firstName),last=clean(a.lastName),organization=clean(a.organization),submitterName=[first,last].filter(Boolean).join(" ");return {id:item.id,postedDate:a.postedDate||null,title:clean(a.title)||"Public comment",submitterName:submitterName||null,organization:organization||null,submitterAvailability:submitterName||organization?"published":"unavailable_or_redacted",textAvailable:Boolean(text),text,sourceUrl:`https://www.regulations.gov/comment/${encodeURIComponent(item.id)}`}});
  const themeMap=new Map<string,any>();for(const t of TAXONOMY)themeMap.set(t.label,{theme:t.label,commentIds:[],supportingCommenters:[],comments:[]});
  let unclassified=0;for(const c of comments){if(!c.textAvailable)continue;const lower=c.text.toLowerCase(),matched=TAXONOMY.filter(t=>t.words.some(w=>lower.includes(w)));if(!matched.length){unclassified++;continue}for(const t of matched){const row=themeMap.get(t.label);row.commentIds.push(c.id);row.supportingCommenters.push({commentId:c.id,submitterName:c.submitterName,organization:c.organization,availability:c.submitterAvailability});row.comments.push({commentId:c.id,postedDate:c.postedDate,excerpt:c.text.slice(0,320),sourceUrl:c.sourceUrl})}}
  const themes=[...themeMap.values()].filter(x=>x.commentIds.length).map(x=>({...x,count:x.commentIds.length,humanReviewStatus:"unreviewed"})).sort((a,b)=>b.count-a.count||a.theme.localeCompare(b.theme));
  const total=meta.totalElements??listed.length,textAvailableCount=comments.filter((x:any)=>x.textAvailable).length;
  return NextResponse.json({documentId,docketId,retrievedAt,source:"Regulations.gov API v4 — comments listing and comment-detail endpoints",algorithm:ALGORITHM,method:"Deterministic disclosed-keyword grouping over accessible official public comment text. One comment may appear in multiple themes. Submitter labels are copied only from official firstName, lastName, and organization fields.",totalCommentsReported:total,commentsListed:listed.length,commentsDetailed:comments.length,detailLimit:DETAIL_LIMIT,textAvailableCount,submitterUnavailableCount:comments.filter((x:any)=>x.submitterAvailability!=="published").length,unclassifiedTextComments:unclassified,themes,comments:comments.map((x:any)=>({id:x.id,postedDate:x.postedDate,title:x.title,submitterName:x.submitterName,organization:x.organization,submitterAvailability:x.submitterAvailability,textAvailable:x.textAvailable,sourceUrl:x.sourceUrl})),limitations:`This run analyzes at most ${DETAIL_LIMIT} non-withdrawn comments from the first official listing page because the public API is credential/rate limited. It does not analyze attachments, private fields, withdrawn comments, or comments whose text was unavailable. Theme counts are counts within the detailed comments analyzed, not docket-wide prevalence. Pattern grouping is not an agency finding or legal conclusion.`},{headers:{"Cache-Control":"no-store"}});
 }catch(e){return NextResponse.json({error:`Public comment content could not be retrieved from Regulations.gov. ${e instanceof Error?e.message:"Official service unavailable"}. No themes were generated or substituted. A dependable larger run requires a server-side Regulations.gov API key.`,documentId,docketId,retrievedAt,algorithm:ALGORITHM},{status:502})}
}
