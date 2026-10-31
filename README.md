# Pseudo Code Runner

A small online editor where students paste their pseudo code, press **Run**, and see the result.
The pseudo code is translated into JavaScript and runs in the browser. There is no server and no build step.

## Features
- Code editor with line numbers, syntax colours, Tab = 4 spaces, auto-indent, and auto-save in the browser
- **Run** button (or `Ctrl + Enter`)
- Friendly error messages with the line number, e.g. *"Not enough indentation: expected 4 spaces…"* or *"Commands must be written in UPPERCASE"*
- **Glossary** panel listing every supported command, with examples that can be inserted into the editor
- **First-visit popup** with the 5 writing rules (UPPERCASE commands, 4-space indentation, END for every block, SET, quotes). It can be reopened with the **?** button.
- **JavaScript** tab showing the code the pseudo code was translated into
- Infinite-loop protection
- **My commands**: students (or teachers) can teach the runner their own commands, saved in the browser's localStorage (see below)

## My commands (custom commands)
Pseudo code differs from person to person, so students can add commands the runner does not know yet.
Open **Glossary → My commands**, or click **+ Teach this command** on the error message for an unknown line.

| Kind | Example "When I write…" | "…it means" |
|---|---|---|
| Command (whole line) | `INCREASE {x} BY {n}` | `SET {x} = {x} + ({n})` |
| Block command | `LOOP {n} TIMES:` and `END LOOP` | `FOR i{#} FROM 1 TO {n}:` and `END FOR` |
| Several lines | `SWAP {a} AND {b}` | `SET t{#} = {a}` / `SET {a} = {b}` / `SET {b} = t{#}` |
| Phrase (inside any line) | `{a} IS GREATER THAN {b}` | `{a} > {b}` |
| Function (pseudo code or JavaScript) | `SHOUT(text)` | `return String(text).toUpperCase() + "!";` |

- `{name}` marks a part that changes; `{#}` becomes a unique number (so nested loops don't clash).
- The meaning is written with commands the runner already knows, so a new command is just a shortcut and needs no JavaScript.
- Everything is stored only in that browser (`localStorage`). Use **Export** to download a `.json` file and **Import** to load it,
  so a teacher can prepare a set of commands and share the file with the class.

## Publish on GitHub Pages
1. Merge this branch into `main`.
2. In the repository, go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Source: Deploy from a branch**, then **Branch: `main`**, folder **`/ (root)`**, and click **Save**.
4. After about a minute the site is live at `https://<your-username>.github.io/pseudo-to-js/`.

## Project layout
| File | What it does |
|---|---|
| `index.html` | The page |
| `css/style.css` | Styles |
| `js/transpiler.js` | Pseudo code → JavaScript translator, custom-command engine, and runtime (built-in functions) |
| `js/app.js` | Editor, Run button, glossary, popup, My commands |
| `js/glossary.js` | Glossary entries (**edit this to document new commands**) |
| `js/examples.js` | Example programs in the *Examples* menu (**add new examples here**) |
| `tests/run-tests.js` | Checks that every example and glossary snippet runs: `node tests/run-tests.js` |

### Adding an example
Open `js/examples.js`, copy one `{ id, title, code }` block, and paste your pseudo code between the backticks.
Then run `node tests/run-tests.js` to make sure it still runs.

## Supported pseudo code (summary)
```
// comment
SET x = 5                     PRINT "Total: " + x          INPUT name
IF cond THEN / ELSE IF cond THEN / ELSE / END IF
FOR i FROM 1 TO 10 [STEP 2]: ... END FOR
FOR EACH item IN list: ... END FOR
WHILE cond DO ... END WHILE   REPEAT ... UNTIL cond        BREAK / CONTINUE
ADD x TO list                 REMOVE x FROM list           SORT list [BY field] [ASCENDING|DESCENDING]
FUNCTION name(a, b) ... RETURN value ... END FUNCTION      CALL name(1, 2)
x EXISTS IN list_or_dict      AND  OR  NOT  MOD  ==  !=  <  >  <=  >=
LENGTH ROUND FLOOR CEIL ABS SQRT POWER MIN MAX SUM AVERAGE RANDOM UPPER LOWER TRIM
STR NUM INT KEYS VALUES CONTAINS INDEX_OF SUBSTRING SPLIT JOIN TYPE
```
