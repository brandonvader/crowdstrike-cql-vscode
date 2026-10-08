// Integration checks run inside the VS Code extension host: the extension
// activates on a CQL file and every provider answers through VS Code's own
// commands. Plain CommonJS with no Node imports, so it needs no build step and
// also runs in the web worker extension host (VS Code for the Web).

const vscode = require('vscode');

const assert = {
  ok(v, msg) {
    if (!v) throw new Error(msg ?? 'expected a truthy value');
  },
  equal(a, b) {
    if (a !== b) throw new Error(`expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`);
  },
  deepEqual(a, b) {
    if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`expected ${JSON.stringify(b)}\n     got ${JSON.stringify(a)}`);
  },
};

const QUERY = [
  '#event_simpleName=ProcessRollup2',
  '| name := lower(ImageFileName)',
  '| groupBy(',
  '    [aid, name],',
  '    function=count()',
  '  )',
  '',
].join('\n');

const checks = [];
const check = (name, fn) => checks.push({ name, fn });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function until(what, fn) {
  for (let i = 0; i < 50; i++) {
    const v = await fn();
    if (v) return v;
    await sleep(200);
  }
  throw new Error(`timed out waiting for ${what}`);
}

let doc;

check('language is detected from the file extension', async () => {
  const file = vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, 'hunt.logscale');
  await vscode.workspace.fs.writeFile(file, new TextEncoder().encode(QUERY));
  doc = await vscode.workspace.openTextDocument(file);
  await vscode.window.showTextDocument(doc);
  assert.equal(doc.languageId, 'crowdstrike-cql');
});

check('extension activates', async () => {
  const ext = vscode.extensions.all.find((e) => e.packageJSON.name === 'crowdstrike-cql');
  assert.ok(ext, 'extension not found');
  await ext.activate(); // rejects with the activation error, if any
});

check('semantic tokens', async () => {
  const legend = await vscode.commands.executeCommand('vscode.provideDocumentSemanticTokensLegend', doc.uri);
  const tokens = await until('tokens', () => vscode.commands.executeCommand('vscode.provideDocumentSemanticTokens', doc.uri));
  // Decode the relative encoding into [text, type] pairs.
  const out = [];
  let line = 0;
  let char = 0;
  for (let i = 0; i < tokens.data.length; i += 5) {
    const [dl, dc, len, type] = tokens.data.slice(i, i + 4);
    line += dl;
    char = dl ? dc : char + dc;
    out.push([doc.lineAt(line).text.slice(char, char + len), legend.tokenTypes[type]]);
  }
  assert.deepEqual(out.slice(0, 5), [
    ['#event_simpleName', 'tagField'],
    ['ProcessRollup2', 'pattern'],
    ['name', 'property'],
    ['lower', 'function'],
    ['ImageFileName', 'variable'],
  ]);
});

check('document symbols', async () => {
  const symbols = await vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', doc.uri);
  assert.deepEqual(
    symbols.map((s) => s.name),
    ['name', 'groupBy'],
  );
});

check('folding ranges', async () => {
  const ranges = await vscode.commands.executeCommand('vscode.executeFoldingRangeProvider', doc.uri);
  assert.ok(
    ranges.some((r) => r.start === 2 && r.end === 4),
    JSON.stringify(ranges),
  );
});

check('selection ranges', async () => {
  const [sel] = await vscode.commands.executeCommand('vscode.executeSelectionRangeProvider', doc.uri, [new vscode.Position(3, 6)]);
  assert.equal(doc.getText(sel.range), 'aid');
  assert.equal(doc.getText(sel.parent.range), '[aid, name]');
});

check('syntax diagnostics are off by default and opt-in', async () => {
  const edit = new vscode.WorkspaceEdit();
  edit.insert(doc.uri, new vscode.Position(3, 4), '(');
  await vscode.workspace.applyEdit(edit);
  await sleep(600);
  assert.deepEqual(vscode.languages.getDiagnostics(doc.uri), []);
  await vscode.workspace.getConfiguration('crowdstrikeCql').update('diagnostics.syntax', true, vscode.ConfigurationTarget.Global);
  const diags = await until('diagnostics', () => {
    const d = vscode.languages.getDiagnostics(doc.uri);
    return d.length ? d : undefined;
  });
  assert.equal(diags[0].source, 'CQL');
  await vscode.workspace.getConfiguration('crowdstrikeCql').update('diagnostics.syntax', undefined, vscode.ConfigurationTarget.Global);
});

exports.run = async function run() {
  let failed = 0;
  for (const { name, fn } of checks) {
    try {
      await fn();
      console.log(`  ✔ ${name}`);
    } catch (e) {
      failed++;
      console.log(`  ✖ ${name}\n${e.stack ?? e}`);
    }
  }
  if (failed) throw new Error(`${failed} of ${checks.length} integration checks failed`);
};
