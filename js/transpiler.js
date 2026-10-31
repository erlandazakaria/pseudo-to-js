/*
 * Pseudo Code -> JavaScript transpiler
 * ------------------------------------
 * Converts the class pseudo code (SET, PRINT, IF ... END IF, FOR EACH ... END FOR, ...)
 * into plain JavaScript and runs it with a small runtime library.
 *
 * Works in the browser (window.PseudoJS) and in Node (module.exports) so it can be tested.
 */
(function (global) {
  "use strict";

  var INDENT = 4;
  var MAX_STEPS = 5000000;   // loop iterations before we assume an infinite loop
  var MAX_OUTPUT = 5000;     // printed lines before we stop

  // ---------------------------------------------------------------------------
  // Language definition
  // ---------------------------------------------------------------------------
  var COMMANDS = [
    "SET", "PRINT", "IF", "ELSE", "END", "ENDIF", "ENDFOR", "ENDWHILE", "ENDFUNCTION",
    "FOR", "WHILE", "REPEAT", "UNTIL", "ADD", "REMOVE", "SORT", "FUNCTION", "RETURN",
    "CALL", "BREAK", "CONTINUE", "INPUT"
  ];

  var BUILTINS = [
    "LENGTH", "ROUND", "FLOOR", "CEIL", "ABS", "SQRT", "POWER", "MIN", "MAX", "SUM", "AVERAGE",
    "RANDOM", "UPPER", "LOWER", "TRIM", "STR", "NUM", "INT", "KEYS", "VALUES", "CONTAINS",
    "INDEX_OF", "SUBSTRING", "SPLIT", "JOIN", "TYPE", "INPUT"
  ];
  var BUILTIN_SET = {};
  BUILTINS.forEach(function (b) { BUILTIN_SET[b] = true; });

  // JavaScript words that cannot be used as variable names: we rename them silently.
  var JS_RESERVED = {};
  ("break case catch class const continue debugger default delete do else enum export extends " +
   "false finally for function if import in instanceof new null return super switch this throw " +
   "true try typeof var void while with yield let static implements interface package private " +
   "protected public await arguments eval undefined NaN Infinity of")
    .split(" ").forEach(function (w) { JS_RESERVED[w] = true; });

  function PseudoError(message, line, code, data) {
    this.name = "PseudoError";
    this.message = message;
    this.line = line || null;
    this.code = code || null;   // e.g. "unknown-line" so the page can offer "Teach this command"
    this.data = data || null;
  }
  PseudoError.prototype = Object.create(Error.prototype);

  function fail(line, message, code, data) { throw new PseudoError(message, line, code, data); }

  // Names of the user's custom JavaScript functions (set at the start of each transpile)
  var CUSTOM_JS = {};

  // ---------------------------------------------------------------------------
  // Tokenizer (used for expressions)
  // ---------------------------------------------------------------------------
  var TOKEN_RE = /\s+|("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(==|!=|<>|<=|>=|&&|\|\||\*\*|[+\-*\/%^()\[\]{},.:=<>!])/y;

  function tokenize(src, line) {
    var tokens = [];
    TOKEN_RE.lastIndex = 0;
    var pos = 0;
    while (pos < src.length) {
      TOKEN_RE.lastIndex = pos;
      var m = TOKEN_RE.exec(src);
      if (!m) {
        var ch = src[pos];
        if (ch === '"' || ch === "'") fail(line, "A text value is missing its closing quote " + ch + ".");
        if (ch === ";") fail(line, "Semicolons ( ; ) are not needed in pseudo code. Remove it.");
        fail(line, "Unexpected character '" + ch + "'. Put special characters inside quotes, e.g. \"" + ch + "\".");
      }
      if (m[1]) tokens.push({ t: "str", v: m[1], s: pos, e: pos + m[0].length });
      else if (m[2]) tokens.push({ t: "num", v: m[2], s: pos, e: pos + m[0].length });
      else if (m[3]) tokens.push({ t: "id", v: m[3], s: pos, e: pos + m[0].length });
      else if (m[4]) tokens.push({ t: "op", v: m[4], s: pos, e: pos + m[0].length });
      pos += m[0].length;
    }
    return tokens;
  }

  var OPEN = { "(": ")", "[": "]", "{": "}" };
  var CLOSE = { ")": "(", "]": "[", "}": "{" };
  var WORD_OPERATORS = { AND: 1, OR: 1, NOT: 1, MOD: 1, EXISTS: 1, IN: 1 };

  function matchForward(tokens, i, line) {
    var depth = 0;
    for (var j = i; j < tokens.length; j++) {
      if (tokens[j].t === "op" && OPEN[tokens[j].v]) depth++;
      else if (tokens[j].t === "op" && CLOSE[tokens[j].v]) { depth--; if (depth === 0) return j; }
    }
    fail(line, "A bracket '" + tokens[i].v + "' is never closed.");
  }

  function matchBackward(tokens, i, line) {
    var depth = 0;
    for (var j = i; j >= 0; j--) {
      if (tokens[j].t === "op" && CLOSE[tokens[j].v]) depth++;
      else if (tokens[j].t === "op" && OPEN[tokens[j].v]) { depth--; if (depth === 0) return j; }
    }
    fail(line, "A bracket '" + tokens[i].v + "' was closed but never opened.");
  }

  function isValueToken(tok) {
    return tok && (tok.t === "str" || tok.t === "num" || (tok.t === "id" && !WORD_OPERATORS[tok.v]));
  }
  function isChainable(tok) { // something that can be followed by ( or [ as a call/index
    return tok && ((tok.t === "id" && !WORD_OPERATORS[tok.v]) || (tok.t === "op" && (tok.v === ")" || tok.v === "]")));
  }

  // Find where the operand that ends at index `end` starts (e.g. productCounts[x].y)
  function operandStart(tokens, end, line) {
    var j = end;
    while (j >= 0) {
      var t = tokens[j];
      if (t.t === "op" && (t.v === ")" || t.v === "]" || t.v === "}")) {
        j = matchBackward(tokens, j, line);
        if (t.v !== "}" && isChainable(tokens[j - 1])) { j--; continue; }
        return j;
      }
      if (isValueToken(t)) {
        if (j >= 2 && tokens[j - 1].v === ".") { j -= 2; continue; }
        return j;
      }
      break;
    }
    fail(line, "EXISTS IN needs a value on its left, e.g. IF item EXISTS IN list THEN");
  }

  // Find where the operand that starts at index `start` ends
  function operandEnd(tokens, start, line) {
    var t = tokens[start];
    var j;
    if (!t) fail(line, "EXISTS IN needs a list or dictionary on its right.");
    if (t.t === "op" && OPEN[t.v]) j = matchForward(tokens, start, line);
    else if (isValueToken(t)) j = start;
    else fail(line, "EXISTS IN needs a list or dictionary on its right.");
    while (j + 1 < tokens.length) {
      var n = tokens[j + 1];
      if (n.v === "." && tokens[j + 2] && tokens[j + 2].t === "id") { j += 2; continue; }
      if (n.t === "op" && (n.v === "(" || n.v === "[") && isChainable(tokens[j])) { j = matchForward(tokens, j + 1, line); continue; }
      break;
    }
    return j;
  }

  function renameIdent(name) {
    if (JS_RESERVED[name] || name.indexOf("__") === 0) return "v_" + name;
    return name;
  }

  // Turn a list of pseudo tokens into JavaScript source text.
  function tokensToJs(tokens, line) {
    // 1) rewrite  `a EXISTS IN b`  (and `a IN b`)  ->  __rt.EXISTS(a, b)
    var guard = 0;
    while (guard++ < 100) {
      var idx = -1, width = 0;
      for (var i = 0; i < tokens.length; i++) {
        if (tokens[i].t === "id" && tokens[i].v === "EXISTS" && tokens[i + 1] && tokens[i + 1].v === "IN") { idx = i; width = 2; break; }
        if (tokens[i].t === "id" && tokens[i].v === "IN") { idx = i; width = 1; break; }
      }
      if (idx < 0) break;
      if (idx === 0) fail(line, "EXISTS IN needs a value on its left, e.g. IF item EXISTS IN list THEN");
      var ls = operandStart(tokens, idx - 1, line);
      var re = operandEnd(tokens, idx + width, line);
      var left = tokens.slice(ls, idx);
      var right = tokens.slice(idx + width, re + 1);
      var repl = [{ t: "raw", v: "__rt.EXISTS" }, { t: "op", v: "(" }]
        .concat(left, [{ t: "op", v: "," }], right, [{ t: "op", v: ")" }]);
      tokens = tokens.slice(0, ls).concat(repl, tokens.slice(re + 1));
    }

    // 2) map every token
    var out = [];
    for (var k = 0; k < tokens.length; k++) {
      var tok = tokens[k], prev = tokens[k - 1], next = tokens[k + 1], v = tok.v;
      if (tok.t === "id") {
        if (prev && prev.v === ".") { out.push(v); continue; }          // property name
        if (v === "AND") v = "&&";
        else if (v === "OR") v = "||";
        else if (v === "NOT") v = "!";
        else if (v === "MOD") v = "%";
        else if (v === "TRUE") v = "true";
        else if (v === "FALSE") v = "false";
        else if (v === "NULL" || v === "NONE" || v === "null") v = "null";
        else if (v === "true" || v === "false") { /* keep */ }
        else if (BUILTIN_SET[v] && next && next.v === "(") v = "__rt." + v;
        else if (CUSTOM_JS[v] && next && next.v === "(") v = "__rt.custom." + v;
        else v = renameIdent(v);
        out.push(v);
      } else if (tok.t === "op") {
        if (v === "=") v = "==";
        else if (v === "<>") v = "!=";
        else if (v === "^") v = "**";
        out.push(v);
      } else {
        out.push(v);
      }
    }
    // join with readable spacing
    var js = "";
    for (var n = 0; n < out.length; n++) {
      var cur = out[n], before = out[n - 1];
      var noSpace = n === 0 ||
        cur === "." || cur === "," || cur === ")" || cur === "]" || cur === ":" ||
        before === "." || before === "(" || before === "[" || before === "!" ||
        ((cur === "(" || cur === "[") && before && /[\w$)\]]$/.test(before) && !/^(&&|\|\||!)$/.test(before));
      // unary minus right after an operator / start
      if (!noSpace && before === "-" && (n === 1 || /^(==|!=|<=|>=|<|>|\+|-|\*|\/|%|\*\*|&&|\|\||\(|\[|,|:)$/.test(out[n - 2]))) noSpace = true;
      js += (noSpace ? "" : " ") + cur;
    }
    return js;
  }

  function checkJsExpression(js, src, line) {
    try {
      // Only checks syntax, does not run anything.
      new Function("__rt", '"use strict"; return (' + js + ");");
    } catch (e) {
      var hint = "";
      if (/\b(and|or|not)\b/.test(src)) hint = " Hint: logic words must be UPPERCASE: AND, OR, NOT.";
      else if (/\b(exists)\b/i.test(src) && !/EXISTS IN/.test(src)) hint = " Hint: write EXISTS IN in UPPERCASE.";
      else if (/"\s*[A-Za-z_]|[A-Za-z_0-9)\]]\s*"/.test(src)) hint = " Hint: did you forget a + between text and a variable?";
      fail(line, "There is a mistake in this expression: " + src.trim() + hint);
    }
  }

  function translateExpr(src, line) {
    if (!src || !src.trim()) fail(line, "A value or expression is missing here.");
    var js = tokensToJs(tokenize(src, line), line);
    checkJsExpression(js, src, line);
    return js;
  }

  // Split a source string by top-level commas (not inside brackets or quotes)
  function splitTopLevel(src, line, sepTest) {
    var tokens = tokenize(src, line);
    var parts = [], depth = 0, startPos = 0;
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (t.t === "op" && OPEN[t.v]) depth++;
      else if (t.t === "op" && CLOSE[t.v]) depth--;
      else if (depth === 0 && sepTest(t)) {
        parts.push({ text: src.slice(startPos, t.s), sep: t });
        startPos = t.e;
      }
    }
    parts.push({ text: src.slice(startPos), sep: null });
    return parts;
  }

  // Find the first top-level token matching `test`; returns token or null
  function findTopLevel(src, line, test, last) {
    var tokens = tokenize(src, line), depth = 0, found = null;
    for (var i = 0; i < tokens.length; i++) {
      var t = tokens[i];
      if (t.t === "op" && OPEN[t.v]) depth++;
      else if (t.t === "op" && CLOSE[t.v]) depth--;
      else if (depth === 0 && test(t)) { found = t; if (!last) return t; }
    }
    return found;
  }

  // ---------------------------------------------------------------------------
  // Step 1: split source into logical lines
  // (strip comments, join multi-line [ ... ] lists, measure indentation)
  // ---------------------------------------------------------------------------
  function stripComment(text, line) {
    var quote = null;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (quote) {
        if (c === "\\") { i++; continue; }
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === "/" && text[i + 1] === "/") {
        return text.slice(0, i);
      }
    }
    if (quote) fail(line, "A text value is missing its closing quote " + quote + ".");
    return text;
  }

  function bracketBalance(text) {
    var depth = 0, quote = null;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (quote) { if (c === "\\") i++; else if (c === quote) quote = null; continue; }
      if (c === '"' || c === "'") quote = c;
      else if (c === "(" || c === "[" || c === "{") depth++;
      else if (c === ")" || c === "]" || c === "}") depth--;
    }
    return depth;
  }

  function logicalLines(source, lineBase) {
    lineBase = lineBase || 0;
    var raw = source
      .replace(/\r\n?/g, "\n")
      .replace(/[\u201c\u201d\u201e\u2033]/g, '"')   // curly quotes pasted from Word / Google Docs
      .replace(/[\u2018\u2019\u2032]/g, "'")
      .split("\n");
    var result = [], pending = null;
    for (var i = 0; i < raw.length; i++) {
      var lineNo = lineBase + i + 1;
      var text = raw[i].replace(/\t/g, "    ").replace(/ /g, " ");
      text = stripComment(text, lineNo).replace(/\s+$/, "");
      if (pending) {
        if (text.trim()) {
          pending.text += " " + text.trim();
          pending.depth += bracketBalance(text);
        }
        if (pending.depth <= 0) { result.push(pending); pending = null; }
        continue;
      }
      if (!text.trim()) continue;
      var indent = text.match(/^ */)[0].length;
      var item = { line: lineNo, indent: indent, text: text.trim(), depth: bracketBalance(text) };
      if (item.depth > 0) pending = item;
      else result.push(item);
    }
    if (pending) fail(pending.line, "A bracket opened on this line is never closed. Check your [ ] ( ) { }.");
    return result;
  }

  // ---------------------------------------------------------------------------
  // Custom commands (taught by the user, stored in their browser)
  //
  //   { pattern: "INCREASE {x} BY {n}", replacement: "SET {x} = {x} + {n}", anywhere: false }
  //
  // A "whole line" command replaces a full line with one or more lines of pseudo code.
  // An "anywhere" command replaces a phrase inside any line, e.g. "{a} IS GREATER THAN {b}" -> "{a} > {b}".
  // {#} in the replacement becomes a unique number (useful for loop variables).
  // ---------------------------------------------------------------------------
  var MASK_RE = /\u0001(\d+)\u0001/g;
  var OPERAND = "(?:\u0001\\d+\u0001|-?\\d+(?:\\.\\d+)?|[A-Za-z_][A-Za-z0-9_]*" +
    "(?:\\.[A-Za-z_][A-Za-z0-9_]*|\\[[^\\[\\]]*\\]|\\([^()]*\\))*|\\([^()]*\\)|\\[[^\\[\\]]*\\])";

  function maskStrings(text) {
    var strings = [];
    var masked = text.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, function (str) {
      strings.push(str);
      return "\u0001" + (strings.length - 1) + "\u0001";
    });
    return { text: masked, strings: strings };
  }
  function unmask(text, strings) {
    return text.replace(MASK_RE, function (all, i) { return strings[+i] !== undefined ? strings[+i] : all; });
  }
  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

  function literalToRe(text) {
    return text.split(/(\s+)/).map(function (chunk) {
      if (!chunk) return "";
      if (/^\s+$/.test(chunk)) return "\\s*";
      return (/^\w/.test(chunk) ? "\\b" : "") + escapeRe(chunk) + (/\w$/.test(chunk) ? "\\b" : "");
    }).join("");
  }

  /** Check a custom command and turn it into a matcher. Throws Error with a friendly message. */
  function compileCommand(cmd) {
    var pattern = String(cmd.pattern || "").trim();
    var optionalColon = !cmd.anywhere && /:$/.test(pattern);
    if (optionalColon) pattern = pattern.replace(/\s*:$/, "");
    var replacement = String(cmd.replacement || "").replace(/\r\n?/g, "\n").replace(/\t/g, "    ").replace(/\s+$/, "");
    if (!pattern) throw new Error("Write the pattern: how the command looks, e.g. INCREASE {x} BY {n}");
    if (pattern.indexOf("\n") >= 0) throw new Error("The pattern must be a single line.");
    if (!replacement.trim()) throw new Error("Write what the command means, using commands the runner already knows.");
    var parts = pattern.split(/(\{[A-Za-z_][A-Za-z0-9_]*\})/);
    var names = [], src = "", hasWord = false, lastWasHole = false;
    parts.forEach(function (part) {
      var hole = part.match(/^\{([A-Za-z_][A-Za-z0-9_]*)\}$/);
      if (hole) {
        if (names.indexOf(hole[1]) >= 0) throw new Error("The placeholder {" + hole[1] + "} appears twice in the pattern. Give each one a different name.");
        if (lastWasHole) throw new Error("Two placeholders need a word between them, e.g. {a} AND {b}.");
        names.push(hole[1]);
        src += "(" + (cmd.anywhere ? OPERAND : ".+?") + ")";
        lastWasHole = true;
      } else {
        if (/[{}]/.test(part)) throw new Error("Placeholders are written like {name} (letters, numbers and _ only).");
        if (/[A-Za-z0-9]/.test(part)) hasWord = true;
        if (part.trim()) lastWasHole = false;
        src += literalToRe(part);
      }
    });
    if (!hasWord) throw new Error("The pattern needs at least one fixed word, e.g. INCREASE {x} BY {n}.");
    var used = replacement.match(/\{([A-Za-z_][A-Za-z0-9_]*|#)\}/g) || [];
    used.forEach(function (u) {
      var nm = u.slice(1, -1);
      if (nm !== "#" && names.indexOf(nm) < 0) throw new Error("The meaning uses " + u + " but the pattern has no " + u + ".");
    });
    if (cmd.anywhere && replacement.indexOf("\n") >= 0) {
      throw new Error("A command that can appear inside a line must mean a single line (a value or condition).");
    }
    var re = cmd.anywhere ? new RegExp(src, "g") : new RegExp("^\\s*" + src + "\\s*:?\\s*$");
    if (optionalColon) pattern += ":";
    return { pattern: pattern, replacement: replacement, anywhere: !!cmd.anywhere, names: names, re: re };
  }

  function makeExpander(commands) {
    var compiled = [];
    (commands || []).forEach(function (c) {
      try { compiled.push(compileCommand(c)); } catch (e) { /* invalid commands are ignored */ }
    });
    var lineRules = compiled.filter(function (r) { return !r.anywhere; });
    var phraseRules = compiled.filter(function (r) { return r.anywhere; });
    var counter = 0;

    function fill(rule, groups, strings, keepMasked) {
      var vals = {};
      rule.names.forEach(function (nm, i) {
        var v = (groups[i] || "").trim();
        vals[nm] = keepMasked ? v : unmask(v, strings);
      });
      var id = ++counter;
      return rule.replacement.replace(/\{([A-Za-z_][A-Za-z0-9_]*|#)\}/g, function (all, nm) {
        if (nm === "#") return String(id);
        return Object.prototype.hasOwnProperty.call(vals, nm) ? vals[nm] : all;
      });
    }

    function applyPhrases(text) {
      for (var round = 0; round < 10; round++) {
        var mk = maskStrings(text), t = mk.text, changed = false;
        phraseRules.forEach(function (r) {
          r.re.lastIndex = 0;
          t = t.replace(r.re, function () {
            changed = true;
            return fill(r, Array.prototype.slice.call(arguments, 1, 1 + r.names.length), mk.strings, true);
          });
        });
        text = unmask(t, mk.strings);
        if (!changed) break;
      }
      return text;
    }

    // Returns the list of lines an input line turns into.
    function expand(item, depth, out) {
      if (depth > 12) {
        fail(item.line, "Your custom command \"" + item.rule + "\" keeps turning into itself forever. " +
          "Change its meaning so it uses commands the runner already knows.");
      }
      var mk = maskStrings(item.text);
      for (var i = 0; i < lineRules.length; i++) {
        var r = lineRules[i], m = mk.text.match(r.re);
        if (!m) continue;
        var lines = fill(r, m.slice(1), mk.strings, false).split("\n");
        var base = null;
        lines.forEach(function (l) {
          if (!l.trim()) return;
          var ind = l.match(/^ */)[0].length;
          if (base === null || ind < base) base = ind;
        });
        lines.forEach(function (l) {
          var c = stripComment(l, item.line).replace(/\s+$/, "");
          if (!c.trim()) return;
          var ind = c.match(/^ */)[0].length;
          expand({
            line: item.line,
            indent: item.indent + Math.max(0, ind - base),
            text: c.trim(),
            rule: item.rule || r.pattern,
            original: item.original || item.text
          }, depth + 1, out);
        });
        return out;
      }
      if (phraseRules.length) {
        var nt = applyPhrases(item.text);
        if (nt !== item.text) {
          return expand({ line: item.line, indent: item.indent, text: nt,
            rule: item.rule || "phrase", original: item.original || item.text }, depth + 1, out);
        }
      }
      out.push(item);
      return out;
    }

    return {
      active: compiled.length > 0,
      lines: function (items) {
        if (!compiled.length) return items;
        var out = [];
        items.forEach(function (it) { expand(it, 0, out); });
        return out;
      }
    };
  }

  /** For the "Try it" box: what does `sampleLine` become with this one command? */
  function previewCommand(cmd, sampleLine) {
    var rule = compileCommand(cmd);
    var exp = makeExpander([cmd]);
    var indent = (sampleLine.match(/^ */) || [""])[0].length;
    var items = exp.lines([{ line: 1, indent: indent, text: sampleLine.trim() }]);
    var changed = !(items.length === 1 && items[0].text === sampleLine.trim() && !items[0].rule);
    return {
      matched: changed,
      rule: rule,
      text: items.map(function (it) { return new Array(it.indent + 1).join(" ") + it.text; }).join("\n")
    };
  }

  var FN_LINE_BASE = 100000; // line numbers of custom pseudo functions start here (one block per function)

  function customFunctionSource(fn) {
    var params = String(fn.params || "").trim();
    var body = String(fn.body || "").replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n");
    return "FUNCTION " + fn.name + "(" + params + ")\n" +
      body.map(function (l) { return l.trim() ? "    " + l : ""; }).join("\n") + "\nEND FUNCTION";
  }

  function checkFunctionHeader(fn) {
    var name = String(fn.name || "").trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error("The function name can only use letters, numbers and _ (no spaces).");
    if (BUILTIN_SET[name]) throw new Error(name + " is already a built-in function. Choose another name.");
    if (JS_RESERVED[name] || COMMANDS.indexOf(name.toUpperCase()) >= 0) throw new Error("\"" + name + "\" cannot be used as a function name. Choose another name.");
    var params = String(fn.params || "").trim();
    if (params && !/^[A-Za-z_][A-Za-z0-9_]*(\s*,\s*[A-Za-z_][A-Za-z0-9_]*)*$/.test(params)) {
      throw new Error("Parameters are names separated by commas, e.g.  text, times");
    }
    if (!String(fn.body || "").trim()) throw new Error("The function body is empty.");
    return name;
  }

  // Custom functions that will be included for this program
  function libraryFor(source, custom) {
    return ((custom && custom.functions) || []).filter(function (fn) {
      try { checkFunctionHeader(fn); } catch (e) { return false; }
      // a FUNCTION with the same name written in the program itself wins
      return !new RegExp("^\\s*FUNCTION\\s+" + fn.name + "\\s*\\(", "m").test(source);
    });
  }

  /** Validate a custom function. Returns null when fine or a friendly error message. */
  function checkFunction(fn) {
    try {
      checkFunctionHeader(fn);
      if (fn.language === "js") {
        new Function("PRINT", "return function (" + (fn.params || "") + ") {\n" + fn.body + "\n};");
      } else {
        transpile("", { functions: [fn] });
      }
      return null;
    } catch (e) {
      var msg = e.message || String(e);
      if (e.line && e.line > FN_LINE_BASE) {
        var bodyLine = (e.line % FN_LINE_BASE) - 1;
        if (bodyLine >= 1) msg = "Body line " + bodyLine + ": " + msg;
      }
      return msg;
    }
  }

  // ---------------------------------------------------------------------------
  // Step 2: parse statements and generate JavaScript
  // ---------------------------------------------------------------------------
  var BLOCK_NAMES = { IF: "IF", FOR: "FOR", WHILE: "WHILE", FUNCTION: "FUNCTION", REPEAT: "REPEAT" };
  var LOOP_GUARD = "if (++__rt.steps > __rt.MAX_STEPS) __rt.tooManySteps();";

  function transpile(source, custom) {
    custom = custom || {};
    var expander = makeExpander(custom.commands);
    var lines = expander.lines(logicalLines(source));

    // the user's custom functions
    CUSTOM_JS = {};
    var libFunctions = libraryFor(source, custom);
    var pseudoIndex = 0;
    libFunctions.forEach(function (fn) {
      if (fn.language === "js") { CUSTOM_JS[fn.name] = true; return; }
      var base = FN_LINE_BASE * (++pseudoIndex);
      lines = lines.concat(expander.lines(logicalLines(customFunctionSource(fn), base)));
    });

    var stack = [];           // open blocks
    var globalScope = { vars: {}, localOnly: {}, params: {}, out: [] };
    var functions = [];       // finished function scopes
    var scope = globalScope;
    var tempId = 0;
    var functionNames = {};

    function emit(code) {
      var depth = stack.length - (scope === globalScope ? 0 : 1);
      scope.out.push(new Array(depth + 1).join("    ") + code);
    }
    function declare(name, localOnly) {
      scope.vars[name] = true;
      if (localOnly) scope.localOnly[name] = true;
    }
    function inLoop() {
      for (var i = stack.length - 1; i >= 0; i--) {
        if (stack[i].type === "FOR" || stack[i].type === "WHILE" || stack[i].type === "REPEAT") return true;
        if (stack[i].type === "FUNCTION") return false;
      }
      return false;
    }
    function lineMark(n) { return "__rt.line = " + n + ";"; }
    function stripTail(text, words) {
      // remove trailing THEN / DO / ':' etc.
      var re = new RegExp("\\s*(?:" + words + ")\\s*:?\\s*$");
      return text.replace(re, "").replace(/\s*:\s*$/, "");
    }

    lines.forEach(function (L) {
      try {
        processLine(L);
      } catch (e) {
        if (e instanceof PseudoError && L.rule && !e.annotated) {
          e.annotated = true;
          e.message += " (This line uses your custom command \"" + L.rule + "\". It was turned into: " + L.text + ")";
        }
        throw e;
      }
    });

    function processLine(L) {
      var text = L.text, n = L.line;
      var firstWord = (text.match(/^[A-Za-z_][A-Za-z0-9_]*/) || [""])[0];
      var upper = firstWord.toUpperCase();

      // ---- friendly checks -------------------------------------------------
      if (firstWord && firstWord !== upper && COMMANDS.indexOf(upper) >= 0 &&
          !(scope.vars[firstWord] && /^\w+\s*(\[|\.|=[^=])/.test(text)) && !/^\w+\s*\(/.test(text)) {
        fail(n, "Commands must be written in UPPERCASE. Write " + upper + " instead of " + firstWord + ".");
      }

      var isCloser = /^(END\b|ENDIF\b|ENDFOR\b|ENDWHILE\b|ENDFUNCTION\b|ELSE\b|ELSEIF\b|UNTIL\b)/.test(text);
      var expected = (stack.length - (isCloser ? 1 : 0)) * INDENT;
      if (expected < 0) expected = 0;
      if (L.indent % INDENT !== 0) {
        fail(n, "Indentation must be a multiple of " + INDENT + " spaces (found " + L.indent + "). " +
          "This line should start with " + expected + " spaces.");
      }
      if (L.indent !== expected) {
        var top = stack[stack.length - 1];
        if (L.indent > expected) {
          fail(n, "Too much indentation: expected " + expected + " spaces but found " + L.indent + ". " +
            "Only indent lines that are inside an IF, FOR, WHILE, REPEAT or FUNCTION block.");
        } else if (top && !isCloser) {
          fail(n, "Not enough indentation: expected " + expected + " spaces but found " + L.indent + ". " +
            "This line is inside the " + top.type + " block that starts on line " + top.line +
            ". (If the block should end here, add END " + top.type + " first.)");
        } else {
          fail(n, "Wrong indentation: expected " + expected + " spaces but found " + L.indent + ".");
        }
      }

      // ---- END ... ---------------------------------------------------------
      var endMatch = text.match(/^END\s*(IF|FOR|WHILE|FUNCTION)?\s*:?$/);
      if (endMatch) {
        var kind = endMatch[1];
        var block = stack[stack.length - 1];
        if (!kind) fail(n, "Write what you are ending, e.g. END IF, END FOR, END WHILE or END FUNCTION.");
        if (!block) fail(n, "END " + kind + " has no matching " + kind + " above it.");
        if (block.type === "REPEAT") fail(n, "A REPEAT block (line " + block.line + ") must end with UNTIL condition, not END " + kind + ".");
        if (block.type !== kind) {
          fail(n, "Expected END " + block.type + " (to close the " + block.type + " on line " + block.line +
            ") but found END " + kind + ".");
        }
        stack.pop();
        if (kind === "FUNCTION") {
          functions.push(scope);
          scope = globalScope;
        } else {
          emit(block.closer || "}");
        }
        return;
      }
      if (/^END/.test(text) && /^END[A-Z]*$/.test(text.replace(/\s+/g, "")) ) {
        fail(n, "Unknown END. Use END IF, END FOR, END WHILE or END FUNCTION (with a space). " +
          "If \"" + text + "\" is a command you use, you can teach it to the runner.", "unknown-line", { text: L.original || text });
      }

      // ---- ELSE / ELSE IF --------------------------------------------------
      var elseIf = text.match(/^ELSE\s*IF\b(.*)$/);
      if (elseIf || /^ELSE\s*:?$/.test(text)) {
        var ib = stack[stack.length - 1];
        if (!ib || ib.type !== "IF") fail(n, "ELSE must be inside an IF block (at the same indentation as its IF).");
        if (ib.hadElse) fail(n, "This IF (line " + ib.line + ") already has an ELSE. ELSE must be the last part.");
        stack.pop();
        if (elseIf) {
          var c2 = stripTail(elseIf[1], "THEN");
          emit("} else if ((" + lineMark(n).slice(0, -1) + ", " + translateExpr(c2, n) + ")) {");
        } else {
          ib.hadElse = true;
          emit("} else {");
        }
        stack.push(ib);
        return;
      }

      // ---- UNTIL (closes REPEAT) -------------------------------------------
      if (upper === "UNTIL" && firstWord === "UNTIL") {
        var rb = stack[stack.length - 1];
        if (!rb || rb.type !== "REPEAT") fail(n, "UNTIL must close a REPEAT block.");
        stack.pop();
        emit("} while (!(" + "(" + lineMark(n).slice(0, -1) + ", " + translateExpr(text.slice(5), n) + ")));");
        return;
      }

      var rest = text.slice(firstWord.length).trim();

      switch (firstWord) {
        case "SET": {
          var eq = findTopLevel(rest, n, function (t) { return t.t === "op" && t.v === "="; });
          if (!eq) fail(n, "SET needs an equals sign: SET name = value");
          var target = rest.slice(0, eq.s).trim();
          var value = rest.slice(eq.e).trim();
          if (!target) fail(n, "SET needs a variable name: SET name = value");
          if (!/^[A-Za-z_][A-Za-z0-9_]*(\s*(\[.*\]|\.\s*[A-Za-z_][A-Za-z0-9_]*))*$/.test(target)) {
            fail(n, "'" + target + "' is not a valid variable name. Names use letters, numbers and _ and cannot start with a number.");
          }
          var tjs = translateExpr(target, n);
          if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(target)) declare(renameIdent(target));
          emit(lineMark(n) + " " + tjs + " = " + translateExpr(value, n) + ";");
          return;
        }
        case "PRINT": {
          if (!rest) { emit(lineMark(n) + ' __rt.PRINT("");'); return; }
          var parts = splitTopLevel(rest, n, function (t) { return t.t === "op" && t.v === ","; })
            .map(function (p) { return translateExpr(p.text, n); });
          emit(lineMark(n) + " __rt.PRINT(" + parts.join(", ") + ");");
          return;
        }
        case "IF": {
          var cond = stripTail(rest, "THEN");
          if (!cond) fail(n, "IF needs a condition: IF score > 50 THEN");
          emit(lineMark(n) + " if (" + translateExpr(cond, n) + ") {");
          stack.push({ type: "IF", line: n });
          return;
        }
        case "WHILE": {
          var wc = stripTail(rest, "DO");
          if (!wc) fail(n, "WHILE needs a condition: WHILE count < 10 DO");
          emit("while ((" + lineMark(n).slice(0, -1) + ", " + translateExpr(wc, n) + ")) {");
          stack.push({ type: "WHILE", line: n });
          emit(LOOP_GUARD);
          return;
        }
        case "REPEAT": {
          if (rest && rest !== ":") fail(n, "REPEAT stands alone on its line. Put the condition on the UNTIL line.");
          emit("do {");
          stack.push({ type: "REPEAT", line: n });
          emit(LOOP_GUARD);
          return;
        }
        case "FOR": {
          var body = stripTail(rest, "DO");
          var each = body.match(/^EACH\s+([A-Za-z_][A-Za-z0-9_]*)\s+IN\s+(.+)$/);
          if (/^each\b/i.test(body) && !each) {
            fail(n, "Write FOR EACH like this: FOR EACH item IN list:   (EACH and IN in UPPERCASE)");
          }
          if (each) {
            var ev = renameIdent(each[1]);
            declare(ev, true);
            emit(lineMark(n) + " for (" + ev + " of __rt.ITER(" + translateExpr(each[2], n) + ")) {");
            stack.push({ type: "FOR", line: n });
            emit(LOOP_GUARD);
            return;
          }
          var fm = body.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*(?:FROM\b|=)\s*(.+)$/);
          if (!fm) fail(n, "Write FOR loops like this: FOR i FROM 1 TO 10:   or   FOR EACH item IN list:");
          var loopVar = renameIdent(fm[1]);
          var toTok = findTopLevel(fm[2], n, function (t) { return t.t === "id" && t.v === "TO"; });
          if (!toTok) fail(n, "FOR needs TO: FOR i FROM 1 TO 10:");
          var startSrc = fm[2].slice(0, toTok.s);
          var afterTo = fm[2].slice(toTok.e);
          var stepTok = findTopLevel(afterTo, n, function (t) { return t.t === "id" && t.v === "STEP"; });
          var endSrc = stepTok ? afterTo.slice(0, stepTok.s) : afterTo;
          var stepSrc = stepTok ? afterTo.slice(stepTok.e) : "1";
          var id = ++tempId;
          declare(loopVar, true);
          emit(lineMark(n) + " { const __end" + id + " = " + translateExpr(endSrc, n) +
            ", __step" + id + " = __rt.STEP(" + translateExpr(stepSrc, n) + ");");
          emit("for (" + loopVar + " = " + translateExpr(startSrc, n) + "; __step" + id + " > 0 ? " +
            loopVar + " <= __end" + id + " : " + loopVar + " >= __end" + id + "; " +
            loopVar + " += __step" + id + ") {");
          stack.push({ type: "FOR", line: n, closer: "}}" });
          emit(LOOP_GUARD);
          return;
        }
        case "ADD": {
          var to = findTopLevel(rest, n, function (t) { return t.t === "id" && t.v === "TO"; }, true);
          if (!to) fail(n, "Write ADD like this: ADD value TO listName");
          emit(lineMark(n) + " __rt.ADD(" + translateExpr(rest.slice(0, to.s), n) + ", " +
            translateExpr(rest.slice(to.e), n) + ");");
          return;
        }
        case "REMOVE": {
          var from = findTopLevel(rest, n, function (t) { return t.t === "id" && t.v === "FROM"; }, true);
          if (!from) fail(n, "Write REMOVE like this: REMOVE value FROM listName");
          emit(lineMark(n) + " __rt.REMOVE(" + translateExpr(rest.slice(0, from.s), n) + ", " +
            translateExpr(rest.slice(from.e), n) + ");");
          return;
        }
        case "SORT": {
          var desc = false, key = "null", src = rest;
          var dm = src.match(/\s+(ASCENDING|DESCENDING|ASC|DESC)\s*$/);
          if (dm) { desc = /^DESC/.test(dm[1]); src = src.slice(0, dm.index); }
          var by = findTopLevel(src, n, function (t) { return t.t === "id" && t.v === "BY"; }, true);
          if (by) {
            var keySrc = src.slice(by.e).trim();
            src = src.slice(0, by.s);
            if (/^\d+$/.test(keySrc)) key = keySrc;
            else if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(keySrc)) key = JSON.stringify(keySrc);
            else if (/^("[^"]*"|'[^']*')$/.test(keySrc)) key = keySrc;
            else fail(n, "SORT ... BY needs a field name, e.g. SORT people BY age DESCENDING");
          }
          if (!src.trim()) fail(n, "Write SORT like this: SORT listName   or   SORT listName BY field DESCENDING");
          emit(lineMark(n) + " __rt.SORT(" + translateExpr(src, n) + ", " + key + ", " + desc + ");");
          return;
        }
        case "FUNCTION": {
          if (stack.length) fail(n, "FUNCTION must be written at the start of the line (not inside another block).");
          var fn = stripTail(rest, "DO").match(/^([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)$/);
          if (!fn) fail(n, "Write FUNCTION like this: FUNCTION name(param1, param2)");
          if (BUILTIN_SET[fn[1]]) fail(n, fn[1] + " is a built-in function. Choose another name.");
          var params = fn[2].trim() ? fn[2].split(",").map(function (p) {
            p = p.trim();
            if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(p)) fail(n, "'" + p + "' is not a valid parameter name.");
            return renameIdent(p);
          }) : [];
          var fname = renameIdent(fn[1]);
          functionNames[fname] = true;
          var fscope = { vars: {}, localOnly: {}, params: {}, out: [], name: fname, header: null };
          params.forEach(function (p) { fscope.params[p] = true; });
          fscope.header = "function " + fname + "(" + params.join(", ") + ") {";
          scope = fscope;
          stack.push({ type: "FUNCTION", line: n });
          return;
        }
        case "RETURN": {
          var inFn = stack.some(function (b) { return b.type === "FUNCTION"; });
          if (!inFn) fail(n, "RETURN can only be used inside a FUNCTION.");
          emit(lineMark(n) + " return" + (rest ? " " + translateExpr(rest, n) : "") + ";");
          return;
        }
        case "CALL": {
          if (!/^[A-Za-z_][A-Za-z0-9_]*\s*\(.*\)$/.test(rest)) fail(n, "Write CALL like this: CALL functionName(arguments)");
          emit(lineMark(n) + " " + translateExpr(rest, n) + ";");
          return;
        }
        case "BREAK":
        case "CONTINUE": {
          if (rest) fail(n, firstWord + " stands alone on its line.");
          if (!inLoop()) fail(n, firstWord + " can only be used inside a loop (FOR, WHILE, REPEAT).");
          emit(firstWord.toLowerCase() + ";");
          return;
        }
        case "INPUT": {
          var im = rest.match(/^([A-Za-z_][A-Za-z0-9_]*)$/);
          if (!im) fail(n, "Write INPUT like this: INPUT variableName");
          var iv = renameIdent(im[1]);
          declare(iv);
          emit(lineMark(n) + " " + iv + " = __rt.INPUT(" + JSON.stringify("Enter a value for " + im[1] + ":") + ");");
          return;
        }
        case "THEN":
          fail(n, "THEN must be on the same line as its IF: IF condition THEN");
      }

      // bare function call:  myFunction(1, 2)
      if (/^[A-Za-z_][A-Za-z0-9_]*\s*\(.*\)$/.test(text) && !BUILTIN_SET[firstWord]) {
        emit(lineMark(n) + " " + translateExpr(text, n) + ";");
        return;
      }
      if (/^[A-Za-z_][A-Za-z0-9_]*\s*(\[.*\]|\.\w+)*\s*=[^=]/.test(text)) {
        fail(n, "To give a variable a value, start the line with SET, e.g. SET " + text.replace(/\s+/g, " "));
      }
      if (/^[A-Za-z_][A-Za-z0-9_]*\s*(\+\+|--|\+=|-=)/.test(text)) {
        fail(n, "Use SET to change a value, e.g. SET " + firstWord + " = " + firstWord + " + 1");
      }
      fail(n, "I don't understand this line: \"" + text + "\". Each line must start with a command such as " +
        "SET, PRINT, IF, FOR, WHILE, ADD... (see the Glossary). If this is a command you use, you can teach it to the runner.",
        "unknown-line", { text: L.original || text });
    }

    if (scope !== globalScope || stack.length) {
      var open = stack[stack.length - 1];
      fail(open.line, "This " + open.type + " block is never closed. Add " +
        (open.type === "REPEAT" ? "UNTIL condition" : "END " + open.type) + " at the end of it.");
    }

    // ---- assemble ----------------------------------------------------------
    var code = ['"use strict";'];
    var globals = Object.keys(globalScope.vars);
    if (globals.length) code.push("let " + globals.join(", ") + ";");
    functions.forEach(function (f) {
      code.push("");
      code.push(f.header);
      var locals = Object.keys(f.vars).filter(function (v) {
        return !f.params[v] && (f.localOnly[v] || !globalScope.vars[v]);
      });
      if (locals.length) code.push("    let " + locals.join(", ") + ";");
      f.out.forEach(function (l) { code.push("    " + l); });
      code.push("}");
    });
    if (functions.length) code.push("");
    code = code.concat(globalScope.out);
    return code.join("\n");
  }

  // ---------------------------------------------------------------------------
  // Runtime library (what the generated JavaScript calls)
  // ---------------------------------------------------------------------------
  function typeName(v) {
    if (v === null) return "null";
    if (v === undefined) return "nothing (undefined)";
    if (Array.isArray(v)) return "list";
    if (typeof v === "object") return "dictionary";
    if (typeof v === "string") return "text";
    return typeof v;
  }

  function format(v, nested) {
    if (v === null) return "null";
    if (v === undefined) return "undefined";
    if (typeof v === "string") return nested ? JSON.stringify(v) : v;
    if (typeof v === "number") {
      if (!isFinite(v)) return isNaN(v) ? "NaN (not a number)" : (v > 0 ? "Infinity" : "-Infinity");
      return String(v);
    }
    if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
    if (Array.isArray(v)) return "[" + v.map(function (x) { return format(x, true); }).join(", ") + "]";
    if (typeof v === "function") return "<function>";
    if (typeof v === "object") {
      return "{" + Object.keys(v).map(function (k) { return k + ": " + format(v[k], true); }).join(", ") + "}";
    }
    return String(v);
  }

  function RuntimeError(message) { this.name = "RuntimeError"; this.message = message; }
  RuntimeError.prototype = Object.create(Error.prototype);

  function createRuntime(options) {
    options = options || {};
    var printFn = options.print || function () {};
    var inputFn = options.input || function (msg) { return typeof prompt === "function" ? prompt(msg) : ""; };
    var printed = 0;

    function err(msg) { throw new RuntimeError(msg); }
    function needList(v, fnName) {
      if (!Array.isArray(v)) err(fnName + " needs a list, but got " + typeName(v) + ".");
    }
    function needNumber(v, fnName) {
      if (typeof v !== "number" || isNaN(v)) err(fnName + " needs a number, but got " + typeName(v) + " (" + format(v, true) + ").");
    }
    function listArgs(args, fnName) {
      var list = args.length === 1 && Array.isArray(args[0]) ? args[0] : Array.prototype.slice.call(args);
      if (!list.length) err(fnName + " needs at least one value.");
      list.forEach(function (x) { needNumber(x, fnName); });
      return list;
    }

    var rt = {
      custom: {},
      line: 0,
      steps: 0,
      MAX_STEPS: options.maxSteps || MAX_STEPS,
      tooManySteps: function () {
        err("The program ran more than " + rt.MAX_STEPS.toLocaleString() +
          " loop steps. You probably have an infinite loop (a WHILE condition that never becomes false?).");
      },
      PRINT: function () {
        if (++printed > MAX_OUTPUT) err("Too much output (more than " + MAX_OUTPUT + " lines). Stopped.");
        var parts = [];
        for (var i = 0; i < arguments.length; i++) parts.push(format(arguments[i]));
        printFn(parts.join(" "));
      },
      ITER: function (c) {
        if (Array.isArray(c)) return c.slice();
        if (typeof c === "string") return c.split("");
        if (c && typeof c === "object") return Object.keys(c);
        err("FOR EACH needs a list, text or dictionary, but got " + typeName(c) + ".");
      },
      STEP: function (s) {
        needNumber(s, "STEP");
        if (s === 0) err("STEP cannot be 0 (the loop would never end).");
        return s;
      },
      EXISTS: function (item, c) {
        if (Array.isArray(c)) { for (var i = 0; i < c.length; i++) if (c[i] == item) return true; return false; }
        if (typeof c === "string") return c.indexOf(String(item)) >= 0;
        if (c && typeof c === "object") return Object.prototype.hasOwnProperty.call(c, String(item));
        err("EXISTS IN needs a list, text or dictionary on the right, but got " + typeName(c) + ".");
      },
      ADD: function (item, list) {
        if (!Array.isArray(list)) {
          if (list && typeof list === "object") err("ADD ... TO works with lists. For a dictionary use: SET dict[key] = value");
          err("ADD ... TO needs a list, but got " + typeName(list) + ". Create it first with SET name = []");
        }
        list.push(item);
      },
      REMOVE: function (item, c) {
        if (Array.isArray(c)) {
          for (var i = 0; i < c.length; i++) if (c[i] == item) { c.splice(i, 1); return; }
          return;
        }
        if (c && typeof c === "object") { delete c[String(item)]; return; }
        err("REMOVE ... FROM needs a list or dictionary, but got " + typeName(c) + ".");
      },
      SORT: function (list, key, desc) {
        needList(list, "SORT");
        function pick(el) {
          if (key === null) return el;
          if (Array.isArray(el)) {
            if (typeof key === "number") return el[key];
            return /^(name|key|first|item|product|label)$/i.test(key) ? el[0] : el[1];
          }
          if (el && typeof el === "object") return el[key];
          return el;
        }
        list.sort(function (a, b) {
          var x = pick(a), y = pick(b), r;
          if (typeof x === "number" && typeof y === "number") r = x - y;
          else r = String(x).localeCompare(String(y));
          return desc ? -r : r;
        });
      },
      LENGTH: function (v) {
        if (typeof v === "string" || Array.isArray(v)) return v.length;
        if (v && typeof v === "object") return Object.keys(v).length;
        err("LENGTH needs a list, text or dictionary, but got " + typeName(v) + ".");
      },
      ROUND: function (x, d) {
        needNumber(x, "ROUND");
        if (d === undefined || d === 0) return Math.round(x);
        needNumber(d, "ROUND");
        return (Math.round(x * Math.pow(10, d)) / Math.pow(10, d)).toFixed(d);
      },
      FLOOR: function (x) { needNumber(x, "FLOOR"); return Math.floor(x); },
      CEIL: function (x) { needNumber(x, "CEIL"); return Math.ceil(x); },
      ABS: function (x) { needNumber(x, "ABS"); return Math.abs(x); },
      SQRT: function (x) { needNumber(x, "SQRT"); return Math.sqrt(x); },
      POWER: function (x, y) { needNumber(x, "POWER"); needNumber(y, "POWER"); return Math.pow(x, y); },
      MIN: function () { return Math.min.apply(null, listArgs(arguments, "MIN")); },
      MAX: function () { return Math.max.apply(null, listArgs(arguments, "MAX")); },
      SUM: function (list) {
        needList(list, "SUM");
        return list.reduce(function (a, b) { needNumber(b, "SUM"); return a + b; }, 0);
      },
      AVERAGE: function (list) {
        needList(list, "AVERAGE");
        if (!list.length) err("AVERAGE of an empty list is not possible.");
        return rt.SUM(list) / list.length;
      },
      RANDOM: function (a, b) {
        needNumber(a, "RANDOM"); needNumber(b, "RANDOM");
        return Math.floor(Math.random() * (b - a + 1)) + a;
      },
      UPPER: function (s) { return String(s).toUpperCase(); },
      LOWER: function (s) { return String(s).toLowerCase(); },
      TRIM: function (s) { return String(s).trim(); },
      STR: function (v) { return format(v); },
      NUM: function (v) {
        var x = Number(v);
        if (v === "" || v === null || isNaN(x)) err("NUM could not turn " + format(v, true) + " into a number.");
        return x;
      },
      INT: function (v) { var x = rt.NUM(v); return x < 0 ? Math.ceil(x) : Math.floor(x); },
      KEYS: function (d) {
        if (!d || typeof d !== "object" || Array.isArray(d)) err("KEYS needs a dictionary.");
        return Object.keys(d);
      },
      VALUES: function (d) {
        if (!d || typeof d !== "object" || Array.isArray(d)) err("VALUES needs a dictionary.");
        return Object.keys(d).map(function (k) { return d[k]; });
      },
      CONTAINS: function (c, item) { return rt.EXISTS(item, c); },
      INDEX_OF: function (list, item) {
        if (typeof list === "string") return list.indexOf(String(item));
        needList(list, "INDEX_OF");
        for (var i = 0; i < list.length; i++) if (list[i] == item) return i;
        return -1;
      },
      SUBSTRING: function (s, start, end) { return String(s).substring(start, end); },
      SPLIT: function (s, sep) { return String(s).split(sep === undefined ? " " : sep); },
      JOIN: function (list, sep) {
        needList(list, "JOIN");
        return list.map(function (x) { return format(x); }).join(sep === undefined ? ", " : sep);
      },
      TYPE: function (v) { return typeName(v); },
      INPUT: function (msg) {
        var v = inputFn(msg === undefined ? "Enter a value:" : String(msg));
        if (v === null || v === undefined) return "";
        if (/^\s*-?\d+(\.\d+)?\s*$/.test(v)) return Number(v);
        return v;
      }
    };
    ((options.custom && options.custom.functions) || []).forEach(function (fn) {
      if (fn.language !== "js") return;
      try { checkFunctionHeader(fn); } catch (e) { return; }
      var impl;
      try {
        impl = new Function("PRINT", "return function (" + (fn.params || "") + ") {\n" + fn.body + "\n};")(rt.PRINT);
      } catch (e) {
        impl = function () { err("Your custom JavaScript function " + fn.name + " has a mistake: " + e.message); };
      }
      rt.custom[fn.name] = function () {
        try { return impl.apply(null, arguments); }
        catch (e) {
          if (e instanceof RuntimeError) throw e;
          err("Error inside your custom function " + fn.name + ": " + (e && e.message ? e.message : e));
        }
      };
    });
    return rt;
  }

  // Turn a JS error into a student-friendly message
  function friendlyError(e, rt) {
    var line = rt && rt.line ? rt.line : null;
    var msg = e && e.message ? e.message : String(e);
    if (e instanceof RuntimeError) return { line: line, message: msg };
    var m;
    if ((m = msg.match(/^(\w+) is not defined/))) {
      var name = m[1].replace(/^v_/, "");
      var extra = BUILTIN_SET[name.toUpperCase()] && name !== name.toUpperCase()
        ? " Built-in functions are UPPERCASE: write " + name.toUpperCase() + "(...)."
        : " Did you forget to SET it first, or is the spelling/capitalisation different?";
      return { line: line, message: "'" + name + "' does not exist." + extra, code: "unknown-name", data: { name: name } };
    }
    if ((m = msg.match(/Cannot read propert(?:y|ies) of (undefined|null)(?: \(reading '(.*)'\))?/))) {
      return { line: line, message: "You tried to look inside something that is " + m[1] +
        (m[2] ? " (looking for '" + m[2] + "')" : "") + ". Check that the variable or list item has a value." };
    }
    if ((m = msg.match(/Cannot set propert(?:y|ies) of (undefined|null)/))) {
      return { line: line, message: "You tried to store a value inside something that is " + m[1] +
        ". Create it first, e.g. SET name = {} or SET name = []." };
    }
    if ((m = msg.match(/(.+) is not a function/))) {
      return { line: line, message: m[1].replace(/__rt\./g, "") + " is not a function. Check the name of the function you are calling." };
    }
    if (/Maximum call stack/.test(msg)) {
      return { line: line, message: "A FUNCTION keeps calling itself forever (no stopping condition)." };
    }
    return { line: line, message: msg };
  }

  /**
   * Transpile and run pseudo code.
   * Returns { ok, js, error: {line, message} | null }
   */
  function run(source, options) {
    options = options || {};
    var custom = options.custom || {};
    var library = libraryFor(source, custom).filter(function (fn) { return fn.language !== "js"; });

    // Errors on lines that belong to a custom pseudo function: explain where they are
    function place(err) {
      if (err.line && err.line > FN_LINE_BASE) {
        var fn = library[Math.floor(err.line / FN_LINE_BASE) - 1];
        var bodyLine = (err.line % FN_LINE_BASE) - 1;
        err.message = "In your custom function " + (fn ? fn.name : "?") +
          (bodyLine >= 1 ? " (body line " + bodyLine + ")" : "") + ": " + err.message;
        err.line = null;
        err.customFunction = fn ? fn.name : null;
      }
      return err;
    }

    var js;
    try {
      js = transpile(source, custom);
    } catch (e) {
      if (e instanceof PseudoError) {
        return { ok: false, js: null, error: place({ line: e.line, message: e.message, phase: "syntax", code: e.code, data: e.data }) };
      }
      return { ok: false, js: null, error: { line: null, message: "Translator problem: " + e.message, phase: "syntax" } };
    }
    var rt = createRuntime(options);
    try {
      new Function("__rt", js)(rt);
    } catch (e) {
      var fe = friendlyError(e, rt);
      fe.phase = "runtime";
      return { ok: false, js: js, error: place(fe) };
    }
    return { ok: true, js: js, error: null };
  }

  var api = {
    transpile: transpile,
    run: run,
    compileCommand: compileCommand,
    previewCommand: previewCommand,
    checkFunction: checkFunction,
    format: format,
    PseudoError: PseudoError,
    COMMANDS: COMMANDS,
    BUILTINS: BUILTINS,
    INDENT: INDENT
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else global.PseudoJS = api;
})(typeof window !== "undefined" ? window : this);
