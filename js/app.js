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
        if (KEYWORDS[t]) cls = "tk-kw";
        else if (CONSTS[t]) cls = "tk-const";
        else if (BUILTINS[t] && /^\s*\(/.test(line.slice(m.index + t.length))) cls = "tk-fn";
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
      input: function (msg) { return window.prompt(msg); }
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
        var go = el("button", "btn tiny", "Go to line " + er.line);
        go.addEventListener("click", function () { goToLine(er.line); });
        box.appendChild(go);
        setErrorLine(er.line);
      }
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
  $("glossarySearch").addEventListener("input", function (e) { renderGlossary(e.target.value); });
  renderGlossary("");

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
      if (!modal.hidden) closeRules();
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
