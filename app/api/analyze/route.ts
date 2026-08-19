import {NextRequest,NextResponse} from "next/server";

const ALGORITHM="cpsc-issue-extractor/1.0.1";
const TAXONOMY=[
 {label:"Regulatory burden and cost",words:["burden","cost","expense","economic","paperwork","duplicat"]},
 {label:"Consumer safety and risk",words:["safety","risk","hazard","injur","consumer","protect"]},
 {label:"Compliance and enforcement",words:["compliance","enforce","require","certif","test","standard"]},
 {label:"Evidence and data needs",words:["data","evidence","information","study","analysis","estimate"]},
 {label:"Small entities and market effects",words:["small business","small entit","manufacturer","importer","market"]},
 {label:"Process and implementation",words:["comment","implement","deadline","practice","procedure","report"]},
];
const clean=(s:string)=>s.replace(/<[^>]+>/g," ").replace(/-{5,}/g," ").replace(/\s+/g," ").trim();
function extract(text:string,sourceUrl:string){
 const passages=text.split(/(?<=[.!?])\s+/).map(clean).filter(x=>x.length>=70&&x.length<=700&&!/(telephone:|email:|email&#|street address|billing code|agency:|\[cpsc-|docket no\.)/i.test(x));
 return TAXONOMY.map(t=>{const hits=passages.map((p,index)=>{const scoring=p.toLowerCase().replaceAll("consumer product safety commission","");return {p,index,score:t.words.reduce((n,w)=>n+(scoring.includes(w)?1:0),0)}}).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||a.index-b.index).slice(0,3);return {issue:t.label,evidenceCount:hits.length,confidence:hits.length>=3?"high":hits.length===2?"moderate":"limited",humanReviewStatus:"unreviewed",evidence:hits.map(x=>({passage:x.p.slice(0,420),sourceUrl,locator:`sentence ${x.index+1}`}))}}).filter(x=>x.evidenceCount>0).sort((a,b)=>b.evidenceCount-a.evidenceCount);
}
export async function GET(request:NextRequest){
 const frDocNum=(request.nextUrl.searchParams.get("frDocNum")||"").trim(),documentId=(request.nextUrl.searchParams.get("documentId")||"").trim();
 if(!/^\d{4}-\d{4,6}$/.test(frDocNum))return NextResponse.json({error:"This record does not expose a Federal Register document number, so authoritative full text could not be retrieved. Use the official source link and retry only after a full-text identifier is available.",documentId},{status:422});
 const retrievedAt=new Date().toISOString();
 try{
  const detailResponse=await fetch(`https://www.federalregister.gov/api/v1/documents/${encodeURIComponent(frDocNum)}.json`,{headers:{Accept:"application/json","User-Agent":"CPSC-Regulatory-Review-Workspace/1.0"},cache:"no-store",signal:AbortSignal.timeout(12_000)});
  if(!detailResponse.ok)throw new Error();const detail=await detailResponse.json(),textUrl=detail.raw_text_url||detail.body_html_url;
  if(!textUrl)throw new Error();const textResponse=await fetch(textUrl,{headers:{Accept:"text/plain,text/html","User-Agent":"CPSC-Regulatory-Review-Workspace/1.0"},cache:"no-store",signal:AbortSignal.timeout(12_000)});if(!textResponse.ok)throw new Error();
  const raw=await textResponse.text(),text=clean(raw),issues=extract(text,detail.html_url||textUrl);
  return NextResponse.json({documentId,frDocNum,title:detail.title||null,retrievedAt,source:"FederalRegister.gov API and official full-text endpoint",sourceUrl:detail.html_url||textUrl,textUrl,contentCharacters:text.length,algorithm:ALGORITHM,method:"Deterministic keyword-taxonomy extraction over official notice/rule sentence text; no language model and no inferred commenter position.",issues,limitations:"Issue labels are machine-extracted review leads from the selected Federal Register document text. They are not findings, recommendations, comment synthesis, or agency determinations. Comment attachments and comments are not analyzed by this route."},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"The official Federal Register full-text source could not be retrieved. No issue matrix was generated or substituted.",documentId,frDocNum,retrievedAt,algorithm:ALGORITHM},{status:502})}
}
