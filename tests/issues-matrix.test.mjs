import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const root=new URL("../",import.meta.url);

test("uses uncapped progressive detail batches before deriving aggregates",async()=>{
 const api=await readFile(new URL("app/api/analyze/route.ts",root),"utf8");
 assert.match(api,/LISTING_PAGE_SIZE=250/);
 assert.match(api,/batch=nonWithdrawn\.slice\(detailOffset,detailOffset\+detailBatchSize\)/);
 assert.match(api,/hasMore=nextOffset<nonWithdrawn\.length/);
 assert.match(api,/listingOnly\?\[\]:await getDetails/);
 assert.match(api,/getJson\([^\n]+,false\)/);
 assert.match(api,/Other \/ no theme match/);
 assert.match(api,/domainAggregation=/);
 assert.doesNotMatch(api,/MAX_DETAIL_REQUESTS|MAX_COMMENT_DETAILS/);
});

test("normal matrix loading uses a durable cached snapshot",async()=>{
 const page=await readFile(new URL("app/page.tsx",root),"utf8");
 assert.match(page,/cpsc-issues-matrix-v2:/);
 assert.match(page,/localStorage\.getItem/);
 assert.match(page,/localStorage\.setItem\(cacheKey/);
 assert.match(page,/normalizeCachedMatrix/);
 assert.match(page,/listingOnly=1/);
 assert.match(page,/setData\(rollupMatrix\(listing,comments\)\)/);
 assert.match(page,/replacements=new Map/);
 assert.match(page,/catch\{emitAudit\("comment_matrix\.cache_unavailable/);
});

test("provides a real PowerPoint download from the corrected matrix",async()=>{
 const page=await readFile(new URL("app/page.tsx",root),"utf8");
 assert.match(page,/import PptxGenJS from "pptxgenjs"/);
 assert.match(page,/\.pptx`/);
 assert.match(page,/RECOMMENDED ACTIONS/);
 assert.match(page,/Representative underlying comments/);
 assert.doesNotMatch(page,/deck\.print\(\)/);
});
