// Loads the tree-sitter runtime and the CQL grammar from bytes, so the same
// code runs in desktop VS Code, VS Code for the Web and the Node unit tests.

import { Language, Parser } from 'web-tree-sitter';

export async function createParser(runtimeWasm: Uint8Array, grammarWasm: Uint8Array): Promise<Parser> {
  // locateFile only names the binary; the bytes come from wasmBinary.
  await Parser.init({ wasmBinary: runtimeWasm, locateFile: (file: string) => file });
  const parser = new Parser();
  parser.setLanguage(await Language.load(grammarWasm));
  return parser;
}
