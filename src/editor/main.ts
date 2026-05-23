import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { tsnet } from "./language.js";

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

(window as unknown as Record<string, unknown>)["tsnetEditor"] = {
  setValue(source: string) {
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: source },
    });
  },
};
