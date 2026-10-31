/* Page logic: editor, running code, glossary, first-visit popup. */
(function () {
  "use strict";

  var STORAGE_CODE = "pseudo-runner:code";
  var STORAGE_RULES = "pseudo-runner:rules-seen-v1";
  var INDENT = "    ";

  var $ = function (id) { return document.getElementById(id); };
  var code = $("code"), highlight = $("highlight"), gutter = $("gutter"), errorBar = $("errorBar");
  var output = $("output"), jsOutput = $("jsOutput"), runInfo = $("runInfo");
  var errorLine = null;
  var STORAGE_CUSTOM = "pseudo-runner:custom-v1";
  var CUSTOM_WORDS = {}, CUSTOM_FNS = {};   // for highlighting the user's own commands

  function store(key, value) {
    try { if (value === undefined) return localStorage.getItem(key); localStorage.setItem(key, value); }
    catch (e) { return null; }
  }

  // ------------------------------------------------------------------ highlighting
  var KEYWORDS = {};
  ("SET PRINT IF THEN ELSE END ENDIF ENDFOR ENDWHILE ENDFUNCTION FOR EACH IN FROM TO STEP WHILE DO " +
   "REPEAT UNTIL ADD REMOVE SORT BY ASCENDING DESCENDING ASC DESC FUNCTION RETURN CALL BREAK CONTINUE " +
   "INPUT EXISTS AND OR NOT MOD").split(" ").forEach(function (k) { KEYWORDS[k] = true; });
  var CONSTS = { TRUE: 1, FALSE: 1, NULL: 1, NONE: 1, "null": 1, "true": 1, "false": 1 };
  var BUILTINS = {};
  window.PseudoJS.BUILTINS.forEach(function (b) { BUILTINS[b] = true; });

  var HL_RE = /(\/\/.*$)|("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)|(==|!=|<>|<=|>=|[+\-*\/%^=<>])/g;

  function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

  function highlightLine(line) {
    var html = "", last = 0, m;
    HL_RE.lastIndex = 0;
    while ((m = HL_RE.exec(line))) {
      html += esc(line.slice(last, m.index));
      var t = m[0], cls = null;
      if (m[1]) cls = "tk-com";
      else if (m[2]) cls = "tk-str";
      else if (m[3]) cls = "tk-num";
      else if (m[4]) {
        if (KEYWORDS[t] || CUSTOM_WORDS[t]) cls = "tk-kw";
        else if (CONSTS[t]) cls = "tk-const";
        else if ((BUILTINS[t] || CUSTOM_FNS[t]) && /^\s*\(/.test(line.slice(m.index + t.length))) cls = "tk-fn";
      } else if (m[5]) cls = "tk-op";
      html += cls ? '<span class="' + cls + '">' + esc(t) + "</span>" : esc(t);
      last = m.index + t.length;
      if (m[1]) break;
    }
    return html + esc(line.slice(last));
  }

  var lastLineCount = 0;
  function render() {
    var lines = code.value.split("\n");
    highlight.innerHTML = lines.map(highlightLine).join("\n") + "\n";
    if (lines.length !== lastLineCount) {
      var g = "";
      for (var i = 1; i <= lines.length; i++) g += "<div>" + i + "</div>";
      gutter.innerHTML = g;
      lastLineCount = lines.length;
    }
    markGutter();
    syncScroll();
  }

  function markGutter() {
    var cur = currentLine();
    var rows = gutter.children;
    for (var i = 0; i < rows.length; i++) {
      rows[i].className = (i + 1 === errorLine ? "error " : "") + (i + 1 === cur ? "current" : "");
    }
  }

  function syncScroll() {
    highlight.scrollTop = code.scrollTop;
    highlight.scrollLeft = code.scrollLeft;
    gutter.scrollTop = code.scrollTop;
    if (errorLine) {
      var lh = parseFloat(getComputedStyle(code).lineHeight) || 21;
      errorBar.style.top = (12 + (errorLine - 1) * lh - code.scrollTop) + "px";
    }
  }

  function setErrorLine(n) {
    errorLine = n || null;
    errorBar.classList.toggle("show", !!errorLine);
    markGutter();
    syncScroll();
  }

  // ------------------------------------------------------------------ editor helpers
  function currentLine() { return code.value.slice(0, code.selectionStart).split("\n").length; }

  function updateStatus() {
    var before = code.value.slice(0, code.selectionStart).split("\n");
    $("cursorPos").textContent = "Ln " + before.length + ", Col " + (before[before.length - 1].length + 1);
    markGutter();
  }

  // Insert text keeping the browser's undo history when possible
  function insertText(text) {
    code.focus();
    var ok = false;
    try { ok = document.execCommand("insertText", false, text); } catch (e) { ok = false; }
    if (!ok) {
      code.setRangeText(text, code.selectionStart, code.selectionEnd, "end");
      onChange();
    }
  }

  function selectLines() {
    var v = code.value;
    var start = v.lastIndexOf("\n", code.selectionStart - 1) + 1;
    var endIdx = code.selectionEnd;
    if (endIdx > code.selectionStart && v[endIdx - 1] === "\n") endIdx--;
    var end = v.indexOf("\n", endIdx);
    if (end < 0) end = v.length;
    return { start: start, end: end };
  }

  function indentSelection(outdent) {
    var r = selectLines();
    var block = code.value.slice(r.start, r.end);
    var changed = block.split("\n").map(function (l) {
      if (!outdent) return INDENT + l;
      return l.replace(/^ {1,4}/, "");
    }).join("\n");
    code.setSelectionRange(r.start, r.end);
    insertText(changed);
    code.setSelectionRange(r.start, r.start + changed.length);
  }

  var OPENS_BLOCK = /^(IF\b.*|ELSE\b.*|FOR\b.*|WHILE\b.*|REPEAT\b.*|FUNCTION\b.*)$/;

  code.addEventListener("keydown", function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") { e.preventDefault(); runCode(); return; }
    if ((e.ctrlKey || e.metaKey) && (e.key === "s" || e.key === "S")) { e.preventDefault(); toast("Your code is saved automatically in this browser."); return; }
    if (e.key === "Tab") {
      e.preventDefault();
      var multi = code.value.slice(code.selectionStart, code.selectionEnd).indexOf("\n") >= 0;
      if (e.shiftKey || multi) { indentSelection(e.shiftKey); return; }
      var col = code.selectionStart - (code.value.lastIndexOf("\n", code.selectionStart - 1) + 1);
      insertText(" ".repeat(4 - (col % 4)));
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      var v = code.value;
      var ls = v.lastIndexOf("\n", code.selectionStart - 1) + 1;
      var lineText = v.slice(ls, code.selectionStart);
      var indent = lineText.match(/^ */)[0];
      var trimmed = lineText.replace(/\/\/.*$/, "").trim();
      if (OPENS_BLOCK.test(trimmed) && !/^END/.test(trimmed)) indent += INDENT;
      insertText("\n" + indent);
      return;
    }
    if (e.key === "Backspace" && code.selectionStart === code.selectionEnd) {
      var p = code.selectionStart;
      var lineStart = code.value.lastIndexOf("\n", p - 1) + 1;
      var prefix = code.value.slice(lineStart, p);
      if (prefix.length && /^ +$/.test(prefix) && prefix.length % 4 === 0) {
        e.preventDefault();
        code.setSelectionRange(p - 4, p);
        insertText("");
      }
    }
  });

  code.addEventListener("paste", function (e) {
    var text = (e.clipboardData || window.clipboardData).getData("text");
    if (!text) return;
    var clean = text
      .replace(/\r\n?/g, "\n")
      .replace(/\t/g, INDENT)
      .replace(/ /g, " ")
      .replace(/[“”„″]/g, '"')
      .replace(/[‘’′]/g, "'");
    if (clean !== text) { e.preventDefault(); insertText(clean); toast("Pasted code was cleaned: tabs → 4 spaces, curly quotes → straight quotes."); }
  });

  var saveTimer = null;
  function onChange() {
    if (errorLine) setErrorLine(null);
    render();
    updateStatus();
    $("saveInfo").textContent = "Saving…";
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      store(STORAGE_CODE, code.value);
      $("saveInfo").textContent = "Saved in this browser";
    }, 400);
  }
  // Typing END / ELSE / UNTIL right after an indented line moves it back one level automatically
  code.addEventListener("input", function (e) {
    if (e.inputType === "insertText" && /[A-Z]/.test(e.data || "")) {
      var p = code.selectionStart, v = code.value;
      var ls = v.lastIndexOf("\n", p - 1) + 1;
      var le = v.indexOf("\n", p); if (le < 0) le = v.length;
      var line = v.slice(ls, le);
      var m = line.match(/^( +)(END|ELSE|UNTIL)$/);
      if (m && p === le && m[1].length >= 4) {
        var prev = v.slice(0, ls - 1).split("\n").reverse().filter(function (l) { return l.trim(); })[0] || "";
        var prevIndent = prev.match(/^ */)[0].length;
        var opener = /^\s*(IF|ELSE|FOR|WHILE|REPEAT|FUNCTION)\b/.test(prev);
        if (m[1].length >= prevIndent && !(opener && m[1].length > prevIndent)) {
          code.setSelectionRange(ls, ls + 4);
          insertText("");
          code.setSelectionRange(p - 4, p - 4);
        }
      }
    }
    onChange();
  });
  code.addEventListener("scroll", syncScroll);
  ["keyup", "click", "select"].forEach(function (ev) { code.addEventListener(ev, updateStatus); });

  function setCode(text) {
    code.value = text;
    code.scrollTop = 0;
    code.setSelectionRange(0, 0);
    onChange();
  }

  function goToLine(n) {
    var lines = code.value.split("\n");
    var pos = 0;
    for (var i = 0; i < n - 1 && i < lines.length; i++) pos += lines[i].length + 1;
    code.focus();
    code.setSelectionRange(pos, pos + (lines[n - 1] || "").length);
    var lh = parseFloat(getComputedStyle(code).lineHeight) || 21;
    code.scrollTop = Math.max(0, (n - 1) * lh - code.clientHeight / 3);
    updateStatus();
    syncScroll();
  }

  // ------------------------------------------------------------------ running
  function showTab(name) {
    document.querySelectorAll(".tabs .tab").forEach(function (t) {
      var on = t.getAttribute("data-tab") === name;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    $("tab-output").classList.toggle("hidden", name !== "output");
    $("tab-js").classList.toggle("hidden", name !== "js");
  }
  document.querySelectorAll(".tabs .tab").forEach(function (t) {
    t.addEventListener("click", function () { showTab(t.getAttribute("data-tab")); });
  });

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function runCode() {
    showTab("output");
    output.innerHTML = "";
    setErrorLine(null);
    var lines = [];
    var t0 = performance.now();
    var result = window.PseudoJS.run(code.value, {
      print: function (s) { lines.push(s); },
      input: function (msg) { return window.prompt(msg); },
      custom: custom
    });
    var ms = Math.round(performance.now() - t0);

    var frag = document.createDocumentFragment();
    lines.forEach(function (l) { frag.appendChild(el("div", "out-line", l)); });
    output.appendChild(frag);

    jsOutput.textContent = result.js || "// The code could not be translated. Fix the error shown in the Output tab first.";

    if (result.ok) {
      if (!lines.length) output.appendChild(el("div", "sys", "The program finished but did not PRINT anything."));
      var done = el("div", "sys");
      done.appendChild(el("span", "ok", "✔ Finished"));
      done.appendChild(document.createTextNode(" in " + ms + " ms"));
      output.appendChild(done);
      runInfo.textContent = "✔ ran OK";
      runInfo.className = "run-info ok";
    } else {
      var er = result.error;
      var box = el("div", "err-box");
      var title = er.phase === "syntax" ? "Your code could not be translated" : "Error while running";
      box.appendChild(el("div", "err-title", "✖ " + title + (er.line ? " (line " + er.line + ")" : "")));
      box.appendChild(el("div", "", er.message));
      if (er.line) {
        var src = code.value.split("\n")[er.line - 1];
        if (src !== undefined) {
          var ln = el("div", "err-line");
          ln.appendChild(document.createTextNode(er.line + " | "));
          ln.appendChild(el("code", "", src.replace(/\t/g, INDENT)));
          box.appendChild(ln);
        }
        setErrorLine(er.line);
      }
      var actions = el("div", "err-actions");
      if (er.line) {
        var go = el("button", "btn tiny", "Go to line " + er.line);
        go.addEventListener("click", function () { goToLine(er.line); });
        actions.appendChild(go);
      }
      if (er.code === "unknown-line" && er.data && er.data.text) {
        var teach = el("button", "btn tiny teach", "+ Teach this command");
        teach.addEventListener("click", function () { openCustom("command", null, guessPattern(er.data.text)); });
        actions.appendChild(teach);
      }
      if (er.code === "unknown-name" && er.data && er.data.name && er.line &&
          new RegExp("\\b" + er.data.name + "\\s*\\(").test(code.value.split("\n")[er.line - 1] || "")) {
        var mk = el("button", "btn tiny teach", "+ Create function " + er.data.name);
        mk.addEventListener("click", function () { openCustom("function", null, { name: er.data.name }); });
        actions.appendChild(mk);
      }
      if (actions.children.length) box.appendChild(actions);
      output.appendChild(box);
      runInfo.textContent = "✖ error" + (er.line ? " on line " + er.line : "");
      runInfo.className = "run-info err";
    }
    output.scrollTop = result.ok ? 0 : output.scrollHeight;
  }

  $("runBtn").addEventListener("click", runCode);
  $("clearOutputBtn").addEventListener("click", function () {
    output.innerHTML = '<div class="placeholder">Output cleared.</div>';
    runInfo.textContent = "";
    setErrorLine(null);
  });
  $("copyOutputBtn").addEventListener("click", function () {
    var text = Array.prototype.map.call(output.querySelectorAll(".out-line"), function (d) { return d.textContent; }).join("\n");
    if (!text) { toast("Nothing to copy yet."); return; }
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject())
      .then(function () { toast("Output copied."); }, function () { toast("Copy failed. Select the text and copy it manually."); });
  });
  $("clearCodeBtn").addEventListener("click", function () {
    if (code.value.trim() && !confirm("Clear the editor? Your current code will be removed.")) return;
    setCode("");
    code.focus();
  });

  // ------------------------------------------------------------------ examples
  var select = $("exampleSelect");
  (window.PSEUDO_EXAMPLES || []).forEach(function (ex) {
    var o = document.createElement("option");
    o.value = ex.id; o.textContent = ex.title;
    select.appendChild(o);
  });
  select.addEventListener("change", function () {
    var ex = (window.PSEUDO_EXAMPLES || []).filter(function (x) { return x.id === select.value; })[0];
    select.value = "";
    if (!ex) return;
    if (code.value.trim() && code.value !== ex.code && !confirm("Load the example \"" + ex.title + "\"? This replaces the code in the editor.")) return;
    setCode(ex.code);
    toast("Loaded: " + ex.title + ". Press Run!");
  });

  // ------------------------------------------------------------------ glossary
  var drawer = $("glossary"), scrim = $("scrim");
  function openGlossary() {
    drawer.classList.add("open"); scrim.classList.add("show");
    drawer.setAttribute("aria-hidden", "false");
    setTimeout(function () { $("glossarySearch").focus(); }, 50);
  }
  function closeGlossary() {
    drawer.classList.remove("open"); scrim.classList.remove("show");
    drawer.setAttribute("aria-hidden", "true");
  }
  $("glossaryBtn").addEventListener("click", function () { drawer.classList.contains("open") ? closeGlossary() : openGlossary(); });
  $("closeGlossaryBtn").addEventListener("click", closeGlossary);
  scrim.addEventListener("click", closeGlossary);

  function renderGlossary(filter) {
    var list = $("glossaryList");
    list.innerHTML = "";
    var q = (filter || "").trim().toLowerCase();
    var group = null, count = 0;
    (window.PSEUDO_GLOSSARY || []).forEach(function (g) {
      var hay = (g.group + " " + g.name + " " + g.syntax).toLowerCase();
      if (q && hay.indexOf(q) < 0) return;
      count++;
      if (g.group !== group) { group = g.group; list.appendChild(el("div", "g-group", group)); }
      var item = el("div", "g-item");
      item.appendChild(el("h3", "", g.name));
      item.appendChild(el("pre", "syntax", g.syntax));
      if (g.notes) item.appendChild(el("p", "", g.notes));
      var ex = el("pre");
      ex.innerHTML = g.example.split("\n").map(highlightLine).join("\n");
      item.appendChild(ex);
      var actions = el("div", "g-actions");
      var ins = el("button", "btn tiny", "Insert example");
      ins.addEventListener("click", function () {
        closeGlossary();
        var v = code.value, p = code.selectionStart;
        var ls = v.lastIndexOf("\n", p - 1) + 1;
        var indent = v.slice(ls, p).match(/^ */)[0];
        var atLineStart = /^ *$/.test(v.slice(ls, p));
        var text = g.example.split("\n").map(function (l, i) { return i === 0 ? l : (l ? indent + l : l); }).join("\n");
        insertText((atLineStart ? "" : "\n" + indent) + text + "\n" + indent);
      });
      var cp = el("button", "btn tiny ghost", "Copy");
      cp.addEventListener("click", function () {
        if (navigator.clipboard) navigator.clipboard.writeText(g.example).then(function () { toast("Example copied."); });
      });
      actions.appendChild(ins); actions.appendChild(cp);
      item.appendChild(actions);
      list.appendChild(item);
    });
    if (!count) list.appendChild(el("div", "g-empty", "No command matches \"" + filter + "\"."));
  }
  $("glossarySearch").addEventListener("input", function (e) { renderGlossary(e.target.value); renderMine(e.target.value); });
  renderGlossary("");

  function showGTab(name) {
    document.querySelectorAll(".dtab").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-gtab") === name); });
    $("builtinPanel").classList.toggle("hidden", name !== "builtin");
    $("minePanel").classList.toggle("hidden", name !== "mine");
  }
  document.querySelectorAll(".dtab").forEach(function (b) {
    b.addEventListener("click", function () { showGTab(b.getAttribute("data-gtab")); });
  });
  $("toMineLink").addEventListener("click", function (e) { e.preventDefault(); showGTab("mine"); });

  // ------------------------------------------------------------------ my commands (saved in this browser)
  var custom = loadCustom();

  function loadCustom() {
    try {
      var d = JSON.parse(store(STORAGE_CUSTOM) || "null");
      if (d && Array.isArray(d.commands) && Array.isArray(d.functions)) return d;
    } catch (e) { /* ignore broken data */ }
    return { commands: [], functions: [] };
  }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function refreshCustom() {
    CUSTOM_WORDS = {}; CUSTOM_FNS = {};
    custom.commands.forEach(function (c) {
      (c.pattern.replace(/\{[^}]*\}/g, " ").match(/\b[A-Z][A-Z0-9_]+\b/g) || []).forEach(function (w) { CUSTOM_WORDS[w] = true; });
    });
    custom.functions.forEach(function (f) { CUSTOM_FNS[f.name] = true; });
    $("myCount").textContent = custom.commands.length + custom.functions.length;
    renderMine($("glossarySearch").value);
    render();
  }
  function saveCustom() {
    store(STORAGE_CUSTOM, JSON.stringify(custom));
    refreshCustom();
  }

  function codeBlock(text) {
    var pre = el("pre");
    pre.innerHTML = text.split("\n").map(highlightLine).join("\n");
    return pre;
  }

  function renderMine(filter) {
    var list = $("myList");
    list.innerHTML = "";
    var q = (filter || "").trim().toLowerCase();
    if (!custom.commands.length && !custom.functions.length) {
      var empty = el("div", "mine-empty");
      empty.innerHTML = "You haven't added any commands yet.<br><br>Example: teach <code>INCREASE {x} BY {n}</code> " +
        "to mean <code>SET {x} = {x} + ({n})</code>. Then you can write <code>INCREASE score BY 5</code> in your code.<br><br>";
      var ex = el("button", "btn tiny", "Add this example");
      ex.addEventListener("click", function () {
        openCustom("command", null, { pattern: "INCREASE {x} BY {n}", replacement: "SET {x} = {x} + ({n})",
          description: "Adds a number to a variable", tryLine: "INCREASE score BY 5" });
      });
      empty.appendChild(ex);
      list.appendChild(empty);
      return;
    }
    var shown = 0;
    custom.commands.forEach(function (c) {
      if (q && (c.pattern + " " + c.replacement + " " + (c.description || "")).toLowerCase().indexOf(q) < 0) return;
      shown++;
      var item = el("div", "g-item");
      var h = el("h3", "mono", c.pattern);
      h.appendChild(el("span", "badge", c.anywhere ? "phrase" : "command"));
      item.appendChild(h);
      if (c.description) item.appendChild(el("p", "", c.description));
      item.appendChild(el("div", "means", "means:"));
      item.appendChild(codeBlock(c.replacement));
      item.appendChild(itemActions(
        function () { openCustom("command", c); },
        function () { insertSnippet(c.pattern); },
        function () { removeCustom("commands", c, c.pattern); }));
      list.appendChild(item);
    });
    custom.functions.forEach(function (f) {
      if (q && (f.name + " " + f.body + " " + (f.description || "")).toLowerCase().indexOf(q) < 0) return;
      shown++;
      var item = el("div", "g-item");
      var h = el("h3", "mono", f.name + "(" + (f.params || "") + ")");
      h.appendChild(el("span", "badge", f.language === "js" ? "function · JS" : "function"));
      item.appendChild(h);
      if (f.description) item.appendChild(el("p", "", f.description));
      var body = el("pre");
      body.textContent = f.body;
      if (f.language !== "js") body.innerHTML = f.body.split("\n").map(highlightLine).join("\n");
      item.appendChild(body);
      item.appendChild(itemActions(
        function () { openCustom("function", f); },
        function () { insertSnippet(f.name + "(" + (f.params || "") + ")"); },
        function () { removeCustom("functions", f, f.name); }));
      list.appendChild(item);
    });
    if (!shown) list.appendChild(el("div", "g-empty", "None of your commands match \"" + filter + "\"."));
  }

  function itemActions(onEdit, onInsert, onDelete) {
    var a = el("div", "g-actions");
    var e = el("button", "btn tiny", "Edit"); e.addEventListener("click", onEdit);
    var i = el("button", "btn tiny ghost", "Insert"); i.addEventListener("click", onInsert);
    var d = el("button", "btn tiny ghost danger", "Delete"); d.addEventListener("click", onDelete);
    a.appendChild(e); a.appendChild(i); a.appendChild(d);
    return a;
  }

  function insertSnippet(text) {
    closeGlossary();
    var v = code.value, p = code.selectionStart;
    var ls = v.lastIndexOf("\n", p - 1) + 1;
    insertText(/^ *$/.test(v.slice(ls, p)) ? text : " " + text);
  }

  function removeCustom(listName, item, label) {
    if (!confirm("Delete \"" + label + "\"? Code that uses it will stop working.")) return false;
    custom[listName] = custom[listName].filter(function (x) { return x !== item; });
    saveCustom();
    toast("Deleted \"" + label + "\".");
    return true;
  }

  // Guess a pattern from an unknown line: UPPERCASE words stay, everything else becomes {a}, {b}, ...
  function guessPattern(text) {
    var t = text.trim(), colon = /:$/.test(t);
    if (colon) t = t.slice(0, -1).trim();
    var strings = [];
    var masked = t.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, function (str) { strings.push(str); return "\u0001"; });
    var out = [], inHole = false, k = 0;
    masked.split(/\s+/).forEach(function (w) {
      if (/^[A-Z][A-Z0-9_]+$/.test(w)) { out.push(w); inHole = false; }
      else if (!inHole) { out.push("{" + "abcdefgh".charAt(k++) + "}"); inHole = true; }
    });
    return { pattern: out.join(" ") + (colon ? ":" : ""), replacement: "", tryLine: text.trim() };
  }

  // ---- editor dialog
  var cModal = $("customModal"), editing = null, editKind = "command";

  function setKind(kind) {
    editKind = kind;
    document.querySelectorAll(".seg-btn").forEach(function (b) { b.classList.toggle("active", b.getAttribute("data-kind") === kind); });
    $("commandForm").classList.toggle("hidden", kind !== "command");
    $("functionForm").classList.toggle("hidden", kind !== "function");
    $("customTitle").textContent = editing
      ? (kind === "command" ? "Edit command" : "Edit function")
      : (kind === "command" ? "Teach a new command" : "Create a new function");
    $("customError").textContent = "";
    updatePreviews();
  }
  document.querySelectorAll(".seg-btn").forEach(function (b) {
    b.addEventListener("click", function () { if (!editing) setKind(b.getAttribute("data-kind")); });
  });

  function fnLang() { return document.querySelector('input[name="fnLang"]:checked').value; }

  function openCustom(kind, item, prefill) {
    editing = item || null;
    var d = item || prefill || {};
    if (kind === "command") {
      $("cmdPattern").value = d.pattern || "";
      $("cmdMeaning").value = d.replacement || "";
      $("cmdAnywhere").checked = !!d.anywhere;
      $("cmdDesc").value = d.description || "";
      $("cmdTry").value = d.tryLine || (item ? "" : "");
    } else {
      $("fnName").value = d.name || "";
      $("fnParams").value = d.params || "";
      $("fnBody").value = d.body || "";
      $("fnDesc").value = d.description || "";
      document.querySelector('input[name="fnLang"][value="' + (d.language === "js" ? "js" : "pseudo") + '"]').checked = true;
    }
    document.querySelectorAll(".seg-btn").forEach(function (b) { b.disabled = !!editing && b.getAttribute("data-kind") !== kind; });
    $("deleteCustomBtn").hidden = !editing;
    setKind(kind);
    cModal.hidden = false;
    setTimeout(function () {
      var f = kind === "command" ? (d.pattern ? $("cmdMeaning") : $("cmdPattern")) : (d.name ? $("fnBody") : $("fnName"));
      f.focus();
    }, 30);
  }
  function closeCustom() { cModal.hidden = true; editing = null; }

  function readCmd() {
    return {
      pattern: $("cmdPattern").value.trim(),
      replacement: $("cmdMeaning").value.replace(/\t/g, INDENT).replace(/\s+$/, ""),
      anywhere: $("cmdAnywhere").checked,
      description: $("cmdDesc").value.trim()
    };
  }
  function readFn() {
    return {
      name: $("fnName").value.trim(),
      params: $("fnParams").value.trim(),
      language: fnLang(),
      body: $("fnBody").value.replace(/\t/g, INDENT).replace(/\s+$/, ""),
      description: $("fnDesc").value.trim()
    };
  }

  function updatePreviews() {
    if (editKind === "command") {
      var pv = $("cmdPreview"), cmd = readCmd();
      pv.innerHTML = "";
      if (!cmd.pattern || !cmd.replacement.trim()) {
        if (cmd.pattern) pv.appendChild(el("span", "pv-label", "Now write what it means in the box above."));
        return;
      }
      try { window.PseudoJS.compileCommand(cmd); }
      catch (e) { pv.appendChild(el("span", "pv-bad", "⚠ " + e.message)); return; }
      var sample = $("cmdTry").value;
      if (!sample.trim()) { pv.appendChild(el("span", "pv-label", "Type a line in the Try it box to see what it turns into.")); return; }
      try {
        var r = window.PseudoJS.previewCommand(cmd, sample);
        if (!r.matched) { pv.appendChild(el("span", "pv-bad", "This line does not match the pattern yet.")); return; }
        pv.appendChild(el("span", "pv-label", "The runner will read it as:"));
        var c = el("span");
        c.innerHTML = r.text.split("\n").map(highlightLine).join("\n");
        pv.appendChild(c);
      } catch (e2) { pv.appendChild(el("span", "pv-bad", "⚠ " + e2.message)); }
    } else {
      var lang = fnLang();
      $("fnHelp").innerHTML = lang === "js"
        ? "The inside of a JavaScript function. Use <code>return</code> to give back a value; <code>PRINT(x)</code> prints. " +
          "Example: <code>return String(text).split(\"\").reverse().join(\"\");</code>"
        : "The lines inside the function (without FUNCTION / END FUNCTION), using the normal commands. " +
          "Use <code>RETURN</code> to give back a value. Example: <code>RETURN text + text</code>";
      $("fnBody").placeholder = lang === "js" ? 'return String(text).split("").reverse().join("");' : "SET result = text + text\nRETURN result";
      var fv = $("fnPreview"), fn = readFn();
      fv.innerHTML = "";
      if (!fn.name || !fn.body.trim()) return;
      var msg = window.PseudoJS.checkFunction(fn);
      if (msg) fv.appendChild(el("span", "pv-bad", "⚠ " + msg));
      else fv.appendChild(el("span", "pv-good", "✔ Looks good. Use it like: " + fn.name + "(" + (fn.params || "") + ")"));
    }
  }
  ["cmdPattern", "cmdMeaning", "cmdTry", "cmdAnywhere", "fnName", "fnParams", "fnBody"].forEach(function (id) {
    $(id).addEventListener("input", function () { $("customError").textContent = ""; updatePreviews(); });
  });
  document.querySelectorAll('input[name="fnLang"]').forEach(function (r) { r.addEventListener("change", updatePreviews); });

  // Tab inserts 4 spaces in the dialog's text boxes too
  ["cmdMeaning", "fnBody"].forEach(function (id) {
    $(id).addEventListener("keydown", function (e) {
      if (e.key !== "Tab") return;
      e.preventDefault();
      var ta = e.target, ok = false;
      try { ok = document.execCommand("insertText", false, INDENT); } catch (x) { ok = false; }
      if (!ok) ta.setRangeText(INDENT, ta.selectionStart, ta.selectionEnd, "end");
      updatePreviews();
    });
  });
  ["commandForm", "functionForm"].forEach(function (id) {
    $(id).addEventListener("submit", function (e) { e.preventDefault(); saveCustomItem(); });
  });

  function saveCustomItem() {
    var errBox = $("customError");
    var label;
    if (editKind === "command") {
      var cmd = readCmd(), compiled;
      try { compiled = window.PseudoJS.compileCommand(cmd); } catch (e) { errBox.textContent = e.message; return; }
      var dup = custom.commands.filter(function (c) { return c !== editing && c.pattern.replace(/\s+/g, " ") === compiled.pattern.replace(/\s+/g, " "); })[0];
      if (dup) { errBox.textContent = "You already have a command with this pattern. Edit that one instead."; return; }
      if (editing) { editing.pattern = cmd.pattern; editing.replacement = cmd.replacement; editing.anywhere = cmd.anywhere; editing.description = cmd.description; }
      else custom.commands.push({ id: uid(), pattern: cmd.pattern, replacement: cmd.replacement, anywhere: cmd.anywhere, description: cmd.description });
      label = cmd.pattern;
    } else {
      var fn = readFn();
      var msg = window.PseudoJS.checkFunction(fn);
      if (msg) { errBox.textContent = msg; return; }
      var dupF = custom.functions.filter(function (f) { return f !== editing && f.name === fn.name; })[0];
      if (dupF) { errBox.textContent = "You already have a function called " + fn.name + "."; return; }
      if (editing) { for (var k in fn) editing[k] = fn[k]; }
      else { fn.id = uid(); custom.functions.push(fn); }
      label = fn.name;
    }
    saveCustom();
    closeCustom();
    toast("Saved \"" + label + "\". You can use it in your code now.");
  }

  $("saveCustomBtn").addEventListener("click", saveCustomItem);
  $("cancelCustomBtn").addEventListener("click", closeCustom);
  $("deleteCustomBtn").addEventListener("click", function () {
    if (!editing) return;
    var isCmd = editKind === "command";
    if (removeCustom(isCmd ? "commands" : "functions", editing, isCmd ? editing.pattern : editing.name)) closeCustom();
  });
  cModal.addEventListener("click", function (e) { if (e.target === cModal) closeCustom(); });
  $("addCommandBtn").addEventListener("click", function () { openCustom("command"); });
  $("addFunctionBtn").addEventListener("click", function () { openCustom("function"); });

  // ---- export / import (e.g. a teacher shares a file with the class)
  $("exportBtn").addEventListener("click", function () {
    if (!custom.commands.length && !custom.functions.length) { toast("You have no commands to export yet."); return; }
    var data = { format: "pseudo-runner-commands", version: 1, commands: custom.commands, functions: custom.functions };
    var blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "my-pseudo-commands.json";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  });
  $("importBtn").addEventListener("click", function () { $("importFile").click(); });
  $("importFile").addEventListener("change", function (e) {
    var file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var data;
      try { data = JSON.parse(reader.result); } catch (x) { toast("That file is not a commands file."); return; }
      var added = 0, skipped = 0;
      (Array.isArray(data.commands) ? data.commands : []).forEach(function (c) {
        try {
          var cc = { pattern: String(c.pattern || "").trim(), replacement: String(c.replacement || ""), anywhere: !!c.anywhere, description: String(c.description || "") };
          window.PseudoJS.compileCommand(cc);
          custom.commands = custom.commands.filter(function (x) { return x.pattern !== cc.pattern; });
          cc.id = uid(); custom.commands.push(cc); added++;
        } catch (x) { skipped++; }
      });
      (Array.isArray(data.functions) ? data.functions : []).forEach(function (f) {
        var ff = { name: String(f.name || "").trim(), params: String(f.params || ""), language: f.language === "js" ? "js" : "pseudo",
          body: String(f.body || ""), description: String(f.description || "") };
        if (window.PseudoJS.checkFunction(ff)) { skipped++; return; }
        custom.functions = custom.functions.filter(function (x) { return x.name !== ff.name; });
        ff.id = uid(); custom.functions.push(ff); added++;
      });
      saveCustom();
      toast("Imported " + added + " item(s)" + (skipped ? ", skipped " + skipped + " that had mistakes" : "") + ".");
    };
    reader.readAsText(file);
  });

  refreshCustom();

  // ------------------------------------------------------------------ rules popup
  var modal = $("rulesModal");
  function openRules() { modal.hidden = false; setTimeout(function () { $("closeRulesBtn").focus(); }, 30); }
  function closeRules() { modal.hidden = true; store(STORAGE_RULES, "1"); code.focus(); }
  $("rulesBtn").addEventListener("click", openRules);
  $("closeRulesBtn").addEventListener("click", closeRules);
  $("openGlossaryFromModal").addEventListener("click", function () { closeRules(); openGlossary(); });
  modal.addEventListener("click", function (e) { if (e.target === modal) closeRules(); });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      if (!cModal.hidden) closeCustom();
      else if (!modal.hidden) closeRules();
      else if (drawer.classList.contains("open")) closeGlossary();
    }
  });

  // ------------------------------------------------------------------ toast
  var toastTimer = null;
  function toast(msg) {
    var t = $("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 2600);
  }

  // ------------------------------------------------------------------ start
  var saved = store(STORAGE_CODE);
  var first = (window.PSEUDO_EXAMPLES || [])[0];
  setCode(saved !== null && saved !== undefined ? saved : (first ? first.code : ""));
  if (!store(STORAGE_RULES)) openRules();
})();
