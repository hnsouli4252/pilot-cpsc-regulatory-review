import assert from "node:assert/strict";
import test from "node:test";
import {classifyCachedComment,issueGroupSummary,orderIssueGroups,summarizeCachedComment} from "../app/matrix-classification.ts";

test("reclassifies cached unmatched comments from title and text evidence",()=>{
 const fixtures=[
  {title:"Request for extended effective date",excerpt:"We request a two-year transition period so manufacturers can complete redesign work.",themeTags:["Other / no theme match"]},
  {title:"Debris penetration performance data",excerpt:"The attached study provides incident data and structural performance evidence.",themeTags:["Other / no theme match"]},
  {title:"Comment on product scope",excerpt:"The rule should exclude products that do not meet the covered-product definition.",themeTags:["Other / no theme match"]},
 ];
 const tags=fixtures.map(classifyCachedComment);
 assert.ok(tags[0].includes("Implementation timing and transition"));
 assert.ok(tags[1].includes("Evidence and data"));
 assert.ok(tags[1].includes("Product design and performance"));
 assert.ok(tags[2].includes("Scope, definitions, and applicability"));
 assert.equal(tags.flat().includes("Other / no theme match"),false);
});

test("keeps only genuinely unsupported cached records unmatched",()=>{
 assert.deepEqual(classifyCachedComment({title:"Comment from submitter",excerpt:"See attached.",themeTags:["Other / no theme match"]}),["Other / no theme match"]);
 assert.deepEqual(classifyCachedComment({title:"Comment from submitter",excerpt:"Comment text was not available in the retrieved official record.",textAvailable:false,themeTags:["Other / no theme match"]},"Request for information on reducing regulatory burdens"),["Other / no theme match"]);
 assert.deepEqual(classifyCachedComment({title:"Comment from submitter",excerpt:"See attached file.",textAvailable:true,themeTags:["Other / no theme match"]},"Request for information on reducing regulatory burdens"),["Regulatory burden and cost"]);
});

test("meaningfully reduces a 28-comment unmatched cache fixture",()=>{
 const supported=[
  "We request a longer effective date and transition period.","This incident data documents an injury hazard.","The product definition should exclude replacement parts.","Testing and certification requirements need clarification.","The structural design must prevent debris penetration.","Small manufacturers face substantial compliance cost.",
 ];
 const fixture=[...Array.from({length:24},(_,i)=>({title:`Cached comment ${i+1}`,excerpt:supported[i%supported.length],themeTags:["Other / no theme match"]})),...Array.from({length:4},(_,i)=>({title:`Comment from submitter ${i+1}`,excerpt:"See attached.",themeTags:["Other / no theme match"]}))];
 const remaining=fixture.filter(comment=>classifyCachedComment(comment).includes("Other / no theme match"));
 assert.equal(remaining.length,4);
});

test("puts catch-all groups last regardless of count",()=>{
 const ordered=orderIssueGroups([{theme:"Other / no theme match",count:28},{theme:"Consumer safety and risk",count:4},{theme:"Evidence and data",count:9}]);
 assert.deepEqual(ordered.map(x=>x.theme),["Evidence and data","Consumer safety and risk","Other / no theme match"]);
});

test("summaries select requests or concerns and avoid attachment filler",()=>{
 const summary=summarizeCachedComment({title:"Industry comment",excerpt:"See attached. We request that the Commission extend the effective date by 24 months to allow redesign and testing."});
 assert.match(summary,/request.*extend the effective date/i);
 assert.doesNotMatch(summary,/^see attached/i);
 assert.match(issueGroupSummary("Consumer safety and risk"),/injuries|hazards|risk/i);
});
