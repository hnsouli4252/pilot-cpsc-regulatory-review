import { NextRequest, NextResponse } from "next/server";

function twelveMonthsAgo(now:Date){const from=new Date(now);from.setUTCMonth(from.getUTCMonth()-12);return from.toISOString().slice(0,10)}
const hits=new Map<string,{count:number;reset:number}>();
async function federalRegisterOverview(retrieved:Date,fromDate:string){
 const params=new URLSearchParams({"conditions[agencies][]":"consumer-product-safety-commission","conditions[publication_date][gte]":fromDate,per_page:"1000",order:"newest"});
 const response=await fetch(`https://www.federalregister.gov/api/v1/documents.json?${params}`,{headers:{Accept:"application/json","User-Agent":"CPSC-Regulatory-Review-Workspace/1.0"},cache:"no-store",signal:AbortSignal.timeout(12_000)});if(!response.ok)throw new Error();
 const payload=await response.json(),data=payload.results||[],total=payload.count??data.length,complete=data.length>=total;
 const records=data.map((item:any)=>({id:`FR-${item.document_number}`,title:item.title||"Untitled record",docketId:null,documentType:item.type||"Federal Register document",postedDate:item.publication_date||null,openForComment:false,frDocNum:item.document_number||null,regulationsUrl:item.html_url,docketUrl:null}));
 const counts=records.reduce((a:any,x:any)=>{a[x.documentType]=(a[x.documentType]||0)+1;return a},{}),typeAggregation=Object.entries(counts).map(([label,count])=>({label,count}));
 const cadence=complete?Object.entries(records.reduce((a:any,x:any)=>{const month=x.postedDate?.slice(0,7)||"Unknown";a[month]=(a[month]||0)+1;return a},{})).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))).map(([month,count])=>({month,count})):[];
 return {source:"FederalRegister.gov API — official fallback after Regulations.gov rate limit/unavailability",agency:"CPSC",retrievedAt:retrieved.toISOString(),fromDate,toDate:retrieved.toISOString().slice(0,10),totalElements:total,recordsReturned:data.length,complete,typeAggregation,cadence,latest:records.slice(0,6),coverage:complete?"All Federal Register records reported by this bounded fallback query were returned. The listing does not supply dependable docket identifiers, so no unique-docket metric is presented.":`The Federal Register API reports ${total} records; ${data.length} were returned. Cadence and other whole-set breakdowns are limited accordingly.`};
}
export async function GET(request:NextRequest){
 const ip=request.headers.get("cf-connecting-ip")||"unknown",now=Date.now(),bucket=hits.get(ip);
 if(!bucket||bucket.reset<now)hits.set(ip,{count:1,reset:now+60_000});else if(bucket.count>=30)return NextResponse.json({error:"Overview refresh limit reached. Please wait one minute."},{status:429});else bucket.count+=1;
 const retrieved=new Date(),fromDate=twelveMonthsAgo(retrieved);
 const params=new URLSearchParams({"filter[agencyId]":"CPSC","filter[postedDate][ge]":fromDate,sort:"-postedDate","page[size]":"250",api_key:"DEMO_KEY"});
 try{
  const response=await fetch(`https://api.regulations.gov/v4/documents?${params}`,{headers:{Accept:"application/vnd.api+json","User-Agent":"CPSC-Regulatory-Review-Workspace/1.0"},cache:"no-store",signal:AbortSignal.timeout(12_000)});
  if(!response.ok)return NextResponse.json(await federalRegisterOverview(retrieved,fromDate),{headers:{"Cache-Control":"no-store"}}); const payload=await response.json(),meta=payload.meta||{},data=payload.data||[];
  const total=meta.totalElements??data.length,complete=data.length>=total;
  const typeAggregation=(meta.aggregations?.documentType||[]).map((x:any)=>({label:x.label,count:x.docCount})).filter((x:any)=>x.count>0);
  const records=data.map((item:any)=>({id:item.id,title:item.attributes?.title||"Untitled record",docketId:item.attributes?.docketId||null,documentType:item.attributes?.documentType||"Document",postedDate:item.attributes?.postedDate||null,openForComment:Boolean(item.attributes?.openForComment),frDocNum:item.attributes?.frDocNum||null,regulationsUrl:`https://www.regulations.gov/document/${encodeURIComponent(item.id)}`,docketUrl:item.attributes?.docketId?`https://www.regulations.gov/docket/${encodeURIComponent(item.attributes.docketId)}`:null}));

  const cadence=complete?Object.entries(records.reduce((a:any,x:any)=>{const month=x.postedDate?.slice(0,7)||"Unknown";a[month]=(a[month]||0)+1;return a},{})).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))).map(([month,count])=>({month,count})):[];
  return NextResponse.json({source:"Regulations.gov API v4 — documents endpoint",agency:"CPSC",retrievedAt:retrieved.toISOString(),fromDate,toDate:retrieved.toISOString().slice(0,10),totalElements:total,recordsReturned:data.length,complete,typeAggregation,cadence,latest:records.slice(0,6),coverage:complete?"All records reported by this bounded query were returned for overview calculations.":`The API reports ${total} records; only ${data.length} were returned, so whole-set breakdowns are withheld as incomplete.`},{headers:{"Cache-Control":"no-store"}})
 }catch{try{return NextResponse.json(await federalRegisterOverview(retrieved,fromDate),{headers:{"Cache-Control":"no-store"}})}catch{return NextResponse.json({error:"Neither Regulations.gov nor the official Federal Register fallback responded. No demo overview was substituted.",source:"Regulations.gov API v4 and FederalRegister.gov API",fromDate,retrievedAt:retrieved.toISOString()},{status:502})}}
}
