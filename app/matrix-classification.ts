export const CATCH_ALL_ISSUES=new Set(["Other / no theme match","Other","Unmatched","Unclassified"]);

const RULES=[
 {label:"Consumer safety and risk",terms:["safety","risk","hazard","injury","injuries","death","protect","incident","accident"]},
 {label:"Compliance, testing, and certification",terms:["compliance","test","testing","certif","enforce","standard","requirement","inspection"]},
 {label:"Regulatory burden and cost",terms:["burden","cost","expense","paperwork","economic","feasibility","afford"]},
 {label:"Small entities and market effects",terms:["small business","small entity","manufacturer","retailer","importer","market","supply chain"]},
 {label:"Regulatory clarity and process",terms:["clarity","guidance","interpret","definition","process","procedure","petition","recordkeeping"]},
 {label:"Evidence and data",terms:["data","evidence","study","analysis","estimate","research","statistics","methodology"]},
 {label:"Innovation, competition, and consumer choice",terms:["innovation","competition","choice","technology","entrant","redesign"]},
 {label:"Scope, definitions, and applicability",terms:["scope","applicab","definition","exclude","exemption","covered product","jurisdiction"]},
 {label:"Product design and performance",terms:["design","performance","component","structural","durability","debris","penetration","material"]},
 {label:"Implementation timing and transition",terms:["effective date","deadline","timeline","transition","phase-in","implementation period","extension"]},
 {label:"Position on proposed action",terms:["support","oppose","object","withdraw","urge","request that","recommend","approve","reject"]},
 {label:"Labeling, warnings, and instructions",terms:["label","warning","instruction","manual","disclosure","marking"]},
];

const normalized=(value:string)=>value.toLowerCase().replace(/\s+/g," ").trim();
export function classifyCachedComment(comment:{title:string;excerpt:string;themeTags:string[];textAvailable?:boolean},docketContext=""){const evidence=normalized(`${comment.title} ${comment.excerpt}`),existing=comment.themeTags.filter(tag=>!CATCH_ALL_ISSUES.has(tag)),derived=RULES.filter(rule=>rule.terms.some(term=>evidence.includes(term))).map(rule=>rule.label),attachmentOnly=/^(?:(?:please )?see|please find|attached|comment letter attached|the .{1,100} appreciates).{0,180}(?:attach|file|letter|document|comments?)/i.test(comment.excerpt.trim());if(!derived.length&&!existing.length&&comment.textAvailable!==false&&attachmentOnly&&/reducing regulatory burdens/i.test(docketContext))derived.push("Regulatory burden and cost");return [...new Set([...existing,...derived])].length?[...new Set([...existing,...derived])]:["Other / no theme match"]}

export function summarizeCachedComment(comment:{title:string;excerpt:string}){const text=comment.excerpt.trim(),sentences=text.split(/(?<=[.!?])\s+/).map(x=>x.trim()).filter(Boolean),filler=/^(see|please see|refer to|please refer to).*(attach|enclos)/i,cue=/\b(request|recommend|urge|support|oppose|object|concern|ask|should|must|propose|believe)\b/i;const useful=sentences.find(s=>cue.test(s)&&!filler.test(s))||sentences.find(s=>s.length>=45&&!filler.test(s));if(useful)return useful.slice(0,240)+(useful.length>240?"…":"");if(comment.title&&!/^comment from\b/i.test(comment.title))return `${comment.title}. The cached record does not contain enough text to summarize the request or concern.`;return "The cached record does not contain enough substantive text to determine the commenter’s request or concern."}

const GROUP_SUMMARIES:Record<string,string>={
 "Consumer safety and risk":"Comments address potential injuries, hazards, risk reduction, or the safety rationale for action.",
 "Compliance, testing, and certification":"Comments address how requirements would be tested, certified, enforced, or implemented in compliance programs.",
 "Regulatory burden and cost":"Comments raise implementation cost, economic impact, paperwork, or feasibility concerns.",
 "Small entities and market effects":"Comments address effects on manufacturers, importers, retailers, small entities, or market conditions.",
 "Regulatory clarity and process":"Comments request clearer rules, guidance, definitions, procedures, or recordkeeping expectations.",
 "Evidence and data":"Comments provide or request studies, incident evidence, estimates, research, or analytical support.",
 "Innovation, competition, and consumer choice":"Comments address technology, redesign, competition, innovation, or consumer options.",
 "Scope, definitions, and applicability":"Comments question which products, entities, circumstances, or exemptions the action should cover.",
 "Product design and performance":"Comments address product construction, components, materials, durability, or performance requirements.",
 "Implementation timing and transition":"Comments request changes to effective dates, deadlines, phase-ins, or transition periods.",
 "Position on proposed action":"Comments explicitly support, oppose, or request a particular regulatory disposition.",
 "Labeling, warnings, and instructions":"Comments address labels, warnings, manuals, markings, disclosures, or consumer instructions.",
 "Other / no theme match":"Cached text is insufficient for a supported substantive issue assignment.",
};
export const issueGroupSummary=(theme:string)=>GROUP_SUMMARIES[theme]||`Comments grouped around ${theme.toLowerCase()}.`;
export function orderIssueGroups<T extends {theme:string;count:number}>(groups:T[]){return [...groups].sort((a,b)=>Number(CATCH_ALL_ISSUES.has(a.theme))-Number(CATCH_ALL_ISSUES.has(b.theme))||b.count-a.count||a.theme.localeCompare(b.theme))}
