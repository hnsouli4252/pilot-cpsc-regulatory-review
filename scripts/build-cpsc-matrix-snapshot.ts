import {mkdir,readFile,writeFile} from "node:fs/promises";
import {classifyCachedComment,summarizeCachedComment,orderIssueGroups} from "../app/matrix-classification.ts";

const docketId=process.argv[2]||"CPSC-2025-0009";
const key=process.env.REGULATIONS_GOV_API_KEY||"DEMO_KEY";
const output=new URL(`../public/data/${docketId.toLowerCase()}-matrix.json`,import.meta.url);
const clean=(value:unknown)=>typeof value==="string"?value.replace(/<[^>]+>/g," ").replace(/\s+/g," ").trim():"";
const domains=[
 ["Electrical",/\b(electr\w*|shock\w*|batter(?:y|ies)|voltage|wiring|charger\w*)\b/gi],
 ["Mechanical",/\b(mechanical|moving parts?|structural|breakage|crush\w*|pinch\w*|impact\w*)\b/gi],
 ["Thermal",/\b(thermal|temperature\w*|overheat\w*|hot surfaces?|burn(?:s|ed|ing)?|scald\w*)\b/gi],
 ["Chemical",/\b(chemical\w*|corrosive\w*|solvent\w*|acid\w*|alkali\w*|leak\w*)\b/gi],
 ["Fire/Explosion",/\b(fires?|flames?|flammab\w*|combust\w*|ignit\w*|explod\w*|explosion\w*|blast\w*)\b/gi],
 ["Choking/Ingestion",/\b(chok\w*|ingest\w*|swallow\w*|small parts?|aspirat\w*)\b/gi],
 ["Laceration",/\b(lacerat\w*|cuts?|sharp edges?|punctur\w*|blades?)\b/gi],
 ["Fall/Tip-over",/\b(falls?|tip[- ]over|tipping|unstable|rollover)\b/gi],
 ["Entrapment/Strangulation",/\b(entrap\w*|strang\w*|suffocat\w*|cords?|wedg\w*|pinning)\b/gi],
 ["Toxicological",/\b(toxic\w*|poison\w*|carcinogen\w*|lead(?: exposure| content| poisoning| paint)?|phthalate\w*|inhalation)\b/gi],
 ["Labeling/Instruction",/\b(label\w*|warnings?|instructions?|manuals?|disclosures?|markings?)\b/gi],
] as const;

const wait=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
async function official(url:string){for(let attempt=0;attempt<4;attempt++){const response=await fetch(url,{headers:{Accept:"application/vnd.api+json","User-Agent":"CPSC-Regulatory-Review-Workspace-Snapshot/1.0"}});if(response.ok)return response.json() as Promise<any>;if(response.status!==429||attempt===3)throw new Error(`Official API returned ${response.status} for ${new URL(url).pathname}`);const retryAfter=Math.max(15,Number(response.headers.get("retry-after"))||60);console.log(`Rate limited; resuming in ${retryAfter} seconds.`);await wait(retryAfter*1000)}throw new Error("Official API retry loop ended unexpectedly")}
const listingUrl=new URL("https://api.regulations.gov/v4/comments");
listingUrl.search=new URLSearchParams({"filter[docketId]":docketId,"page[number]":"1","page[size]":"250",sort:"-postedDate",api_key:key}).toString();
const listing=await official(listingUrl.toString());
if(listing.meta?.hasNextPage)throw new Error("Snapshot builder is intentionally bounded to one listing page; docket exceeds 250 comments.");
const rows=(listing.data||[]).filter((item:any)=>!item.attributes?.withdrawn);
const checkpoint=new URL(`../.cache/${docketId.toLowerCase()}-details.json`,import.meta.url);
await mkdir(new URL("../.cache/",import.meta.url),{recursive:true});
let details:any[]=[];try{details=JSON.parse(await readFile(checkpoint,"utf8"))}catch{}
const completed=new Set(details.map(item=>item.id));
for(const item of rows){if(completed.has(item.id))continue;const payload=await official(`https://api.regulations.gov/v4/comments/${encodeURIComponent(item.id)}?api_key=${encodeURIComponent(key)}`);details.push(payload.data);completed.add(item.id);await writeFile(checkpoint,JSON.stringify(details));await wait(1100)}
const comments=details.map((item:any)=>{const a=item.attributes||{},excerpt=clean(a.comment),title=clean(a.title)||"Public comment",hazardBasis=domains.map(([tag,pattern])=>({tag,terms:[...new Set(excerpt.match(pattern)?.map(x=>x.toLowerCase())||[])]})).filter(x=>x.terms.length),base={id:item.id,postedDate:a.postedDate||null,title,submitterName:null,organization:clean(a.organization)||null,submitterAvailability:clean(a.organization)?"published":"unavailable_or_redacted",textAvailable:Boolean(excerpt),textStatus:excerpt?"available":"unavailable_from_official_detail",summary:"",excerpt:excerpt||"Comment text was not available in the retrieved official record.",sourceUrl:`https://www.regulations.gov/comment/${encodeURIComponent(item.id)}`,detailRetrieved:true,detailStatus:null,themeTags:["Other / no theme match"],hazardTags:hazardBasis.length?hazardBasis.map(x=>x.tag):["Unclear/Needs review"],hazardBasis};return {...base,themeTags:classifyCachedComment(base),summary:summarizeCachedComment(base)}});
const themeNames=[...new Set(comments.flatMap((comment:any)=>comment.themeTags))];
const themes=orderIssueGroups(themeNames.map(theme=>({theme,count:comments.filter((comment:any)=>comment.themeTags.includes(theme)).length,commentIds:comments.filter((comment:any)=>comment.themeTags.includes(theme)).map((comment:any)=>comment.id),humanReviewStatus:"unreviewed"})));
const domainNames=[...new Set(comments.flatMap((comment:any)=>comment.hazardTags))];
const domainAggregation=domainNames.map(domain=>({domain,count:comments.filter((comment:any)=>comment.hazardTags.includes(domain)).length})).sort((a,b)=>b.count-a.count||a.domain.localeCompare(b.domain));
const retrievedAt=new Date().toISOString(),total=listing.meta?.totalElements??rows.length;
const snapshot={schemaVersion:1,documentId:"CPSC-2025-0009-0001",docketId,retrievedAt,source:"Regulations.gov API v4 — committed official docket snapshot",credentialMode:key==="DEMO_KEY"?"shared_public_demo_key":"configured_server_key",algorithm:"cpsc-comment-issue-matrix/2.3.0",hazardTaxonomyVersion:"cpsc-comment-hazard-domains/2.0.0",method:"One-time official retrieval committed with the application. Issue groups and hazard domains are assigned per cached comment; aggregates are calculated afterward.",totalCommentsReported:total,commentsListed:listing.data.length,totalNonWithdrawn:rows.length,listingComplete:listing.data.length>=total,commentsDetailed:comments.length,detailRetrievedCount:comments.length,detailUnavailableCount:0,detailRateLimitedCount:0,textAvailableCount:comments.filter((c:any)=>c.textAvailable).length,submitterUnavailableCount:comments.filter((c:any)=>c.submitterAvailability!=="published").length,unclassifiedTextComments:comments.filter((c:any)=>c.textAvailable&&c.themeTags.includes("Other / no theme match")).length,themes,domainAggregation,comments,limitations:`Committed snapshot of ${comments.length} non-withdrawn official comments retrieved ${retrievedAt}. Attachments, private fields, and withdrawn comments are not analyzed. Tags require human review.`};
await mkdir(new URL("../public/data/",import.meta.url),{recursive:true});
await writeFile(output,JSON.stringify(snapshot,null,2)+"\n");
console.log(JSON.stringify({output:output.pathname,reported:total,listed:listing.data.length,comments:comments.length,unmatched:snapshot.unclassifiedTextComments,retrievedAt},null,2));
