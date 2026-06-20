import * as rt from "@tsn/runtime";
const __reg = rt.registry();
const __interp = rt.interp;

const every = function(pred, coll) { return coll.every(function(x) { return pred(x); }); };
const some = function(pred, coll) { return coll.some(function(x) { return pred(x); }); };
const str = function() { return Array.prototype.slice.call(arguments).join(""); };
const str$length = function(s) { return s.length; };
const str$upper = function(s) { return s.toUpperCase(); };
const str$lower = function(s) { return s.toLowerCase(); };
const str$trim = function(s) { return s.trim(); };
const str$substring = function(s, start, end) { return s.substring(start, end); };
const str$split = function(s, sep) { return s.split(sep); };
const str$join = function(coll, sep) { return coll.join(sep); };
const str$replace = function(s, find, repl) { return s.split(find).join(repl); };
const str$contains$ = function(s, sub) { return s.includes(sub); };
const str$startsWith$ = function(s, p) { return s.startsWith(p); };
const str$endsWith$ = function(s, p) { return s.endsWith(p); };
const str$blank$ = function(s) { return s.trim().length === 0; };
const math$sqrt = function(n) { return Math.sqrt(n); };
const math$abs = function(n) { return Math.abs(n); };
const math$round = function(n) { return Math.round(n); };
const math$floor = function(n) { return Math.floor(n); };
const math$ceil = function(n) { return Math.ceil(n); };
const math$mod = function(a, b) { return a % b; };
const math$pow = function(a, b) { return Math.pow(a, b); };
const math$max = function(a, b) { return Math.max(a, b); };
const math$min = function(a, b) { return Math.min(a, b); };

const not = (x) => (!x);
__reg.register("not", { arity: 1, impl: not, morphism: { from: ["Boolean?"], to: "Boolean?" } });

const and = (x, y) => (x && y);
__reg.register("and", { arity: 2, impl: and, morphism: { from: ["Boolean?","Boolean?"], to: "Boolean?" } });

const or = (x, y) => (x || y);
__reg.register("or", { arity: 2, impl: or, morphism: { from: ["Boolean?","Boolean?"], to: "Boolean?" } });

const add = (a, b) => (a + b);
__reg.register("add", { arity: 2, impl: add, morphism: { from: ["Number?","Number?"], to: "Number?" } });

const sub = (a, b) => (a - b);
__reg.register("sub", { arity: 2, impl: sub, morphism: { from: ["Number?","Number?"], to: "Number?" } });

const mul = (a, b) => (a * b);
__reg.register("mul", { arity: 2, impl: mul, morphism: { from: ["Number?","Number?"], to: "Number?" } });

const div = (a, b) => (a / b);
__reg.register("div", { arity: 2, impl: div, morphism: { from: ["Number?","Number?"], to: "Number?" } });

const eq = (a, b) => (a === b);
__reg.register("eq", { arity: 2, impl: eq, morphism: { from: ["Any?","Any?"], to: "Boolean?" } });

const gt = (a, b) => (a > b);
__reg.register("gt", { arity: 2, impl: gt, morphism: { from: ["Number?","Number?"], to: "Boolean?" } });

const lt = (a, b) => (a < b);
__reg.register("lt", { arity: 2, impl: lt, morphism: { from: ["Number?","Number?"], to: "Boolean?" } });

const gte = (a, b) => (a >= b);
__reg.register("gte", { arity: 2, impl: gte, morphism: { from: ["Number?","Number?"], to: "Boolean?" } });

const lte = (a, b) => (a <= b);
__reg.register("lte", { arity: 2, impl: lte, morphism: { from: ["Number?","Number?"], to: "Boolean?" } });

const sqrt = (n) => math$sqrt(n);
__reg.register("sqrt", { arity: 1, impl: sqrt, morphism: { from: ["Number?"], to: "Number?" } });

const abs = (n) => math$abs(n);
__reg.register("abs", { arity: 1, impl: abs, morphism: { from: ["Number?"], to: "Number?" } });

const round = (n) => math$round(n);
__reg.register("round", { arity: 1, impl: round, morphism: { from: ["Number?"], to: "Number?" } });

const floor = (n) => math$floor(n);
__reg.register("floor", { arity: 1, impl: floor, morphism: { from: ["Number?"], to: "Number?" } });

const ceil = (n) => math$ceil(n);
__reg.register("ceil", { arity: 1, impl: ceil, morphism: { from: ["Number?"], to: "Number?" } });

const mod = (a, b) => math$mod(a, b);
__reg.register("mod", { arity: 2, impl: mod, morphism: { from: ["Number?","Number?"], to: "Number?" } });

const pow = (a, b) => math$pow(a, b);
__reg.register("pow", { arity: 2, impl: pow, morphism: { from: ["Number?","Number?"], to: "Number?" } });

const max = (a, b) => math$max(a, b);
__reg.register("max", { arity: 2, impl: max, morphism: { from: ["Number?","Number?"], to: "Number?" } });

const min = (a, b) => math$min(a, b);
__reg.register("min", { arity: 2, impl: min, morphism: { from: ["Number?","Number?"], to: "Number?" } });

const Equivalence = (old, lisbon, newNum) => ({ __type: "Equivalence", old, lisbon, newNum });
__reg.register("Equivalence", { arity: 3, impl: Equivalence, morphism: { from: ["String?","String?","String?"], to: "Equivalence?" } });
const Equivalence$ = (v) => v != null && v.__type === "Equivalence";
__reg.register("Equivalence?", { arity: 1, impl: Equivalence$, morphism: { from: ["Any?"], to: "Boolean?" } });
__reg.register("Equivalence.old", { arity: 1, impl: (r) => r.old, morphism: { from: ["Equivalence?"], to: "String?" } });
__reg.register("Equivalence.lisbon", { arity: 1, impl: (r) => r.lisbon, morphism: { from: ["Equivalence?"], to: "String?" } });
__reg.register("Equivalence.newNum", { arity: 1, impl: (r) => r.newNum, morphism: { from: ["Equivalence?"], to: "String?" } });

const TTable$Rows = rt.ttable({"kind":"ttable","name":"Rows","row":"Equivalence","cell":"|","headers":[{"field":"old"},{"field":"lisbon"},{"field":"newNum"}]}, {"kind":"record","name":"Equivalence","fields":[{"name":"old","type":{"kind":"scalar","predicate":"String?"}},{"name":"lisbon","type":{"kind":"scalar","predicate":"String?"}},{"name":"newNum","type":{"kind":"scalar","predicate":"String?"}}]}, __reg.resolve);
__reg.register("TTable/Rows", { arity: TTable$Rows.arity, impl: TTable$Rows.impl, morphism: { from: ["String?"], to: "[Equivalence?]" } });

const TitleRow = (old, lisbon, newNum) => ({ __type: "TitleRow", old, lisbon, newNum });
__reg.register("TitleRow", { arity: 3, impl: TitleRow, morphism: { from: ["String?","String?","String?"], to: "TitleRow?" } });
const TitleRow$ = (v) => v != null && v.__type === "TitleRow";
__reg.register("TitleRow?", { arity: 1, impl: TitleRow$, morphism: { from: ["Any?"], to: "Boolean?" } });
__reg.register("TitleRow.old", { arity: 1, impl: (r) => r.old, morphism: { from: ["TitleRow?"], to: "String?" } });
__reg.register("TitleRow.lisbon", { arity: 1, impl: (r) => r.lisbon, morphism: { from: ["TitleRow?"], to: "String?" } });
__reg.register("TitleRow.newNum", { arity: 1, impl: (r) => r.newNum, morphism: { from: ["TitleRow?"], to: "String?" } });

const TitleGroup = (title, rows) => ({ __type: "TitleGroup", title, rows });
__reg.register("TitleGroup", { arity: 2, impl: TitleGroup, morphism: { from: ["TitleRow?","[Equivalence?]"], to: "TitleGroup?" } });
const TitleGroup$ = (v) => v != null && v.__type === "TitleGroup";
__reg.register("TitleGroup?", { arity: 1, impl: TitleGroup$, morphism: { from: ["Any?"], to: "Boolean?" } });
__reg.register("TitleGroup.title", { arity: 1, impl: (r) => r.title, morphism: { from: ["TitleGroup?"], to: "TitleRow?" } });
__reg.register("TitleGroup.rows", { arity: 1, impl: (r) => r.rows, morphism: { from: ["TitleGroup?"], to: "[Equivalence?]" } });

const Annex = (title, section, columns, groups) => ({ __type: "Annex", title, section, columns, groups });
__reg.register("Annex", { arity: 4, impl: Annex, morphism: { from: ["String?","String?","[String?]","[TitleGroup?]"], to: "Annex?" } });
const Annex$ = (v) => v != null && v.__type === "Annex";
__reg.register("Annex?", { arity: 1, impl: Annex$, morphism: { from: ["Any?"], to: "Boolean?" } });
__reg.register("Annex.title", { arity: 1, impl: (r) => r.title, morphism: { from: ["Annex?"], to: "String?" } });
__reg.register("Annex.section", { arity: 1, impl: (r) => r.section, morphism: { from: ["Annex?"], to: "String?" } });
__reg.register("Annex.columns", { arity: 1, impl: (r) => r.columns, morphism: { from: ["Annex?"], to: "[String?]" } });
__reg.register("Annex.groups", { arity: 1, impl: (r) => r.groups, morphism: { from: ["Annex?"], to: "[TitleGroup?]" } });

const grammar$Annex = rt.grammar({"kind":"grammar","name":"Annex","source":"Annex {\n    annex     = \"ANNEX\" spaces title spaces section spaces headerRow rest\n    title     = (~nl any)+\n    section   = (~nl any)+\n    headerRow = (columns sep)+\n    columns   = (~sep ~nl any)*\n    sep       = \" | \" | \" |\"\n    rest      = any*\n    nl        = \"\\n\"\n  }","signature":{"params":[{"predicate":"String?","name":"text"}],"returnType":{"kind":"scalar","predicate":"Annex?"}}}, {"kind":"record","name":"Annex","fields":[{"name":"title","type":{"kind":"scalar","predicate":"String?"}},{"name":"section","type":{"kind":"scalar","predicate":"String?"}},{"name":"columns","type":{"kind":"vector","element":"String?"}},{"name":"groups","type":{"kind":"vector","element":"TitleGroup?"}}]}, __reg.resolve);
__reg.register("grammar/Annex", { arity: grammar$Annex.arity, impl: grammar$Annex.impl, scan: grammar$Annex.scan, morphism: { from: ["String?"], to: "Annex?" } });

const grammar$TitleBlock = rt.grammar({"kind":"grammar","name":"TitleBlock","source":"TitleBlock {\n    block     = \"TITLE\" (~nl any)* body\n    body      = (~nextTitle any)*\n    nextTitle = nl \"TITLE\"\n    nl        = \"\\n\"\n  }","signature":{"params":[{"predicate":"String?","name":"text"}],"returnType":{"kind":"scalar","predicate":"TitleGroup?"}}}, {"kind":"record","name":"TitleGroup","fields":[{"name":"title","type":{"kind":"scalar","predicate":"TitleRow?"}},{"name":"rows","type":{"kind":"vector","element":"Equivalence?"}}]}, __reg.resolve);
__reg.register("grammar/TitleBlock", { arity: grammar$TitleBlock.arity, impl: grammar$TitleBlock.impl, scan: grammar$TitleBlock.scan, morphism: { from: ["String?"], to: "TitleGroup?" } });

const grammar$TitleRow = rt.grammar({"kind":"grammar","name":"TitleRow","source":"TitleRow {\n    titleRow = old sep lisbon sep newNum sep rest\n    old      = (~sep ~nl any)*\n    lisbon   = (~sep ~nl any)*\n    newNum   = (~sep ~nl any)*\n    sep      = \" | \" | \" |\"\n    rest     = any*\n    nl       = \"\\n\"\n  }","signature":{"params":[{"predicate":"String?","name":"text"}],"returnType":{"kind":"scalar","predicate":"TitleRow?"}}}, {"kind":"record","name":"TitleRow","fields":[{"name":"old","type":{"kind":"scalar","predicate":"String?"}},{"name":"lisbon","type":{"kind":"scalar","predicate":"String?"}},{"name":"newNum","type":{"kind":"scalar","predicate":"String?"}}]}, __reg.resolve);
__reg.register("grammar/TitleRow", { arity: grammar$TitleRow.arity, impl: grammar$TitleRow.impl, scan: grammar$TitleRow.scan, morphism: { from: ["String?"], to: "TitleRow?" } });

const extract$TreatyTotal = rt.extract({"kind":"extract","name":"TreatyTotal","root":{"kind":"within","target":"Annex","grammar":"grammar/Annex","body":[{"kind":"scan","record":"TitleGroup","as":"groups","grammar":"grammar/TitleBlock"},{"kind":"within","target":"groups","body":[{"kind":"parse","record":"TitleRow","as":"title","grammar":"grammar/TitleRow"},{"kind":"scan","record":"Equivalence","as":"rows","grammar":"TTable/Rows"}]}]}}, __reg.resolve, __reg.scanOf);
__reg.register("extract/TreatyTotal", { arity: 1, impl: extract$TreatyTotal, morphism: { from: ["String?"], to: "Annex?" } });

const extractTotal = rt.network({"kind":"network","name":"extractTotal","signature":{"from":["doc"],"to":"annex"},"terms":[{"kind":"propagate","fn":"extract/TreatyTotal","from":["doc"],"to":"annex","params":{}}]}, __reg);
__reg.register("network/extractTotal", { arity: 1, impl: extractTotal, morphism: { from: ["Any?"], to: "Any?" } });

export const __manifest = {"networks":{"extractTotal":{"from":["doc"],"to":"annex"}}};

export default __reg;
