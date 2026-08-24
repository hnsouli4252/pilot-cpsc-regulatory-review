import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import test from "node:test";

const root=new URL("../",import.meta.url);

test("retains official comments before deriving issue and hazard aggregates",async()=>{
 const api=await readFile(new URL("app/api/analyze/route.ts",root),"utf8");
 assert.match(api,/LISTING_PAGE_SIZE=250/);
 assert.match(api,/comments=nonWithdrawn\.map/);
 assert.match(api,/Other \/ no theme match/);
 assert.match(api,/domainAggregation=/);
 assert.doesNotMatch(api,/slice\(0,MAX_COMMENT_DETAILS\)/);
});

test("provides a real PowerPoint download from the corrected matrix",async()=>{
 const page=await readFile(new URL("app/page.tsx",root),"utf8");
 assert.match(page,/import PptxGenJS from "pptxgenjs"/);
 assert.match(page,/\.pptx`/);
 assert.match(page,/RECOMMENDED ACTIONS/);
 assert.match(page,/Representative underlying comments/);
 assert.doesNotMatch(page,/deck\.print\(\)/);
});
