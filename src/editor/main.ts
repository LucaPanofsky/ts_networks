import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { tsnet } from "./language.js";
import mermaid from "mermaid";
import elkLayouts from "@mermaid-js/layout-elk";

mermaid.registerLayoutLoaders(elkLayouts);
mermaid.initialize({ startOnLoad: false, theme: "dark" });

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
  setValue(source: string) {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: source },
    });
  },
  async renderDiagram(chart: string) {
    const el = document.getElementById("diagram");
    if (!el) return;
    const id = `mermaid-${diagramCounter++}`;
    const { svg } = await mermaid.render(id, chart);
    el.innerHTML = svg;
  },
};
