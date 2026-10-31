// Run with:  node tests/run-tests.js
global.window = {};
const P = require("../js/transpiler.js");
require("../js/examples.js");
require("../js/glossary.js");
let failed = 0;
function check(name, src, expectOut, expectErr) {
  const out = [];
  const r = P.run(src, { print: (l) => out.push(l), input: () => "5" });
  const ok = expectErr
    ? !r.ok && expectErr.test(r.error.message)
    : r.ok && (expectOut === undefined || out.join("\n") === expectOut);
  if (!ok) { failed++; console.log("FAIL", name, r.error, out.join("\n")); }
  else console.log("ok  ", name);
}
// examples must run
window.PSEUDO_EXAMPLES.forEach((ex) => check("example: " + ex.id, ex.code));
// glossary examples must run (with a few variables pre-defined)
const prelude = 'SET price = 2\nSET qty = 3\nSET score = 60\nSET age = 15\nSET temperature = 31\nSET mark = 70\n' +
  'SET products = ["Mouse"]\nSET numbers = [1, -1]\nSET fruits = ["a", "b"]\nSET scores = [3, 1]\nSET name = "x"\n' +
  'SET productList = [["a", 1], ["b", 2]]\nSET cart = ["Laptop"]\nSET total = 1\n';
window.PSEUDO_GLOSSARY.forEach((g) => check("glossary: " + g.name, prelude + g.example));

const ec = window.PSEUDO_EXAMPLES.find((e) => e.id === "ecommerce").code;
const out = []; P.run(ec, { print: (l) => out.push(l) });
const text = out.join("\n");
["Laptop: 17 units", "1. Laptop: 17 units", "3. Keyboard: 8 units", "Order ID 1003 appears 2 times", "This represents 34.0% of total sales"]
  .forEach((s) => { if (!text.includes(s)) { failed++; console.log("FAIL ecommerce missing:", s); } });

check("else if", 'SET s = 75\nIF s >= 80 THEN\n    PRINT "A"\nELSE IF s >= 70 THEN\n    PRINT "B"\nELSE\n    PRINT "C"\nEND IF', "B");
check("step down", "FOR i FROM 5 TO 1 STEP -2:\n    PRINT i\nEND FOR", "5\n3\n1");
check("curly quotes", "PRINT “hi”", "hi");
check("lowercase cmd", 'print "hi"', undefined, /UPPERCASE/);
check("missing SET", "x = 5", undefined, /SET/);
check("bad indent", 'IF TRUE THEN\nPRINT 1\nEND IF', undefined, /indentation/);
check("missing END", 'IF TRUE THEN\n    PRINT 1', undefined, /never closed/);
check("wrong END", 'IF TRUE THEN\n    PRINT 1\nEND FOR', undefined, /Expected END IF/);
check("infinite loop", 'SET x = 0\nWHILE x < 1 DO\n    SET y = 1\nEND WHILE', undefined, /infinite loop/);
check("undefined var", 'PRINT total', undefined, /does not exist/);
// custom commands & functions
function checkC(name, src, custom, expectOut, expectErr) {
  const out = [];
  const r = P.run(src, { print: (l) => out.push(l), custom });
  const ok = expectErr ? !r.ok && expectErr.test(r.error.message) : r.ok && out.join("\n") === expectOut;
  if (!ok) { failed++; console.log("FAIL", name, r.error, out.join("\n")); } else console.log("ok  ", name);
}
const custom = {
  commands: [
    { pattern: "INCREASE {x} BY {n}", replacement: "SET {x} = {x} + ({n})" },
    { pattern: "{a} IS GREATER THAN {b}", replacement: "{a} > {b}", anywhere: true },
    { pattern: "LOOP {n} TIMES:", replacement: "FOR i{#} FROM 1 TO {n}:" },
    { pattern: "END LOOP", replacement: "END FOR" },
    { pattern: "SWAP {a} AND {b}", replacement: "SET t{#} = {a}\nSET {a} = {b}\nSET {b} = t{#}" },
  ],
  functions: [
    { name: "SHOUT", params: "t", language: "js", body: "return String(t).toUpperCase();" },
    { name: "DOUBLE", params: "n", language: "pseudo", body: "RETURN n * 2" },
  ],
};
checkC("custom line command", "SET a = 1\nINCREASE a BY 2 + 3\nPRINT a", custom, "6");
checkC("custom phrase", 'IF 5 IS GREATER THAN 2 THEN\n    PRINT "IS GREATER THAN"\nEND IF', custom, "IS GREATER THAN");
checkC("custom block (nested)", "LOOP 2 TIMES:\n    LOOP 2 TIMES\n        PRINT 1\n    END LOOP\nEND LOOP", custom, "1\n1\n1\n1");
checkC("custom multi-line", "SET a = 1\nSET b = 2\nSWAP a AND b\nPRINT a, b", custom, "2 1");
checkC("custom functions", 'PRINT SHOUT("hi"), DOUBLE(4)', custom, "HI 8");
checkC("without custom", "INCREASE a BY 1", {}, undefined, /don't understand/);
checkC("bad custom fn", "PRINT BROKEN(1)", { functions: [{ name: "BROKEN", params: "n", body: "RETURN nope" }] }, undefined, /custom function BROKEN/);
if (P.checkFunction({ name: "LENGTH", params: "", body: "RETURN 1" }) === null) { failed++; console.log("FAIL built-in name clash"); }

console.log(failed ? `\n${failed} test(s) FAILED` : "\nAll tests passed");
process.exit(failed ? 1 : 0);
