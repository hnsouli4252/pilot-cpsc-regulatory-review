import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const root=new URL("../",import.meta.url);

test("uses uncapped progressive detail batches before deriving aggregates",async()=>{
 const api=await readFile(new URL("app/api/analyze/route.ts",root),"utf8");
 assert.match(api,/LISTING_PAGE_SIZE=250/);
 assert.match(api,/DETAIL_CONCURRENCY=4/);
 assert.doesNotMatch(api,/DETAIL_CONCURRENCY=(?:[6-9]|[1-9][0-9]+)/);
 assert.match(api,/batch=nonWithdrawn\.slice\(detailOffset,detailOffset\+detailBatchSize\)/);
 assert.match(api,/hasMore=nextOffset<nonWithdrawn\.length/);
 assert.match(api,/listingOnly\?\[\]:await getDetails/);
 assert.match(api,/listingOnly=request\.nextUrl\.searchParams\.get\("listingOnly"\)==="1"\|\|!hasExplicitOffset/);
 assert.match(api,/getJson\([^\n]+,false\)/);
 assert.match(api,/Other \/ no theme match/);
 assert.match(api,/domainAggregation=/);
 assert.doesNotMatch(api,/MAX_DETAIL_REQUESTS|MAX_COMMENT_DETAILS/);
});

test("normal matrix loading uses a durable cached snapshot",async()=>{
 const page=await readFile(new URL("app/page.tsx",root),"utf8");
 const snapshot=JSON.parse(await readFile(new URL("public/data/cpsc-2025-0009-matrix.json",root),"utf8"));
 assert.match(page,/cpsc-issues-matrix-v2:/);
 assert.match(page,/\/data\/cpsc-2025-0009-matrix\.json/);
 assert.match(page,/cache:"force-cache"/);
 assert.match(page,/localStorage\.getItem/);
 assert.match(page,/localStorage\.setItem\(cacheKey/);
 assert.match(page,/normalizeCachedMatrix/);
 assert.match(page,/listingOnly=1/);
 assert.match(page,/setData\(rollupMatrix\(listing,comments\)\)/);
 assert.match(page,/replacements=new Map/);
 assert.match(page,/catch\{emitAudit\("comment_matrix\.cache_unavailable/);
 assert.equal(snapshot.comments.length,31);
 assert.equal(snapshot.regrouping.baselineUnclassifiedComments,25);
 assert.equal(snapshot.regrouping.unclassifiedComments,11);
 assert.equal(snapshot.unclassifiedTextComments,0);
 assert.equal(snapshot.themes.at(-1).theme,"Other / no theme match");
 assert.ok(snapshot.comments.every(comment=>Array.isArray(comment.hazardTags)&&comment.hazardTags.length>0));
 assert.ok(snapshot.comments.every(comment=>comment.sourceUrl.startsWith("https://www.regulations.gov/comment/")));
});

test("normal submissions loading uses the same snapshot and reserves the API for refresh",async()=>{
 const page=await readFile(new URL("app/page.tsx",root),"utf8");
 assert.match(page,/const loadSnapshot=async\(page=1\)=>/);
 assert.match(page,/MATRIX_SNAPSHOT_PATHS\[record\.docketId\]/);
 assert.match(page,/useEffect\(\(\)=>\{setData\(null\);setError\(""\);if\(record\?\.docketId\)loadSnapshot\(1\)/);
 assert.match(page,/Opened from the saved project snapshot; no live API request was made/);
 assert.match(page,/>Refresh from the official source</);
 assert.match(page,/snapshot\.comments\.slice/);
 assert.match(page,/url:comment\.sourceUrl/);
 assert.doesNotMatch(page,/useEffect\(\(\)=>\{setData\(null\);setError\(""\);if\(record\?\.docketId\)load\(1\)/);
});

test("groups comments under issue headings with comment-level summaries, hazards, and source links",async()=>{
 const page=await readFile(new URL("app/page.tsx",root),"utf8");
 assert.match(page,/className="issue-groups"/);
 assert.match(page,/className="issue-group"/);
 assert.match(page,/ISSUE GROUP/);
 assert.match(page,/Official comment \{c\.id\} ↗/);
 assert.match(page,/<b>Summary:<\/b>/);
 assert.match(page,/className="comment-hazards"/);
 assert.match(page,/i<c\.hazardTags\.length-1&&<b>,<\/b>/);
 assert.match(page,/\.\.\.c,themeTags:classifyCachedComment\(c,docketContext\),summary:summarizeCachedComment\(c\)/);
 assert.doesNotMatch(page,/hazardTags:classifyCachedComment/);
 assert.match(page,/issueGroupSummary\(group\.theme\)/);
 assert.match(page,/<span>Comments<\/span>/);
 assert.match(page,/<span>Retrieved<\/span>/);
 assert.doesNotMatch(page,/<span>Algorithm<\/span>|<span>Accessible text<\/span>|<span>Detail retrieval<\/span>|<span>Matrix rows<\/span>/);
});

test("provides a real PowerPoint download from the corrected matrix",async()=>{
 const page=await readFile(new URL("app/page.tsx",root),"utf8");
 assert.match(page,/import PptxGenJS from "pptxgenjs"/);
 assert.match(page,/\.pptx`/);
 assert.match(page,/Representative underlying comments/);
 assert.match(page,/03\.\$\{groupIndex\+1\} · ISSUE GROUP/);
 assert.match(page,/hyperlink:\{url:c\.sourceUrl\}/);
 assert.match(page,/05 · HAZARD TAG TABLE/);
 assert.match(page,/Comments by comment-level hazard domain/);
 assert.doesNotMatch(page,/05 · RECOMMENDED ACTIONS/);
 assert.doesNotMatch(page,/deck\.print\(\)/);
});
