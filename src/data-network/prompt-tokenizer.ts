import { ExternalTokenizer } from "@lezer/lr";
import { PromptString } from "./parser.terms.js";

export const promptString = new ExternalTokenizer((input) => {
  if (input.next !== 34 || input.peek(1) !== 34 || input.peek(2) !== 34) return;
  input.advance(3); // consume opening """
  let quotes = 0;
  for (;;) {
    if (input.next < 0) break; // EOF — unterminated string
    if (input.next === 34) {
      quotes++;
      input.advance(1);
      if (quotes === 3) break; // consumed closing """
    } else {
      quotes = 0;
      input.advance(1);
    }
  }
  input.acceptToken(PromptString);
});
