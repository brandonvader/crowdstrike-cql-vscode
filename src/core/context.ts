// What surrounds the cursor, for completion and signature help. Works on the
// raw text up to the cursor rather than the syntax tree, because the query is
// usually incomplete while it is being typed (`groupBy(field=x, fun`).

export interface Call {
  /** Function name as written (`groupBy`, `array:contains`, `$saved`). */
  name: string;
  /** Offset of the `(`. */
  open: number;
  /** Zero-based index of the argument the cursor is in. */
  argIndex: number;
  /** Named arguments already written, including the current one. */
  used: string[];
  /** Name of the current argument, once its `name=` has been typed. */
  argName?: string;
  /** The cursor is directly in the argument list, not nested in `[ ]` or `{ }`. */
  atArgLevel: boolean;
}

export interface CursorContext {
  /** Inside a string, comment or regex. */
  inLiteral: boolean;
  /** Innermost enclosing function call. */
  call?: Call;
  /** Directly after a filter comparison (`field = |`): a value goes here. */
  afterComparison: boolean;
  /** Start of the word being typed (function names may contain `:`). */
  wordStart: number;
}

const FN_BEFORE_PAREN = /(\$"(?:[^"\\\n]|\\.)*"|\$[^\s("|]+|[A-Za-z_][A-Za-z0-9_]*(?::[A-Za-z_][A-Za-z0-9_]*)?)$/;
const PATTERN_CHAR = /[^\s"'`(),;=!<>|[\]{}?$/:]/;
const REGEX_AFTER = /[=(,[{|!~>]/;

interface Frame {
  open: string;
  call?: Call;
  argStart: number;
}

export function cursorContext(text: string, offset: number): CursorContext {
  const stack: Frame[] = [];
  let inLiteral = false;
  let lastSignificant = ''; // previous non-space character outside literals
  let i = 0;

  const top = () => stack.at(-1);
  const endOfLine = (from: number) => {
    const n = text.indexOf('\n', from);
    return n < 0 ? text.length : n;
  };

  while (i < offset) {
    const c = text[i];
    const next = text[i + 1];

    if (c === '"') {
      // A string runs to the closing quote or the end of the line.
      let j = i + 1;
      while (j < text.length && text[j] !== '"' && text[j] !== '\n') j += text[j] === '\\' ? 2 : 1;
      if (j >= offset) {
        inLiteral = true;
        break;
      }
      i = text[j] === '"' ? j + 1 : j;
      lastSignificant = '"';
      continue;
    }
    // `//` starts a comment, except inside an unquoted pattern (https://x/).
    const inPattern = i > 0 && (PATTERN_CHAR.test(text[i - 1]) || text[i - 1] === ':');
    if (c === '/' && next === '/' && !inPattern) {
      const j = endOfLine(i);
      if (j >= offset) {
        inLiteral = true;
        break;
      }
      i = j;
      continue;
    }
    if (c === '/' && next === '*') {
      const j = text.indexOf('*/', i + 2);
      if (j < 0 || j + 2 > offset) {
        inLiteral = true;
        break;
      }
      i = j + 2;
      continue;
    }
    if (c === '/' && (lastSignificant === '' || REGEX_AFTER.test(lastSignificant)) && !inPattern) {
      // A regex literal: to the closing slash, skipping escapes and [classes].
      let j = i + 1;
      let inClass = false;
      while (j < text.length && text[j] !== '\n' && (inClass || text[j] !== '/')) {
        if (text[j] === '\\') j++;
        else if (text[j] === '[') inClass = true;
        else if (text[j] === ']') inClass = false;
        j++;
      }
      if (j >= offset) {
        inLiteral = true;
        break;
      }
      i = j + 1;
      while (/[dgimF]/.test(text[i] ?? '') && i < offset) i++;
      lastSignificant = '/';
      continue;
    }

    if (c === '(') {
      const m = FN_BEFORE_PAREN.exec(text.slice(Math.max(0, i - 200), i));
      const call = m ? { name: m[1], open: i, argIndex: 0, used: [], atArgLevel: true } : undefined;
      stack.push({ open: c, call, argStart: i + 1 });
    } else if (c === '[' || c === '{') {
      stack.push({ open: c, argStart: i + 1 });
    } else if (c === ')' || c === ']' || c === '}') {
      const want = c === ')' ? '(' : c === ']' ? '[' : '{';
      const at = stack.map((f) => f.open).lastIndexOf(want);
      if (at >= 0) stack.length = at;
    } else if (c === ',' && top()?.call) {
      const f = top()!;
      f.call!.argIndex++;
      f.call!.argName = undefined;
      f.argStart = i + 1;
    } else if (c === '=' && top()?.call && !/[=!<>:]/.test(text[i - 1] ?? '') && !/[=~>]/.test(next ?? '')) {
      const f = top()!;
      const name = text.slice(f.argStart, i).trim();
      if (/^[A-Za-z_][\w.]*$/.test(name) && f.call!.argName === undefined) {
        f.call!.argName = name;
        f.call!.used.push(name);
      }
    }
    if (!/\s/.test(c)) lastSignificant = c;
    i++;
  }

  let wordStart = offset;
  while (wordStart > 0 && /[\w:$#@.]/.test(text[wordStart - 1])) wordStart--;

  let call: Call | undefined;
  for (let k = stack.length - 1; k >= 0; k--) {
    if (stack[k].call) {
      call = { ...stack[k].call!, atArgLevel: k === stack.length - 1 };
      break;
    }
  }

  // The operator just before the word: `=`, `!=`, `<`, `>`, `<=`, `>=`, `like`.
  const before = text.slice(Math.max(0, wordStart - 8), wordStart).trimEnd();
  const afterComparison =
    !(call?.atArgLevel && call.argName) && /(?:^|[^:=!<>])(?:!=|<=|>=|=|<|>)$|(?:^|\s)like$/i.test(before) && !/=~$/.test(before);

  return { inLiteral, call, afterComparison, wordStart };
}
