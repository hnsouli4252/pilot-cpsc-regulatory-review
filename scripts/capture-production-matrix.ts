import {mkdir,writeFile} from "node:fs/promises";
import {classifyCachedComment,summarizeCachedComment,orderIssueGroups,CATCH_ALL_ISSUES} from "../app/matrix-classification.ts";

const docketId="CPSC-2025-0009",documentId="CPSC-2025-0009-0001";
const endpoint="https://cpsc-regulatory-review.hala-maktabi.chatgpt.site/api/analyze";
async function batch(offset:number){const url=new URL(endpoint);url.search=new URLSearchParams({documentId,docketId,detailOffset:String(offset),detailBatchSize:"30"}).toString();const response=await fetch(url);if(!response.ok)throw new Error(`Production official-source route returned ${response.status}`);return response.json() as Promise<any>}
const first=await batch(0),second=first.hasMore?await batch(first.nextOffset):null;
const original=[...first.comments,...(second?.comments||[])];
const before=original.filter(comment=>comment.textAvailable&&comment.themeTags.some((tag:string)=>CATCH_ALL_ISSUES.has(tag))).length;
const comments=original.map(comment=>({...comment,themeTags:classifyCachedComment(comment),summary:summarizeCachedComment(comment)}));
const themeNames=[...new Set<string>(comments.flatMap(comment=>comment.themeTags))];
const themes=orderIssueGroups(themeNames.map(theme=>({theme,count:comments.filter(comment=>comment.themeTags.includes(theme)).length,commentIds:comments.filter(comment=>comment.themeTags.includes(theme)).map(comment=>comment.id),humanReviewStatus:"unreviewed"})));
const domainNames=[...new Set<string>(comments.flatMap(comment=>comment.hazardTags))];
const domainAggregation=domainNames.map(domain=>({domain,count:comments.filter(comment=>comment.hazardTags.includes(domain)).length})).sort((a,b)=>b.count-a.count||a.domain.localeCompare(b.domain));
const base=second||first,after=comments.filter(comment=>comment.textAvailable&&comment.themeTags.some((tag:string)=>CATCH_ALL_ISSUES.has(tag))).length;
const snapshot={...base,schemaVersion:1,retrievedAt:first.retrievedAt,source:"Regulations.gov API v4 — committed official docket snapshot",algorithm:"cpsc-comment-issue-matrix/2.3.0",method:"One-time official retrieval committed with the application. Issue groups and hazard domains are assigned per cached comment; aggregates are calculated afterward.",comments,commentsDetailed:comments.length,detailRetrievedCount:comments.filter(comment=>comment.detailRetrieved).length,detailUnavailableCount:comments.filter(comment=>!comment.detailRetrieved).length,textAvailableCount:comments.filter(comment=>comment.textAvailable).length,unclassifiedTextComments:after,themes,domainAggregation,hasMore:false,nextOffset:comments.length,limitations:`Committed snapshot of ${comments.length} non-withdrawn official comments retrieved ${first.retrievedAt}. Attachments, private fields, and withdrawn comments are not analyzed. Tags require human review.`};
const output=new URL(`../public/data/${docketId.toLowerCase()}-matrix.json`,import.meta.url);await mkdir(new URL("../public/data/",import.meta.url),{recursive:true});await writeFile(output,JSON.stringify(snapshot,null,2)+"\n");
console.log(JSON.stringify({output:output.pathname,reported:snapshot.totalCommentsReported,comments:comments.length,textAvailable:snapshot.textAvailableCount,before,after,groups:themes.map(group=>[group.theme,group.count])},null,2));
