# Plan 3 — The conditions language: parser, printer, path binding, checks, evaluator, importer integration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Read every condition of the published module workbooks into the formal language of design record §6. Bind
each condition's paths to element identities for every element that names it, check it against the model and the
nomenclatures, and evaluate it against a message.

**Architecture:**
- **`spec-model`** gains the language as pure code: an AST, a parser that also reads the workbooks' looser import
  dialect, a canonical printer, per-element path binding, type checks and an evaluator. All of it is free of I/O, so
  it runs in the browser (§6.7).
- **The importer** parses and binds every condition on import and reports what it could not read or resolve.
- **The set import** adds the code-list checks, which need the same slot's nomenclatures.

**Tech Stack:** Node 24, CommonJS, `node --test`. No new dependency.

**Spec:** [`docs/superpowers/specs/2026-10-14-portal-foundation-design.md`](../specs/2026-10-14-portal-foundation-design.md):
- §4.5 conditions in the model;
- §5.3 "Interpret" and the levels;
- **§6.1–6.9** the language, as amended for this plan: alternatives, `THIS`, `.entry[…]`, list columns, folding, the
  import dialect, and the measured corpus.

Builds on plans 1 and 2. **Execution starts after #7 (HEL-18) is merged**: without it, three of the seven production
modules import no messages, and the corpus tests in Task 7 need them. Tracking: **HEL-17**. Source defects found
while measuring: **HEL-19** (structure) and **HEL-20** (conditions).

## Decisions this plan takes

Boris settled 1–4 on 2026-10-21 (recorded in §6); 5–8 are the plan's own. Reject any of them at review, before Task 1.

1. **Alternatives in a branch.** THEN and ELSE may be `A OR B`, each alternative an AND-list. A branch holds when one
   alternative holds in full. Five production conditions need it.
2. **`THIS`** is the element naming the condition; the workbooks write it as a bare `'*'` or `'..'` (21 references).
3. **Code-list columns.**
   - `'path'.entry['Column']` reads a column of the entry the element holds;
   - `IN CLxxx['Column']` takes a list column as the allowed set.
4. **Compared values fold to Latin with a warning**, like every code. A value that is still not a key of its element's
   code list **blocks** (§6.5): 8 such values in 2 modules today.
5. **One parser, two audiences.** The parser always accepts the import dialect (§6.8) and lists the forms it used. The
   importer reports them as one warning per condition; the studio (part 3) will refuse them. Rejected: two parsers,
   which would let the two grammars drift.
6. **Clauses are lines.** A condition is split into its FOR EACH / IF / THEN / ELSE clauses at line starts before
   tokenising. A line not starting with one of them continues the clause above. A clause that cannot be read
   therefore never takes its neighbours with it: CDP14's prose contains an apostrophe. Every one of the 151 non-empty
   production conditions is line-structured, and the printer writes the same structure.
7. **Bindings are per naming element**, not per condition (§6.2). A condition named by elements of three messages has
   three bindings, and an unresolved path in one does not mark the others.
8. **Entity-name paths** (`'patient.…'`, `'practitioner.…'`; about 126 references) stay unresolved warnings until
   plan 4 brings the XSD types. Rejected: guessing the tag from the entity name.

## Global Constraints

- **Node 24.** Every `package.json` declares `"engines": { "node": ">=24" }`.
- **House style.** CommonJS; four-space indent; double quotes; semicolons; **spaces inside parentheses, brackets and
  braces**: `foo( a, b )`, `[ 1, 2 ]`, `{ key: value }`.
- **JSDoc on everything exported**: prose first, then `@method` / `@param` / `@returns` / `@throws`, then `@public`.
- **Imports.** `#alias` inside a package; the `exports` map across packages.
- **`spec-model` stays pure:** no `require` of `node:` modules, no I/O. The parser, printer, binder, checks and
  evaluator all live there.
- **No new dependency.** The grammar is small enough for a hand-written recursive-descent parser.
- **Data.** Never commit unpublished specification data; fixtures are fetched into the git-ignored `.fixtures/`.
- **Never write a model identifier** into a file, commit message or pull-request body.
- **Folding** (plan 2, Decision 2): codes fold to Latin, text never does. In conditions, codes are the quoted values,
  requirement letters and cardinalities. `NOTE` text is never folded.
- **Every new `.js` file begins with the EUPL block** of `packages/importer/read/raw.js`, lines 1–16, verbatim.
- **Code with backslashes or regular expressions is written with the Write and Edit tools**, never through a shell
  heredoc, which loses backslashes in this environment.

## Review Focus

These are inputs the spec implies but the happy path never exercises. Each has a test in the task that owns the code.

1. **A condition named by elements of several messages**, with a relative path that resolves in one and not in
   another (e-Referral CDR21: `observation` in R005, `result` in R010).
   - Expected: bound where it resolves; one `unresolved-condition-path` for R010 only.
   - → Task 6, "binds per naming element, and reports a path only where it fails".
2. **Prose with an apostrophe in a THEN clause** (CDP14: "person's identifier"). It must become a `NOTE`, and the ELSE
   must still read.
   - → Task 2, "keeps an unreadable clause as a note, and reads the others".
3. **A value that contains an `x` but is no glob** (`'xml'`, `'Max'`, `'1x2'`). It must stay a literal; only a
   trailing run of `x` after a digit or a dot is a wildcard.
   - → Task 2, "reads x as a wildcard only at the end of a code".
4. **Printing, then parsing, gives the same condition.** Otherwise the studio would change a condition every time it
   saved one.
   - → Task 2 ("prints what it parses") and Task 7 ("round-trips every production condition").
5. **Evaluating a message without the condition's scope element**, or with the scope repeated:
   - no scope → no outcome, not a crash;
   - a repeated scope → one outcome per occurrence.
   - → Task 5, "evaluates once per occurrence of the innermost repeating element".

## File map

| File | Responsibility |
|---|---|
| `packages/spec-model/model/conditions.js` | Enumerations of the AST: operators, effect kinds, properties |
| `packages/spec-model/model/definitions.types.js` | AST, binding and evaluation typedefs |
| `packages/spec-model/model/condition-printer.js` | `printCondition`, `printEffect` |
| `packages/spec-model/model/condition-parser.js` | `parseCondition`: clauses, tokens, grammar, dialect forms |
| `packages/spec-model/model/condition-binding.js` | `bindCondition`, `operandKey` |
| `packages/spec-model/model/condition-checks.js` | `checkConditionTypes` |
| `packages/spec-model/model/links.js` | `linkConditions` (code-list keys and columns) |
| `packages/spec-model/model/evaluator.js` | `evaluateCondition` |
| `packages/spec-model/model/anomalies.js` | 7 new types |
| `packages/importer/importer/condition-import.js` | Parse, fold, bind and check a module's conditions |
| `packages/importer/importer/module-importer.js` | Uses `condition-import.js`; adds `conditionBindings` |
| `packages/importer/importer/set-importer.js` | Calls `linkConditions` |
| `scripts/fetch-public-fixtures.js` | Seven more production module workbooks |

---

### Task 1: The condition model and its printer

**Files:**
- Create: `packages/spec-model/model/conditions.js`, `packages/spec-model/model/condition-printer.js`
- Modify: `packages/spec-model/model/definitions.types.js`; `packages/spec-model/package.json`, with exports
  `./conditions` and `./condition-printer`, and import `#conditions`
- Test: `packages/spec-model/test/condition-printer.test.js`

**Interfaces:**
- **Produces, in `#conditions`:**
  - `OPERATOR`: `{ EQUAL: "=", NOT_EQUAL: "!=", LESS: "<", LESS_OR_EQUAL: "<=", GREATER: ">", GREATER_OR_EQUAL: ">=",
    IN: "in", NOT_IN: "not-in", MATCHES: "matches", NOT_MATCHES: "not-matches", IS_NULL: "is-null",
    IS_NOT_NULL: "is-not-null", IS_TRUE: "is-true", IS_FALSE: "is-false" }`;
  - `EFFECT`: `{ REQUIRE: "require", ABSENT: "absent", RESTRICT: "restrict", CARDINALITY: "cardinality",
    ANY: "any", NOTE: "note" }`;
  - `PROPERTY`: `{ VALUE: "value", REQUIRED: "required", CARDINALITY: "cardinality", ELEMENT: "element",
    ENTRY: "entry" }`.
- **Produces, typedefs** (exact names and properties):
  - `ConditionPath { text: string|null, self: boolean }`. `text` is the dotted path as written, `null` for `THIS`.
  - `Operand { path: ConditionPath, attribute: string|null, property: string, column: string|null }`, where
    `property` is one of `PROPERTY`. `attribute` is set for `.@name`; `column` for `.entry['…']`.
  - `ListColumn { list: string, column: string }`.
  - `Comparison { kind: "comparison", operand: Operand, operator: string, values: string[], set: ListColumn|null }`.
    `values` are the values as stored, with globs in `?` / `*` form.
  - `Predicate`: `Comparison | { kind: "and"|"or", terms: Predicate[] } | { kind: "not", term: Predicate }`.
  - `Effect`, one of:
    - `{ kind: "require", operand, requirement: "R"|"O" }`
    - `{ kind: "absent", operand }`
    - `{ kind: "restrict", operand, operator, values: string[], set: ListColumn|null }`
    - `{ kind: "cardinality", operand, cardinality: Cardinality }`
    - `{ kind: "any", operand }`
    - `{ kind: "note", text: string }`
  - `Branch { alternatives: Effect[][] }`, one or more alternatives, each an AND-list.
  - `Condition { scope: ConditionPath|null, predicate: Predicate, then: Branch, otherwise: Branch|null }`.
  - `ConditionText` (plan 1) gains `parsed: Condition|null` and `printed: string|null`.
- **Produces:** `printCondition( condition: Condition ): string` and `printEffect( effect: Effect ): string`.

**The canonical form, exact copy:**

| Piece | Printed |
|---|---|
| Clauses | `FOR EACH 'p'` (if any), `IF …`, `THEN …`, `ELSE …` (if any), each on its own line, joined by `\n` |
| A path | `'prescription.category'`; `THIS` for self |
| Properties | `.value`, `.required`, `.cardinality`, `.@nhifCode`, `.@nhifCode.required`, `.entry['Contagious']` |
| The element itself | No property: `'referral.laboratory' IS null` |
| A quoted value | `'…'`, with a `'` inside written `''` |
| Lists | `IN ['T2', 'T3']` (values separated by `, `); `IN CL006['NHIF Code']` |
| Unary operators | `IS null`, `IS NOT null`, `IS true`, `IS false`, `IS any` |
| Glob operators | `MATCHES 'N80.??'`, `NOT MATCHES ['E89.4?', 'N80.??']` (several globs as a list) |
| `AND` / `OR` | `A AND B`, `A OR B`. A term of another kind is wrapped in parentheses: `(A OR B) AND C`. `NOT` prints as `NOT (…)` unless its term is a comparison |
| Alternatives | `A OR B`. An alternative of more than one effect is wrapped when there are several: `('a'.required = 'R' AND 'b'.required = 'R') OR 'c'.required = 'R'` |
| Cardinality | `'1..3'`; an open upper bound prints `'1..*'` |
| A note | `NOTE '…'` |

- [ ] **Step 1: Write the failing tests**

```js
const path = ( text ) => ( { text, self: false } );
const THIS = { text: null, self: true };
const value = ( text, extra = {} ) => ( { path: path( text ), attribute: null, property: "value", column: null, ...extra } );
const compare = ( operand, operator, values = [], set = null ) => ( { kind: "comparison", operand, operator, values, set } );
const require_ = ( text, requirement ) => ( { kind: "require", operand: value( text, { property: "required" } ), requirement } );
const absent = ( operand ) => ( { kind: "absent", operand } );

it( "prints CDP01 in the canonical form", () => {
    assert.equal( printCondition( {
        scope: null,
        predicate: compare( value( "prescription.category" ), "in", [ "T2", "T3" ] ),
        then: { alternatives: [ [ require_( "prescription.isProtocolBased", "R" ) ] ] },
        otherwise: { alternatives: [ [ require_( "prescription.isProtocolBased", "O" ) ] ] }
    } ), "IF 'prescription.category'.value IN ['T2', 'T3']\nTHEN 'prescription.isProtocolBased'.required = 'R'\nELSE 'prescription.isProtocolBased'.required = 'O'" );
} );

it( "prints alternatives, THIS and an absent element", () => {
    const printed = printCondition( {
        scope: null,
        predicate: compare( value( "nrnReferral" ), "is-null" ),
        then: { alternatives: [ [ require_( "lrn", "R" ), require_( "pmi", "R" ) ], [ require_( "identifier", "R" ) ] ] },
        otherwise: { alternatives: [ [ absent( { path: THIS, attribute: null, property: "value", column: null } ) ] ] }
    } );
    assert.equal( printed, "IF 'nrnReferral'.value IS null\nTHEN ('lrn'.required = 'R' AND 'pmi'.required = 'R') OR 'identifier'.required = 'R'\nELSE THIS.value IS null" );
    assert.equal( printEffect( absent( { path: path( "referral.laboratory" ), attribute: null, property: "element", column: null } ) ), "'referral.laboratory' IS null" );
} );

it( "prints entry columns, list columns, attributes, globs, open cardinalities and notes", () => {
    const contagious = compare( { path: path( "..diagnosis.code" ), attribute: null, property: "entry", column: "Contagious" }, "is-not-null" );
    assert.equal( printCondition( { scope: path( "prescription.group" ), predicate: { kind: "and", terms: [ contagious, { kind: "or", terms: [
        compare( value( "a" ), "=", [ "1" ] ), compare( value( "b" ), ">", [ "2" ] ) ] } ] },
    then: { alternatives: [ [
        { kind: "restrict", operand: value( "qualification", { attribute: "nhifCode" } ), operator: "in", values: [], set: { list: "CL006", column: "NHIF Code" } },
        { kind: "restrict", operand: value( "medication.mkb" ), operator: "not-matches", values: [ "E89.4?", "N80.??" ], set: null },
        { kind: "cardinality", operand: value( "consultation", { property: "cardinality" } ), cardinality: { min: 5, max: null } } ] ] },
    otherwise: { alternatives: [ [ { kind: "note", text: "to be populated with person's identifier" } ] ] } } ),
    [ "FOR EACH 'prescription.group'",
        "IF '..diagnosis.code'.entry['Contagious'] IS NOT null AND ('a'.value = '1' OR 'b'.value > '2')",
        "THEN 'qualification'.@nhifCode IN CL006['NHIF Code'] AND 'medication.mkb'.value NOT MATCHES ['E89.4?', 'N80.??'] AND 'consultation'.cardinality = '5..*'",
        "ELSE NOTE 'to be populated with person''s identifier'" ].join( "\n" ) );
} );
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test --workspace=@health-dev-portal/spec-model`
Expected: FAIL — `@health-dev-portal/spec-model/condition-printer` is not exported.

- [ ] **Step 3: Implement the enumerations, typedefs and printer as specified above**

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/spec-model
git commit -m "feat(spec-model): the condition model and its canonical printer (HEL-17)"
```

---

### Task 2: The parser, with the import dialect

**Files:**
- Create: `packages/spec-model/model/condition-parser.js`
- Modify: `packages/spec-model/package.json`, adding export `./condition-parser`
- Test: `packages/spec-model/test/condition-parser.test.js`

**Interfaces:**
- **Consumes:** the Task 1 typedefs and `printCondition`; `parseCardinality` semantics (min, max, `*` → `null`).
  spec-model must not require the importer, so the cardinality is read here with the same rules.
- **Produces:** `parseCondition( text: string, options?: { value?: function( string ): string } ):
  { condition: Condition|null, forms: string[], notes: string[], error: string|null }`.
  - **`options.value`** receives every quoted or unquoted value — compared values, requirement letters, cardinalities
    — before it is checked, and returns the value to use. The importer passes its look-alike fold here (Task 6).
    `NOTE` text never reaches it.
  - **`forms`** lists the import-dialect forms used, without repeats, in this order:
    1. `shorthand OR`
    2. `&&`
    3. `left side omitted`
    4. `unquoted value`
    5. `ANY without IS`
    6. `bare '*' or '..'`
    7. `attribute without @`
    8. `.value.required`
    9. `.content`
    10. `.meta[…]`
    11. `CLxxx.column`
    12. `x as a wildcard`
    13. `annotation`
    14. `missing property`
  - **`notes`** holds the source text of each THEN / ELSE clause kept as a `NOTE`.
  - **`error`** is set, and `condition` is `null`, when the IF (or FOR EACH) clause cannot be read, or the text is
    empty.

**Clauses** (Decision 6):
- Lines starting (after spaces, case-insensitively) with `FOR EACH`, `IF`, `THEN` or `ELSE` open a clause; other lines
  continue the clause above.
- IF and THEN are required; ELSE is optional.
- A THEN or ELSE clause that fails to parse becomes `{ alternatives: [ [ { kind: "note", text } ] ] }`, its text
  trimmed and without the keyword, and is recorded in `notes`.

**The grammar**, after the keyword is removed. Keywords are case-insensitive, and `&&` is `AND`:

```text
predicate    = disjunction
disjunction  = conjunction { "OR" conjunction }
conjunction  = unary { "AND" unary }
unary        = "NOT" unary | "(" disjunction ")" | comparison
comparison   = operand ( "IS" [ "NOT" ] ( "null" | "true" | "false" | "any" )
                       | [ "NOT" ] "IN" ( list | listColumn )
                       | [ "NOT" ] "MATCHES" ( value | list )
                       | relop value { "OR" value }          -- the shorthand, only while OR is followed by a value
               ) [ annotation ]
             | relop value                                   -- left side omitted: repeats the previous comparison's operand
branch       = alternative { "OR" alternative }
alternative  = effectTerm { "AND" effectTerm }
effectTerm   = "(" alternative ")" | "NOTE" value | effect
effect       = operand ( "=" value { "OR" value } | "!=" value { "OR" value } | [ "NOT" ] "IN" ( list | listColumn )
                       | [ "NOT" ] "MATCHES" ( value | list ) | "IS" ( "null" | "any" ) | "=" "ANY" ) [ annotation ]
operand      = path { property }
path         = quoted | "THIS"
property     = ".value" | ".required" | ".cardinality" | ".@" name | "." name   -- "." name is an attribute: "attribute without @"
             | ".content" | ".contents" | ".meta" "[" quoted "]" | ".entry" "[" quoted "]"
list         = "[" value { "," value } "]"
listColumn   = CLname "[" quoted "]" | CLname "." name      -- CLname.name: "CLxxx.column"
value        = quoted | number | bareword                     -- number and bareword: "unquoted value"
annotation   = "(" bareword ")"                               -- "(fixed)": "annotation", dropped
quoted       = "'" { any character but "'", or "''" } "'"
```

**From parse tree to AST:**
- **Operands:**
  - `'*'` or `'..'` alone → `THIS` (`bare '*' or '..'`).
  - `.content` / `.contents` → property `element` (`.content`).
  - `.meta['X']` → property `entry` with column `X` (`.meta[…]`).
  - A chain `.value.required` → property `required` (`.value.required`).
  - A chain `.nhifCode.required` → attribute `nhifCode` with property `required`.
  - An operand with no property, compared by value → property `value` (`missing property`); with `IS null` /
    `IS NOT null` → property `element`, which is canonical.
- **Comparisons:**
  - `= a OR b` → `in`, and `!= a OR b` → `not-in` (`shorthand OR`).
  - A value that, once `options.value` has run, ends in a run of lowercase `x` after a digit or a dot (`/[\d.]x+$/`)
    has each trailing `x` replaced by `?` (`x as a wildcard`). It then turns `=` / `in` into `matches`, and `!=` /
    `not-in` into `not-matches`. A shorthand mixing globs and plain values keeps them as the glob operator's list.
- **Effects:**
  - `'p'.required = 'R'` / `'O'` → `require`. Any other letter → the clause fails (it becomes a note).
  - `IS null` → `absent`.
  - `IS any` and `= ANY` → `any`.
  - `.cardinality = '…'` → `cardinality`. A missing upper bound (`'5..'`) is open. Anything unreadable fails the
    clause.
  - Value operators → `restrict`.

- [ ] **Step 1: Write the failing tests**

Four constants hold the published texts, verbatim, from the measurement of 2026-10-21:

```js
const CDP01_WORKBOOK = "IF 'prescription.category'.value = 'T2' OR 'T3'\nTHEN 'prescription.isProtocolBased'.required = 'R'\nELSE 'prescription.isProtocolBased'.required = 'O'";
const CDR01_WORKBOOK = "IF 'nrnReferral'.value IS null\nTHEN ('lrn'.required = 'R' AND 'pmi'.required = 'R') OR ('identifier'.required = 'R' AND 'fromDate'.required = 'O' AND 'toDate'.required = 'O')\nELSE '..'.value IS null";
const CDX29_WORKBOOK = "IF '..diagnosis.code'.meta['Contagious'] IS NOT NULL\nTHEN '..diagnosis.diseasesReporting'.value.required = 'R'\nELSE '..diagnosis.diseasesReporting'.value IS null";
const CDP30_WORKBOOK = "IF 'subject.gender'.value = '1'\nTHEN 'medication.mkb'.value != 'E89.4x' OR 'N80.xx'\nELSE 'medication.mkb'.value IS any";
const read = ( text, options ) => parseCondition( text, options );

it( "reads the canonical form with no dialect form", () => {
    const text = "IF 'prescription.category'.value IN ['T2', 'T3']\nTHEN 'prescription.isProtocolBased'.required = 'R'\nELSE 'prescription.isProtocolBased'.required = 'O'";
    const result = read( text );
    assert.deepEqual( [ result.forms, result.notes, result.error ], [ [], [], null ] );
    assert.equal( printCondition( result.condition ), text );
} );

it( "prints what it parses: a printed condition parses back to itself", () => {
    for ( const text of [ CDP01_WORKBOOK, CDR01_WORKBOOK, CDX29_WORKBOOK, CDP30_WORKBOOK ] ) {
        const first = read( text ).condition;
        const again = read( printCondition( first ) );
        assert.deepEqual( again.forms, [] );
        assert.deepEqual( again.condition, first );
    }
} );
```

```js
it( "lists the dialect forms each workbook condition uses", () => {
    assert.deepEqual( read( CDP01_WORKBOOK ).forms, [ "shorthand OR" ] );
    assert.deepEqual( read( CDR01_WORKBOOK ).forms, [ "bare '*' or '..'" ] );
    assert.deepEqual( read( CDX29_WORKBOOK ).forms, [ ".value.required", ".meta[…]" ] );
    assert.deepEqual( read( CDP30_WORKBOOK ).forms, [ "shorthand OR", "x as a wildcard" ] );
    assert.deepEqual( read( "IF 'a'.value = 1 && 'b'.value != '01.01' AND != '01.04'\nTHEN 'c'.required = 'R'\nELSE 'c'.value = ANY" ).forms,
        [ "&&", "left side omitted", "unquoted value", "ANY without IS" ] );
    assert.deepEqual( read( "IF 'q'.nhifCode IS NOT null\nTHEN 'q'.nhifCode IN CL006.nhifCode\nELSE 'q' NOT IN [VF036, VF037]" ).forms,
        [ "unquoted value", "attribute without @", "CLxxx.column", "missing property" ] );
    assert.deepEqual( read( "IF 'x'.value = '2'\nTHEN 'y'.required = 'R'\nELSE 'y'.value = 'BG' (fixed)" ).forms, [ "annotation" ] );
} );

it( "reads x as a wildcard only at the end of a code (Review Focus 3)", () => {
    const effect = ( text ) => read( `IF 'a'.value = '1'\nTHEN 'b'.value = '${ text }'` ).condition.then.alternatives[ 0 ][ 0 ];
    assert.deepEqual( [ effect( "N80.xx" ).operator, effect( "N80.xx" ).values ], [ "matches", [ "N80.??" ] ] );
    assert.deepEqual( effect( "E89.4x" ).values, [ "E89.4?" ] );
    for ( const literal of [ "xml", "Max", "1x2", "x" ] ) {
        assert.deepEqual( [ effect( literal ).operator, effect( literal ).values ], [ "=", [ literal ] ], literal );
    }
} );

it( "keeps an unreadable clause as a note, and reads the others (Review Focus 2)", () => {
    const result = read( "IF 'header.sender'.value = '1' OR '2' OR '3'\nTHEN 'header.senderId'.value to be populated with person's identifier (pmi/pphi) that is sending the request\nELSE 'header.senderId'.value = 'NHIS'" );
    assert.equal( result.error, null );
    assert.deepEqual( result.notes, [ "'header.senderId'.value to be populated with person's identifier (pmi/pphi) that is sending the request" ] );
    assert.equal( result.condition.then.alternatives[ 0 ][ 0 ].kind, "note" );
    assert.deepEqual( result.condition.otherwise.alternatives[ 0 ][ 0 ].values, [ "NHIS" ] );
} );

it( "leaves a condition whose IF cannot be read as unread, with the reason", () => {
    const result = read( "IF 'referral.financingSource'.value = '2' AND CL006.nhifCode IS NOT null\nTHEN 'q'.@nhifCode.required = 'R'" );
    assert.equal( result.condition, null );
    assert.match( result.error, /CL006/ );
    assert.notEqual( read( "" ).error, null );
} );

it( "passes every value through the caller's hook before checking it", () => {
    const seen = [];
    const result = read( "IF 'nrnHospitalization'.value IS null\nTHEN '*'.required = 'О'\nELSE '*'.value IS null", { value: ( text ) => {
        seen.push( text );
        return text.replace( "О", "O" );
    } } );
    assert.deepEqual( seen, [ "О" ] );
    assert.equal( result.condition.then.alternatives[ 0 ][ 0 ].requirement, "O" );
    assert.equal( read( "IF 'a'.value = '1'\nTHEN 'b'.required = 'C'" ).notes.length, 1 );
} );
```

The parser also exports the ordered list as `DIALECT_FORMS`, so the importer's warning and the studio can name them.

- [ ] **Step 2: Run them to see them fail**

Run: `npm test --workspace=@health-dev-portal/spec-model`
Expected: FAIL — `@health-dev-portal/spec-model/condition-parser` is not exported.

- [ ] **Step 3: Implement the parser as specified above**

Its tokens:
- quoted strings with `''` as an escaped quote;
- `[ ] ( ) ,`;
- `!= <= >= = < > &&`;
- `.@name`, `.name`;
- numbers;
- `CL` names;
- words.

A tokenising error inside a clause is that clause's failure.

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/spec-model
git commit -m "feat(spec-model): parse conditions, the workbooks' import dialect included (HEL-17)"
```

---

### Task 3: Binding a condition's paths to elements

**Files:**
- Create: `packages/spec-model/model/condition-binding.js`
- Create: `packages/spec-model/test/support/messages.js`, a hand-built P001-shaped message for Tasks 3–5. spec-model
  must not depend on the importer, even in tests.
- Modify: `packages/spec-model/package.json`, adding export `./condition-binding`
- Test: `packages/spec-model/test/condition-binding.test.js`

**The test message.** `prescriptionMessage(): Message` (code `P001`) and `elementAt( message, identity ): ElementNode`.
Each element is built from its identity:
- `path` is the identity without `@…` and `#n`;
- `tag` is the path's last part;
- `attribute` is the part after `@`.

Elements are nested by path:

| Identity | Kind | Cardinality | Data type | Code list |
|---|---|---|---|---|
| `header` | group | 1..1 | | |
| `header/sender@value` | field | 1..1 | Codeable Concept | CL018 |
| `contents` | group | 1..1 | | |
| `contents/prescription` | group | 1..1 | | |
| `contents/prescription/lrn@value` | field | 1..1 | String | |
| `contents/prescription/category@value` | field | 1..1 | Codeable Concept | CL007 |
| `contents/prescription/isProtocolBased@value` | field | 0..1 | Boolean | |
| `contents/prescription/protocolNumber@value` | field | 0..1 | String | |
| `contents/prescription/group` | group | 1..* | | |
| `contents/prescription/group/medication` | group | 1..* | | |
| `contents/prescription/group/medication/medicationCode@value` | field | 1..1 | Codeable Concept | CL009 |
| `contents/prescription/group/medication/medicationCode@name` | attribute | 0..1 | Codeable Concept | CL009 |
| `contents/prescription/group/medication/mkb@value` | field | 0..1 | Codeable Concept | CL011 |
| `contents/prescription/group/medication/doseQuantityCode@value` | polymorphic | 1..1 | | |
| `contents/prescription/group/medication/doseQuantityCode@value#1` | field | 1..1 | String | |
| `contents/prescription/group/medication/doseQuantityCode@value#2` | field | 1..1 | Codeable Concept | CL035 |
| `contents/prescription/allowedRepeatsNumber@value` | field | 0..1 | Unsigned Int | |

**Interfaces:**
- **Consumes:** `Condition`, `Operand` (Task 1); plan 1's `Message` and `ElementNode`.
- **Produces:** `operandKey( operand: Operand ): string`. That is `THIS`, or the path text, followed by `@name` when the
  operand has an attribute: `'q@nhifCode'`.
- **Produces:** `bindCondition( condition: Condition, message: Message, element: ElementNode ): ConditionBinding`, where
  `ConditionBinding { condition: string|null, message: string, element: string, paths: Object<string, string|null> }`.
  - It holds one entry per distinct operand key, including the scope's path. A value is the bound element identity,
    or `null` when the path names no single element.
  - The caller fills `condition`, the condition's ID.

**Resolution**, of an operand's path in the naming element's message:
1. **`THIS`** → the naming element.
2. **Tag paths.** A path's dotted text becomes tags. A path beginning `header` is under the root; any other is under
   `contents`.
3. **Absolute:** the element whose `path` is exactly those tags.
4. **Relative** (`..a.b`): walk up from the naming element's parent towards the root. At each ancestor, try the
   ancestor's tags followed by `a.b`. The first that exists wins.
5. **Partial:** the one tag path that ends with the path's tags. Two or more distinct tag paths → `null`. A field and its
   attribute rows share one tag path, so they count once.
6. **Choosing the identity among elements on that tag path:**
   - with an attribute → the element with that `attribute`;
   - otherwise a group → the group;
   - otherwise the element with attribute `value` and no variant number (`#`), which is the field or the polymorphic
     element, not a variant.

   None → `null`.

- [ ] **Step 1: Write the failing tests**

```js
const message = prescriptionMessage();
const keys = ( text, naming ) => bindCondition( parseCondition( text ).condition, message, elementAt( message, naming ) ).paths;

it( "binds absolute, header, relative and partial paths, and THIS", () => {
    assert.deepEqual( keys( "IF 'prescription.isProtocolBased'.value IS true\nTHEN 'header.sender'.required = 'R'\nELSE THIS.value IS null", "contents/prescription/lrn@value" ), {
        "prescription.isProtocolBased": "contents/prescription/isProtocolBased@value",
        "header.sender": "header/sender@value",
        "THIS": "contents/prescription/lrn@value"
    } );
    assert.deepEqual( keys( "IF '..medication.medicationCode'.value IS NOT null\nTHEN 'group.medication'.required = 'R'", "contents/prescription/group/medication/medicationCode@value" ), {
        "..medication.medicationCode": "contents/prescription/group/medication/medicationCode@value",
        "group.medication": "contents/prescription/group/medication"
    } );
} );

it( "binds an attribute operand to its attribute row, and a polymorphic element to itself, not a variant", () => {
    assert.equal( keys( "IF 'medication.medicationCode'.@name IS NOT null\nTHEN 'medication.doseQuantityCode'.required = 'R'", "contents/prescription/lrn@value" )[ "medication.medicationCode@name" ],
        "contents/prescription/group/medication/medicationCode@name" );
    assert.equal( keys( "IF 'a'.value IS null\nTHEN 'medication.doseQuantityCode'.required = 'R'", "contents/prescription/lrn@value" )[ "medication.doseQuantityCode" ],
        "contents/prescription/group/medication/doseQuantityCode@value" );
} );

it( "binds nothing it cannot name exactly", () => {
    const paths = keys( "IF 'patient.identifierType'.value = '2'\nTHEN 'value'.required = 'R'", "contents/prescription/lrn@value" );
    assert.deepEqual( [ paths[ "patient.identifierType" ], paths[ "value" ] ], [ null, null ] );
} );
```

No tag is called `value`, so `'value'` binds nothing, like the entity name `patient`.

- [ ] **Step 2: Run them to see them fail**

Run: `npm test --workspace=@health-dev-portal/spec-model`
Expected: FAIL — `./condition-binding` is not exported.

- [ ] **Step 3: Implement `bindCondition` and `operandKey` as specified above**

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/spec-model
git commit -m "feat(spec-model): bind a condition's paths to elements, per naming element (HEL-17)"
```

---

### Task 4: Checks — types, code-list keys and columns

**Files:**
- Create: `packages/spec-model/model/condition-checks.js`
- Modify: `packages/spec-model/model/anomalies.js` (7 types); `packages/spec-model/model/links.js`;
  `packages/spec-model/package.json`, adding export `./condition-checks`
- Test: `packages/spec-model/test/condition-checks.test.js`, `packages/spec-model/test/links.test.js`

**Interfaces:**
- **Produces:** `checkConditionTypes( condition: Condition, binding: ConditionBinding, elements: Map<string, ElementNode> ):
  Array<{ operator: string, identity: string, dataType: string|null }>`.
  - `is-true` / `is-false` are mismatches on any data type but `Boolean`.
  - `<`, `<=`, `>`, `>=` are mismatches on `Boolean`. On any other non-numeric type they are mismatches unless every
    compared value is a number. The numeric types are `Unsigned Int`, `Positive Int`, `Decimal` and `Integer`.
  - Comparisons in predicates and `restrict` effects are both checked.
- **Produces:** `linkConditions( module: ModuleVersion, nomenclatures: NomenclaturesVersion ): Anomaly[]`.
  - It runs over `module.conditionBindings` (Task 6) and their parsed conditions.
  - **Keys:** every value of a comparison or `restrict` whose operand is bound to an element with a `codeList` must be a
    key of that list. That covers values compared with `=`, `!=`, `in` or `not-in`, but not globs. A value that is not
    → `unknown-condition-value`. A list not in the nomenclatures → nothing here; plan 2 already reports
    `unknown-code-list`.
  - **Columns:** every `.entry['X']` (on an element bound to a list) and every `IN CLxxx['X']` must name a column of the
    list. Column titles are compared lowercased, spaces removed, and with a trailing `(…)` removed, so `nhifCode`
    matches "NHIF Code" and `Contagious` matches "Contagious (CL148)". No match → `unknown-list-column`.
  - Each anomaly is created at the condition's source, once per condition, value and list.
- **Produces, the anomaly types**, exact keys, levels and texts:

| Type | Level | Text |
|---|---|---|
| `non-canonical-condition` | warning | `Condition {id} uses forms the language writes differently ({forms}); it reads as: {printed}` |
| `free-text-effect` | warning | `Condition {id}: "{text}" cannot be read as an effect; it is kept as a note and not checked.` |
| `unparsed-condition` | warning | `Condition {id} cannot be read ({error}); it is kept as text and not checked.` |
| `unresolved-condition-path` | warning | `Condition {id} in {message}: '{path}' names no single element there, so the condition is not checked in that message.` |
| `condition-type-mismatch` | warning | `Condition {id} in {message}: {operator} does not apply to {identity}, which is {dataType}.` |
| `unknown-condition-value` | blocking | `Condition {id}: '{value}' is not a key of {list}, the code list of {identity}.` |
| `unknown-list-column` | warning | `Condition {id}: {list} has no column "{column}".` |

The catalogue grows from 68 to 75.

- [ ] **Step 1: Write the failing tests**

```js
it( "reports IS true on a non-boolean and an ordering on a boolean or a non-number", () => {
    const elements = new Map( [ [ "contents/a@value", { identity: "contents/a@value", dataType: "String" } ], [ "contents/b@value", { identity: "contents/b@value", dataType: "Boolean" } ],
        [ "contents/c@value", { identity: "contents/c@value", dataType: "Codeable Concept" } ] ] );
    const binding = { condition: "CD1", message: "P001", element: "contents/a@value", paths: { a: "contents/a@value", b: "contents/b@value", c: "contents/c@value" } };
    const check = ( text ) => checkConditionTypes( parseCondition( text ).condition, binding, elements );
    assert.deepEqual( check( "IF 'a'.value IS true\nTHEN 'b'.value > '1'" ).map( ( problem ) => problem.operator ), [ "is-true", ">" ] );
    assert.deepEqual( check( "IF 'c'.value > '1'\nTHEN 'a'.value >= 'x'" ).map( ( problem ) => [ problem.operator, problem.identity ] ), [ [ ">=", "contents/a@value" ] ] );
    assert.deepEqual( check( "IF 'b'.value IS false\nTHEN 'c'.value > '1'" ), [] );
} );
```

In `links.test.js`, the module carries one parsed condition and one binding, and the nomenclatures carry CL028 (keys
`1`, `2`) and CL011 (column "Contagious (CL148)"):

```js
it( "blocks a compared value that is not a key of the element's code list, once per value", () => { /* 'QN' → unknown-condition-value, blocking, details { id, value: "QN", list: "CL028", identity } */ } );
it( "accepts keys and globs, and checks nothing against a list the nomenclatures lack", () => { /* '1', 'N80.??' → []; element on CL999 absent → [] */ } );
it( "warns about an entry or list column the list does not have, matching titles loosely", () => {
    /* .entry['Contagious'] → []; .entry['Rare'] → unknown-list-column; IN CL006['nhifCode'] against a CL006 with "NHIF Code" → [] */
} );
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test --workspace=@health-dev-portal/spec-model`
Expected: FAIL — `./condition-checks` is not exported, and `linkConditions` is not a function.

- [ ] **Step 3: Implement `checkConditionTypes`, `linkConditions` and the catalogue entries**

Write out the three `links.test.js` bodies in the same style as plan 2's link tests.

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/spec-model
git commit -m "feat(spec-model): check conditions' types, code-list keys and columns (HEL-17)"
```

---

### Task 5: The evaluator

**Files:**
- Create: `packages/spec-model/model/evaluator.js`
- Modify: `packages/spec-model/package.json`, adding export `./evaluator`
- Test: `packages/spec-model/test/evaluator.test.js`

**Interfaces:**
- **Consumes:** `Condition` (Task 1), `ConditionBinding` (Task 3), `printEffect` (Task 1).
- **Produces:** `evaluateCondition( condition: Condition, binding: ConditionBinding, instance: InstanceNode,
  model: Map<string, ElementNode>, options?: { codeLists?: Map<string, CodeList> } ):
  { violations: Violation[], unchecked: string[] }`.
  - `InstanceNode { tag: string, attributes: Object<string, string>, children: InstanceNode[] }`, as a typedef. The
    root's children are `header` and `contents`.
  - `Violation { scope: string, branch: "then"|"else", effect: string, reason: string }`.
    - `scope` names the occurrence, e.g. `contents/prescription/group[2]/medication[1]`, with a 1-based index on every repeating
      step, or `(message)`.
    - `effect` is `printEffect`'s text, or the whole branch printed when no alternative held.
  - `unchecked` lists what could not be evaluated: printed notes, and `.entry[…]` / `IN CLxxx[…]` without
    `options.codeLists`.
  - A condition with any `null` path in its binding is not evaluated: it returns `unchecked` holding the printed
    condition.

**The algorithm.** §6.6 fixes it, and the tests do not determine all of it:

```text
identities ← every bound identity of the condition, except THIS's
scopePath  ← FOR EACH's bound path, if any;
             else, of the tag paths of identities ∪ { THIS's identity }, their longest common prefix P, and in P the
             deepest element whose model cardinality has max null or > 1
occurrences ← scopePath ? every instance node on scopePath : [ root ]           -- none → no violations, nothing unchecked
for each occurrence o:
    nodes( identity ) = the instance nodes on identity's tag path, found under o when the path lies under scopePath,
                        else under the root; an attribute is read from each node's attributes
    predicate: a comparison holds when it holds for at least one node (§6.6, provisional);
               IS null holds when there is no node, or no node carries the attribute
    branch ← predicate ? then : otherwise; no ELSE and false → nothing to check
    the branch holds when one alternative holds in full; when none does, one violation:
        reason "no alternative holds" if there are several, else the failing effect's reason
effect holds:
    require R      — at least one node            require O — always
    absent         — no node
    restrict       — every node's value satisfies the operator (numbers compared as numbers when both sides are numbers)
    cardinality    — the number of nodes under o lies within min..max
    any            — always             note — unchecked
```

- [ ] **Step 1: Write the failing tests**

They run on instances of Task 3's test message:

```js
const node = ( tag, attributes = {}, ...children ) => ( { tag, attributes, children } );
const prescription = ( ...children ) => node( "message", {}, node( "header" ), node( "contents", {}, node( "prescription", {}, ...children ) ) );
const message = prescriptionMessage();
const flatten = ( elements ) => elements.flatMap( ( element ) => [ element, ...flatten( element.children ) ] );
const model = new Map( flatten( message.elements ).map( ( element ) => [ element.identity, element ] ) );
const evaluate = ( text, naming, instance, options ) => {
    const condition = parseCondition( text ).condition;
    return evaluateCondition( condition, { ...bindCondition( condition, message, elementAt( message, naming ) ), condition: "CD" }, instance, model, options );
};
const CDP02 = "IF 'prescription.isProtocolBased'.value IS true\nTHEN 'prescription.protocolNumber'.required = 'R'\nELSE 'prescription.protocolNumber'.value IS null";

it( "applies THEN when the predicate holds and ELSE when it does not", () => {
    const naming = "contents/prescription/protocolNumber@value";
    assert.deepEqual( evaluate( CDP02, naming, prescription( node( "isProtocolBased", { value: "true" } ) ) ), { violations: [
        { scope: "(message)", branch: "then", effect: "'prescription.protocolNumber'.required = 'R'", reason: "must be present" } ], unchecked: [] } );
    assert.deepEqual( evaluate( CDP02, naming, prescription( node( "isProtocolBased", { value: "false" } ), node( "protocolNumber", { value: "P-1" } ) ) ), { violations: [
        { scope: "(message)", branch: "else", effect: "'prescription.protocolNumber'.value IS null", reason: "must be absent" } ], unchecked: [] } );
} );

it( "evaluates once per occurrence of the innermost repeating element (Review Focus 5)", () => {
    const text = "IF 'medication.mkb'.value IS NOT null\nTHEN 'medication.medicationCode'.required = 'R'";
    const naming = "contents/prescription/group/medication/mkb@value";
    const group = ( ...medications ) => node( "group", {}, ...medications );
    const instance = prescription(
        group( node( "medication", {}, node( "mkb", { value: "A01" } ), node( "medicationCode", { value: "1" } ) ) ),
        group( node( "medication", {}, node( "mkb", { value: "A02" } ) ) ) );
    assert.deepEqual( evaluate( text, naming, instance ).violations.map( ( violation ) => violation.scope ), [ "contents/prescription/group[2]/medication[1]" ] );
    assert.deepEqual( evaluate( text, naming, prescription() ), { violations: [], unchecked: [] } );
} );

it( "holds a branch when one alternative holds in full", () => { /* CDR01's shape: lrn+pmi present → none; identifier alone → none; neither → reason "no alternative holds" */ } );
it( "shares a path above the scope with every occurrence, and lets FOR EACH choose the scope", () => { /* prescription.category above the group */ } );
it( "holds a comparison over a repeated path when one occurrence holds (§6.6, provisional)", () => { /* two medications, one matching */ } );
it( "checks values, globs and cardinalities", () => { /* = / IN / NOT MATCHES 'N80.??' / cardinality 1..3 with 4 groups */ } );
it( "reads an entry column with the code lists, and reports it unchecked without them", () => { /* CL011 entry with Contagious set */ } );
it( "evaluates nothing for a binding with an unresolved path, and says so", () => { /* paths: { x: null } → unchecked holds the printed condition */ } );
```

Each test asserts the full `{ violations, unchecked }`, with exact `scope`, `branch`, `effect` and `reason` strings.
The reasons are exact copy:
- `must be present`;
- `must be absent`;
- `value '{value}' is not allowed`;
- `{count} occurrence(s), not {cardinality}`;
- `no alternative holds`.

- [ ] **Step 2: Run them to see them fail**

Run: `npm test --workspace=@health-dev-portal/spec-model`
Expected: FAIL — `./evaluator` is not exported.

- [ ] **Step 3: Implement `evaluateCondition` per the algorithm above**

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/spec-model
git commit -m "feat(spec-model): evaluate a condition against a message (HEL-17)"
```

---

### Task 6: Importing conditions

**Files:**
- Create: `packages/importer/importer/condition-import.js`
- Modify:
  - `packages/importer/importer/module-importer.js`;
  - `packages/importer/importer/set-importer.js`;
  - `packages/importer/package.json`, adding import `#condition-import`;
  - `packages/spec-model/model/definitions.types.js`, where `ModuleVersion` gains `conditionBindings: ConditionBinding[]`;
  - `packages/importer/test/support/fixtures.js`, which makes the sound fixture sound again (Step 1).
- Test: `packages/importer/test/condition-import.test.js`, `packages/importer/test/set-importer.test.js`, and plan 1's
  `side-sheets.test.js` and `message-tree.test.js`, for the fixture change only

**The fixture must stay sound.** `moduleSheets()` "imports with no anomaly at all", and plan 1's tests rely on that.
Its four conditions use the shorthand (`= 'T2' OR 'T3'`) and name fields that P001 lacks (`category`,
`dispensationType`), so with conditions bound it would now warn.
- **Append two field rows** at depth 2 under `prescription`, after row 17, so no row number moves:
  - row 18, `Prescription Category`, `R`, `1..1`, `Codeable Concept`, code list `CL007`, tag `category`;
  - row 19, `Dispensation Type`, `R`, `1..1`, `Codeable Concept`, code list `CL009`, tag `dispensationType`.
- **Write the four conditions canonically**, e.g. CDP01 `IF 'prescription.category'.value IN ['T2', 'T3']`.
- **Update** only the expectations that pin the old texts (`side-sheets.test.js`) or P001's identity list
  (`message-tree.test.js`).

**Interfaces:**
- **Consumes:** Tasks 1–4; `foldLookAlikes` (plan 1).
- **Produces:** `importConditions( conditions: ConditionText[], messages: Message[] ):
  { conditions: ConditionText[], bindings: ConditionBinding[], anomalies: Anomaly[] }`.
  1. **Parse.** Each non-empty condition goes through `parseCondition` with a value hook. The hook folds look-alikes
     when the result is ASCII, and reports `look-alike-letter` at the condition's row.
     - The condition gains `parsed` and `printed`.
     - The parse reports `non-canonical-condition` when any form was used, one `free-text-effect` per note, and
       `unparsed-condition` on an error.
  2. **Bind.** Each `(message, naming element)` pair that names a parsed condition is bound. Each null path gives
     `unresolved-condition-path`, once per (condition, message, key).
  3. **Check.** `checkConditionTypes` runs on each binding; its problems become `condition-type-mismatch`, once per
     (condition, message, key, operator).

  Every anomaly sits at the condition's source on the Conditions sheet.
- **Changed:**
  - `importModuleWorkbook` uses it after reading the conditions. `version.conditions` carry `parsed` and `printed`, and
    `version.conditionBindings` holds the bindings.
  - `importSet` appends `linkConditions( module, nomenclatures )` to each module's result when `linked.codeLists` holds.

- [ ] **Step 1: Make the fixture sound, and write the failing tests**

```js
it( "parses, prints and binds the fixture's conditions with no anomaly", () => {
    const result = importModuleWorkbook( { sheets: moduleSheets(), themeColours: {} }, { spec: "e-prescription" } );
    assert.deepEqual( result.anomalies, [] );
    assert.equal( result.version.conditions[ 0 ].printed, "IF 'prescription.category'.value IN ['T2', 'T3']\nTHEN 'prescription.isProtocolBased'.required = 'R'\nELSE 'prescription.isProtocolBased'.required = 'O'" );
    assert.ok( result.version.conditionBindings.every( ( binding ) => Object.values( binding.paths ).every( ( identity ) => identity !== null ) ) );
} );
it( "binds per naming element, and reports a path only where it fails (Review Focus 1)", () => {
    /* one condition named by an element of P001, where '..medication.medicationCode' resolves, and of P002, where it does not:
       two bindings; one unresolved-condition-path, with details.message "P002" */
} );
it( "reports the dialect, a note, an unread condition and a folded value at the condition's row", () => {
    /* "= 'T2' OR 'Т3'": non-canonical-condition (forms "shorthand OR") + look-alike-letter ('Т3' → 'T3');
       a THEN of prose: free-text-effect; an IF with CL006.nhifCode: unparsed-condition; each with sheet "Conditions" and the condition's row */
} );
it( "reports a type mismatch once per message", () => { /* IS true on a String in P001: condition-type-mismatch */ } );
```

In `set-importer.test.js`:

```js
it( "blocks a condition value the set's nomenclatures do not define", async () => { /* nomenclatureSheets( [ "CL007", … ] ) without "T9"; a condition comparing to 'T9' → unknown-condition-value in the module's anomalies */ } );
```

- [ ] **Step 2: Run them to see them fail**

Run: `npm test --workspace=@health-dev-portal/importer`
Expected: FAIL — `#condition-import` cannot be resolved.

- [ ] **Step 3: Implement `importConditions`, and wire it into both importers**

- [ ] **Step 4: Run the suite**

Run: `npm test`
Expected: PASS. e-Prescription's public regression changes by the new condition warnings. Re-pin its tally, after
checking every new figure against §6.9. Expect `non-canonical-condition` on most conditions, because of the shorthand.

- [ ] **Step 5: Commit**

```bash
git add packages/importer packages/spec-model
git commit -m "feat(importer): parse, bind and check every condition on import (HEL-17)"
```

---

### Task 7: The production corpus as regression tests

**Files:**
- Modify: `scripts/fetch-public-fixtures.js` (seven fixtures); `README.md` (the fixtures line)
- Test: `packages/importer/test/public-conditions.test.js`; `packages/importer/test/public-eprescription.test.js`
  (re-pinned in Task 6)

**Interfaces:**
- **Consumes:** everything above.
- **Produces:** `npm run fixtures:fetch` also fetches the seven other production module workbooks, each verified by
  SHA-256:

| File | his.bg upload | Bytes | SHA-256 |
|---|---|---|---|
| `common-services-1.2.2.xlsx` | 378 | 196160 | `af928ef5c8fd6d11009dec2be912cccaa68572e02905ed20e3e0ca27402a4991` |
| `ereferral-1.4.4.xlsx` | 463 | 180885 | `6f704b34dd0fa0e26697f93b827c3b926bea137da2c52b1ad2613357e82808a2` |
| `edental-1.0.7.xlsx` | 548 | 91766 | `29721e399d2b89e01e1bdc54077f44456cd7ff36f3ea46f278e741a1801429de` |
| `eexamination-1.3.10.xlsx` | 594 | 193206 | `7596c537c9ba1274edc1b9ff7fac445b5479e97528bc449cc08fb4544ff7312d` |
| `ehospitalization-1.1.1.xlsx` | 595 | 563171 | `2bd063bffa50ee51c63f5da46cc3b259499467274838054cb7df32669c9f3ab3` |
| `longterm-care-1.0.4.xlsx` | 596 | 252870 | `89d4c9a9e8933a1fafa6cc2b12b064c007d46b135c77192155494497413d3883` |
| `eimmunization-1.2.2.xlsx` | 618 | 102243 | `31a5c1a91aa814ce1c37ae56cac19e66dc9223a9409f0e11d8aa42d266a5ac76` |

Long-term care has no conditions, but it is a production module, and its structure gets the same regression. The URLs
the measurement downloaded, exact copy:

```text
378 https://his.bg/upload/378/%D0%9D%D0%97%D0%98%D0%A1+%D0%9E%D0%B1%D1%89%D0%B8+%D0%9C%D0%B5%D0%B4%D0%B8%D1%86%D0%B8%D0%BD%D1%81%D0%BA%D0%B8+%D0%A3%D1%81%D0%BB%D1%83%D0%B3%D0%B8+-+API+%D0%A1%D0%BF%D0%B5%D1%86%D0%B8%D1%84%D0%B8%D0%BA%D0%B0%D1%86%D0%B8%D1%8F+v1.2.2.xlsx
463 https://his.bg/upload/463/%D0%9D%D0%97%D0%98%D0%A1+%D0%95-%D0%9D%D0%B0%D0%BF%D1%80%D0%B0%D0%B2%D0%BB%D0%B5%D0%BD%D0%B8%D0%B5+-+API+%D0%A1%D0%BF%D0%B5%D1%86%D0%B8%D1%84%D0%B8%D0%BA%D0%B0%D1%86%D0%B8%D1%8F+v1.4.4.xlsx
548 https://his.bg/upload/548/%D0%9D%D0%97%D0%98%D0%A1+%D0%95-%D0%94%D0%B5%D0%BD%D1%82%D0%B0%D0%BB%D0%BD%D0%BE+%D0%BB%D0%B5%D1%87%D0%B5%D0%BD%D0%B8%D0%B5+-+API+%D0%A1%D0%BF%D0%B5%D1%86%D0%B8%D1%84%D0%B8%D0%BA%D0%B0%D1%86%D0%B8%D1%8F+v1.0.7+%281%29.xlsx
594 https://his.bg/upload/594/%D0%9D%D0%97%D0%98%D0%A1+%D0%95-%D0%9F%D1%80%D0%B5%D0%B3%D0%BB%D0%B5%D0%B4+-+API+%D0%A1%D0%BF%D0%B5%D1%86%D0%B8%D1%84%D0%B8%D0%BA%D0%B0%D1%86%D0%B8%D1%8F+v1.3.10.xlsx
595 https://his.bg/upload/595/%D0%9D%D0%97%D0%98%D0%A1+%D0%95-%D0%A5%D0%BE%D1%81%D0%BF%D0%B8%D1%82%D0%B0%D0%BB%D0%B8%D0%B7%D0%B0%D1%86%D0%B8%D1%8F+-+API+%D0%A1%D0%BF%D0%B5%D1%86%D0%B8%D1%84%D0%B8%D0%BA%D0%B0%D1%86%D0%B8%D1%8F+v1.1.1.xlsx
596 https://his.bg/upload/596/%D0%9D%D0%97%D0%98%D0%A1+%D0%94%D1%8A%D0%BB%D0%B3%D0%BE%D1%81%D1%80%D0%BE%D1%87%D0%BD%D0%B0+%D0%B3%D1%80%D0%B8%D0%B6%D0%B0+-+API+%D0%A1%D0%BF%D0%B5%D1%86%D0%B8%D1%84%D0%B8%D0%BA%D0%B0%D1%86%D0%B8%D1%8F+v1.0.4.xlsx
618 https://his.bg/upload/618/%D0%9D%D0%97%D0%98%D0%A1+%D0%95-%D0%98%D0%BC%D1%83%D0%BD%D0%B8%D0%B7%D0%B0%D1%86%D0%B8%D1%8F+-+API+%D0%A1%D0%BF%D0%B5%D1%86%D0%B8%D1%84%D0%B8%D0%BA%D0%B0%D1%86%D0%B8%D1%8F+v1.2.2.xlsx
```

**Expected values**, from §6.9 and the per-module measurement of 2026-10-21. Pin what the run gives, after checking
each figure:

| Module | Conditions | Empty | Expected unread |
|---|---|---|---|
| e-Prescription 1.5.1 | 38 | 2 (CDP09, CDP36) | none; CDP14's THEN is a note |
| Общи медицински услуги 1.2.2 | 23 | 2 | none |
| e-Referral 1.4.4 | 36 | 1 | CDR33 (`unparsed-condition`) |
| e-Dental 1.0.7 | 12 | 8 | none |
| e-Examination 1.3.10 | 29 | 3 | none; CDX28's THEN is a note |
| e-Hospitalization 1.1.1 | 23 | 2 | none |
| Long-term care 1.0.4 | 0 | 0 | — |
| e-Immunization 1.2.2 | 10 | 2 | none |

- **Linked with nomenclatures 1.5.33**, `unknown-condition-value` appears:
  - in Общи медицински услуги: 7 — CDC04, CDC05, CDC06, CDC08, CDC12 on CL028; CDC17 twice on CL022;
  - in e-Referral: 1 — CDR17, on CL022;
  - elsewhere: 0. e-Prescription's CDP08 folds `'Т3'` to the key `'T3'`.
- **`unresolved-condition-path`:** about 340 references in all (§6.9), counted per (condition, message, key) after
  de-duplication. Pin each module's count.

- [ ] **Step 1: Add the fixtures and fetch them**

Run: `npm run fixtures:fetch`
Expected: each of the seven is downloaded with the bytes above; a second run prints `present` for all ten.

- [ ] **Step 2: Write `public-conditions.test.js`**

```js
it( "reads every non-empty production condition but CDR33", () => { /* per module: unparsed-condition ids */ } );
it( "round-trips every production condition: printing then parsing gives it back (Review Focus 4)", () => {
    /* for each parsed condition: parseCondition( printed ).condition deep-equals parsed, with no forms */
} );
it( "prints CDP01, CDR01 and CDH13 in the canonical form", () => { /* exact strings */ } );
it( "blocks exactly the eight values that are not code-list keys (HEL-20)", async () => { /* importSet per module with nomenclatures 1.5.33 */ } );
it( "pins each module's unresolved paths", () => { /* { module: count } deepEqual */ } );
```

- [ ] **Step 3: Run them**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add scripts/fetch-public-fixtures.js packages/importer/test README.md
git commit -m "test(importer): the conditions of all seven production modules as regression tests (HEL-17)"
```

---

## After the last task

1. **Definition of done:** `npm ci && npm run fixtures:fetch && npm run lint && npm test`.
2. **Pull request:** push `feat/plan-3-conditions` and open it against `main`. Move HEL-17 to Review, log the time,
   and name HEL-19 and HEL-20 for the source defects.
3. **Deliberately not done:**
   - entity-name paths, which plan 4 resolves with the XSD types;
   - business rules as expressions (§6.7);
   - the HEL-9 repetition question, whose provisional rules are marked in §6.6;
   - XSD output (plan 4);
   - persistence (plan 5);
   - the message tester (plan 9), which will drive the evaluator.
