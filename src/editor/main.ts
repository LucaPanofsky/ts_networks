import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { tsnet } from "./language.js";
import mermaid from "mermaid";
import elkLayouts from "@mermaid-js/layout-elk";
import { parseReplCommand } from "../ui-server/repl-parser.js";

mermaid.registerLayoutLoaders(elkLayouts);
mermaid.initialize({ startOnLoad: false, theme: "default", securityLevel: "loose" });

const theme = EditorView.theme({
  "&": { height: "100%", fontSize: "13px" },
  ".cm-scroller": { overflow: "auto", fontFamily: "monospace" },
}, { dark: true });

const view = new EditorView({
  state: EditorState.create({
    doc: "",
    extensions: [basicSetup, EditorView.editable.of(false), theme, tsnet()],
  }),
  parent: document.getElementById("editor-pane")!,
});

let diagramCounter = 0;

(window as unknown as Record<string, unknown>)["tsnetEditor"] = {
  getValue(): string {
    return view.state.doc.toString();
  },
  setValue(source: string) {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: source },
    });
  },
  parseReplCommand,
  async renderDiagram(chart: string) {
    const el = document.getElementById("diagram");
    if (!el) return;
    el.innerHTML = "";
    const container = document.createElement("pre");
    container.className = "mermaid";
    container.textContent = chart;
    el.appendChild(container);
    await mermaid.run({ nodes: [container] });
  },
};
