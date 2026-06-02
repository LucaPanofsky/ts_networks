import { parser } from "../data-network/parser.js";
import { LRLanguage, LanguageSupport, syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { styleTags, tags as t } from "@lezer/highlight";

const tsnetParser = parser.configure({
  props: [
    styleTags({
      "Defnetwork Defrecord Defn Defpredicate Defllmfn Defgrammar Derive End": t.definitionKeyword,
      "Signature_ Expression_ From To Propagate Switch With Cell Constant Let Match When": t.keyword,
      String:     t.string,
      Number:     t.number,
      Boolean:    t.bool,
      LineComment: t.lineComment,
      Arrow:      t.operator,
      Pipe:       t.operator,
      CompareOp:  t.compareOperator,
      AddOp:      t.arithmeticOperator,
      MulOp:      t.arithmeticOperator,
    }),
  ],
});

const tsnetHighlight = HighlightStyle.define([
  { tag: t.definitionKeyword, color: "#569cd6", fontWeight: "bold" },
  { tag: t.keyword,           color: "#c586c0" },
  { tag: t.string,            color: "#ce9178" },
  { tag: t.number,            color: "#b5cea8" },
  { tag: t.bool,              color: "#569cd6" },
  { tag: t.lineComment,       color: "#6a9955", fontStyle: "italic" },
  { tag: t.operator,          color: "#d4d4d4" },
  { tag: t.compareOperator,   color: "#d4d4d4" },
  { tag: t.arithmeticOperator, color: "#d4d4d4" },
]);

const tsnetLanguage = LRLanguage.define({ parser: tsnetParser });

export function tsnet() {
  return new LanguageSupport(tsnetLanguage, syntaxHighlighting(tsnetHighlight));
}
