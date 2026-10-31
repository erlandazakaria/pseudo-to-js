/* Glossary entries shown in the side panel.
 * Each entry: { group, name, syntax, example, notes }
 * Add new commands here when the translator learns them. */
window.PSEUDO_GLOSSARY = [
  // ---------------------------------------------------------------- Basics
  {
    group: "Basics",
    name: "Comment",
    syntax: "// your note",
    example: "// This line is ignored\nSET x = 5  // a note at the end of a line",
    notes: "Anything after // is ignored by the computer."
  },
  {
    group: "Basics",
    name: "SET (create / change a variable)",
    syntax: "SET name = value",
    example: "SET score = 10\nSET score = score + 5\nSET city = \"Jakarta\"",
    notes: "Always start with SET. Names use letters, numbers and _ (no spaces) and are case-sensitive: score and Score are different."
  },
  {
    group: "Basics",
    name: "PRINT (show output)",
    syntax: "PRINT value\nPRINT value1, value2",
    example: "PRINT \"Hello\"\nPRINT \"Total: \" + total\nPRINT \"a\", \"b\"   // prints: a b\nPRINT \"\"          // empty line",
    notes: "Use + to join text and values. Commas print values separated by a space."
  },
  {
    group: "Basics",
    name: "INPUT (ask the user)",
    syntax: "INPUT name",
    example: "INPUT age\nPRINT \"Next year you will be \" + (age + 1)",
    notes: "Opens a box asking for a value. Numbers are converted automatically."
  },
  // ---------------------------------------------------------------- Values
  {
    group: "Values",
    name: "Text, numbers, TRUE / FALSE, null",
    syntax: "\"text\"   42   3.14   TRUE   FALSE   null",
    example: "SET name = \"Budi\"\nSET price = 19.99\nSET isMember = TRUE\nSET winner = null",
    notes: "Text must be inside quotes \" \". null means \"no value yet\"."
  },
  {
    group: "Values",
    name: "List (array)",
    syntax: "[item1, item2, ...]\nlist[index]",
    example: "SET fruits = [\"apple\", \"mango\"]\nPRINT fruits[0]   // apple (counting starts at 0)\nSET fruits[1] = \"kiwi\"",
    notes: "A long list can continue over several lines as long as the [ ] are closed."
  },
  {
    group: "Values",
    name: "Dictionary (key → value)",
    syntax: "{}\n{\"key\": value}\ndict[key]",
    example: "SET stock = {}\nSET stock[\"apple\"] = 5\nPRINT stock[\"apple\"]   // 5",
    notes: "FOR EACH key IN dict goes through the keys."
  },
  // ---------------------------------------------------------------- Operators
  {
    group: "Operators",
    name: "Maths",
    syntax: "+   -   *   /   MOD   ^",
    example: "SET total = price * qty\nSET rest = 10 MOD 3   // 1\nSET sq = 4 ^ 2       // 16",
    notes: "+ also joins text: \"Hi \" + name. Use ( ) to control the order."
  },
  {
    group: "Operators",
    name: "Compare",
    syntax: "==   !=   <   >   <=   >=",
    example: "IF score >= 50 THEN\n    PRINT \"Pass\"\nEND IF",
    notes: "== means \"is equal to\" (a single = is also accepted inside conditions). != (or <>) means \"not equal\"."
  },
  {
    group: "Operators",
    name: "AND / OR / NOT",
    syntax: "condition AND condition\ncondition OR condition\nNOT condition",
    example: "IF age >= 13 AND age <= 19 THEN\n    PRINT \"Teenager\"\nEND IF",
    notes: "Write them in UPPERCASE."
  },
  {
    group: "Operators",
    name: "EXISTS IN",
    syntax: "value EXISTS IN list_or_dictionary",
    example: "IF \"Mouse\" EXISTS IN products THEN\n    PRINT \"Found it\"\nEND IF",
    notes: "For a list it checks the items, for a dictionary it checks the keys, for text it checks the letters."
  },
  // ---------------------------------------------------------------- Decisions
  {
    group: "Decisions",
    name: "IF ... THEN ... END IF",
    syntax: "IF condition THEN\n    ...\nEND IF",
    example: "IF temperature > 30 THEN\n    PRINT \"Hot!\"\nEND IF",
    notes: "Lines inside the IF are indented 4 spaces. Always finish with END IF."
  },
  {
    group: "Decisions",
    name: "ELSE IF / ELSE",
    syntax: "IF condition THEN\n    ...\nELSE IF condition THEN\n    ...\nELSE\n    ...\nEND IF",
    example: "IF mark >= 80 THEN\n    PRINT \"A\"\nELSE IF mark >= 65 THEN\n    PRINT \"B\"\nELSE\n    PRINT \"C\"\nEND IF",
    notes: "ELSE and ELSE IF line up with their IF (same indentation)."
  },
  // ---------------------------------------------------------------- Loops
  {
    group: "Loops",
    name: "FOR ... FROM ... TO",
    syntax: "FOR i FROM start TO end:\n    ...\nEND FOR",
    example: "FOR i FROM 1 TO 5:\n    PRINT i\nEND FOR\n\nFOR i FROM 10 TO 0 STEP -2:\n    PRINT i\nEND FOR",
    notes: "Counts from start to end (both included). Add STEP to count in other steps."
  },
  {
    group: "Loops",
    name: "FOR EACH ... IN",
    syntax: "FOR EACH item IN collection:\n    ...\nEND FOR",
    example: "FOR EACH fruit IN fruits:\n    PRINT fruit\nEND FOR",
    notes: "Goes through every item of a list (or every key of a dictionary)."
  },
  {
    group: "Loops",
    name: "WHILE ... DO",
    syntax: "WHILE condition DO\n    ...\nEND WHILE",
    example: "SET n = 3\nWHILE n > 0 DO\n    PRINT n\n    SET n = n - 1\nEND WHILE",
    notes: "Repeats while the condition is TRUE. Make sure it eventually becomes FALSE!"
  },
  {
    group: "Loops",
    name: "REPEAT ... UNTIL",
    syntax: "REPEAT\n    ...\nUNTIL condition",
    example: "SET n = 0\nREPEAT\n    SET n = n + 1\nUNTIL n == 3\nPRINT n   // 3",
    notes: "Runs at least once, stops when the condition becomes TRUE."
  },
  {
    group: "Loops",
    name: "BREAK / CONTINUE",
    syntax: "BREAK\nCONTINUE",
    example: "FOR EACH n IN numbers:\n    IF n < 0 THEN\n        BREAK\n    END IF\n    PRINT n\nEND FOR",
    notes: "BREAK leaves the loop. CONTINUE skips to the next round."
  },
  // ---------------------------------------------------------------- Lists
  {
    group: "List commands",
    name: "ADD ... TO",
    syntax: "ADD value TO list",
    example: "SET cart = []\nADD \"Laptop\" TO cart\nADD [\"Mouse\", 2] TO cart",
    notes: "Puts the value at the end of the list."
  },
  {
    group: "List commands",
    name: "REMOVE ... FROM",
    syntax: "REMOVE value FROM list\nREMOVE key FROM dictionary",
    example: "REMOVE \"Laptop\" FROM cart",
    notes: "Removes the first matching item (or the key from a dictionary)."
  },
  {
    group: "List commands",
    name: "SORT",
    syntax: "SORT list\nSORT list DESCENDING\nSORT list BY field DESCENDING",
    example: "SORT scores DESCENDING\n\n// list of [name, count] pairs:\nSORT productList BY count DESCENDING",
    notes: "Default is ASCENDING (small → big). For a list of [name, value] pairs, BY sorts by the value (BY name sorts by the name). For dictionaries in a list, BY uses that key."
  },
  // ---------------------------------------------------------------- Functions
  {
    group: "Functions",
    name: "FUNCTION ... RETURN ... END FUNCTION",
    syntax: "FUNCTION name(param1, param2)\n    ...\n    RETURN value\nEND FUNCTION",
    example: "FUNCTION area(w, h)\n    RETURN w * h\nEND FUNCTION\n\nPRINT area(3, 4)   // 12",
    notes: "Write FUNCTION at the start of a line (no indentation). It can be used before or after it is written."
  },
  {
    group: "Functions",
    name: "CALL",
    syntax: "CALL name(arguments)",
    example: "FUNCTION greet(who)\n    PRINT \"Hi \" + who\nEND FUNCTION\n\nCALL greet(\"Sari\")",
    notes: "Runs a function when you don't need its result. greet(\"Sari\") without CALL also works."
  },
  // ---------------------------------------------------------------- Built-ins
  {
    group: "Built-in functions",
    name: "LENGTH(x)",
    syntax: "LENGTH(list_text_or_dictionary)",
    example: "PRINT LENGTH([4, 5, 6])   // 3\nPRINT LENGTH(\"hello\")     // 5",
    notes: "Number of items, letters, or keys."
  },
  {
    group: "Built-in functions",
    name: "ROUND / FLOOR / CEIL / ABS / SQRT / POWER",
    syntax: "ROUND(x, decimals)  FLOOR(x)  CEIL(x)  ABS(x)  SQRT(x)  POWER(x, y)",
    example: "PRINT ROUND(36.456, 1)   // 36.5\nPRINT ROUND(2.6)         // 3\nPRINT FLOOR(2.9)         // 2\nPRINT SQRT(16)           // 4",
    notes: "ROUND with decimals always shows that many decimals (e.g. 36.0)."
  },
  {
    group: "Built-in functions",
    name: "MIN / MAX / SUM / AVERAGE",
    syntax: "MIN(list)  MAX(list)  SUM(list)  AVERAGE(list)",
    example: "SET s = [4, 9, 2]\nPRINT MAX(s)       // 9\nPRINT SUM(s)       // 15\nPRINT MIN(3, 8)    // 3",
    notes: "MIN and MAX also accept separate numbers."
  },
  {
    group: "Built-in functions",
    name: "RANDOM(min, max)",
    syntax: "RANDOM(min, max)",
    example: "SET dice = RANDOM(1, 6)",
    notes: "A random whole number between min and max (both included)."
  },
  {
    group: "Built-in functions",
    name: "Text: UPPER / LOWER / TRIM / SUBSTRING / SPLIT / JOIN",
    syntax: "UPPER(t)  LOWER(t)  TRIM(t)  SUBSTRING(t, start, end)  SPLIT(t, sep)  JOIN(list, sep)",
    example: "PRINT UPPER(\"hi\")                  // HI\nPRINT SUBSTRING(\"Laptop\", 0, 3)     // Lap\nSET words = SPLIT(\"a b c\", \" \")\nPRINT JOIN(words, \"-\")             // a-b-c",
    notes: "Positions start at 0. SUBSTRING stops before the end position."
  },
  {
    group: "Built-in functions",
    name: "STR / NUM / INT / TYPE",
    syntax: "STR(x)  NUM(text)  INT(x)  TYPE(x)",
    example: "SET n = NUM(\"42\") + 1   // 43\nPRINT INT(7.9)          // 7\nPRINT TYPE([1, 2])      // list",
    notes: "Convert between text and numbers."
  },
  {
    group: "Built-in functions",
    name: "KEYS / VALUES / CONTAINS / INDEX_OF",
    syntax: "KEYS(dict)  VALUES(dict)  CONTAINS(collection, x)  INDEX_OF(list, x)",
    example: "SET d = {\"a\": 1, \"b\": 2}\nPRINT KEYS(d)                  // [\"a\", \"b\"]\nPRINT INDEX_OF([5, 7, 9], 7)   // 1",
    notes: "INDEX_OF gives -1 when the item is not found."
  }
];
