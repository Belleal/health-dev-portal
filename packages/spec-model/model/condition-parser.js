/*
 * health-dev-portal — the developer portal of the Bulgarian National Health Information System (НЗИС).
 * Copyright © 2026 the health-dev-portal contributors
 *
 * Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the European Commission – subsequent
 * versions of the EUPL (the "Licence"); you may not use this work except in compliance with the Licence.
 * You may obtain a copy of the Licence at:
 *
 *     https://interoperable-europe.ec.europa.eu/collection/eupl/eupl-text-eupl-12
 *
 * Unless required by applicable law or agreed to in writing, software distributed under the Licence is distributed
 * on an "AS IS" basis, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the Licence for the specific language governing permissions and limitations under the Licence.
 *
 * SPDX-License-Identifier: EUPL-1.2
 */

/*
 * The conditions language (design record §6), read by a hand-written recursive-descent parser. It always accepts the
 * looser forms the workbooks write (§6.8) and names each one it met, so one grammar serves the importer, which warns
 * about them, and the studio, which will refuse them (plan 3, Decision 5).
 */

const { EFFECT, OPERATOR, PROPERTY } = require( "#conditions" );

/**
 * The import-dialect forms, in the order a parse result lists them (design record §6.8).
 *
 * @readonly
 * @type {ReadonlyArray<string>}
 * @public
 */
const DIALECT_FORMS = Object.freeze( [ "shorthand OR", "&&", "left side omitted", "unquoted value", "ANY without IS",
    "bare '*' or '..'", "attribute without @", ".value.required", ".content", ".meta[…]", "CLxxx.column",
    "x as a wildcard", "annotation", "missing property" ] );
module.exports.DIALECT_FORMS = DIALECT_FORMS;

const KEYWORDS = new Set( [ "FOR", "EACH", "IF", "THEN", "ELSE", "AND", "OR", "NOT", "IN", "IS", "MATCHES", "NOTE",
    "NULL", "TRUE", "FALSE", "ANY", "THIS" ] );

const RELATIONS = new Set( [ "=", "!=", "<", "<=", ">", ">=" ] );

const LIST_ID = /^CL[A-Z0-9]+$/;

// The workbook's one-character wildcard: a trailing run of lowercase x after a digit or a dot, so 'N80.xx' is a glob
// and 'xml', 'Max' or '1x2' stay values (design record §6.3).
const X_WILDCARD = /([\d.])(x+)$/;

// Clauses start lines (plan 3, Decision 6): a clause that cannot be read never takes its neighbours with it — CDP14's
// prose holds an apostrophe that would otherwise open a string running to the end of the condition.
const CLAUSE = /^\s*(FOR\s+EACH|IF|THEN|ELSE)\b/i;

class ConditionSyntaxError extends Error {}

function splitClauses( text ) {
    const clauses = [];
    for ( const line of text.split( "\n" ) ) {
        const opening = CLAUSE.exec( line );
        if ( opening ) {
            clauses.push( { keyword: opening[ 1 ].toUpperCase().replace( /\s+/, " " ), body: line.slice( opening[ 0 ].length ) } );
        } else if ( clauses.length ) {
            clauses[ clauses.length - 1 ].body += `\n${ line }`;
        } else if ( line.trim() ) {
            throw new ConditionSyntaxError( `text before the IF: "${ line.trim().slice( 0, 30 ) }"` );
        }
    }
    return clauses;
}

const TOKEN = /\s*(?:'((?:[^']|'')*)'|(&&|!=|<=|>=|=|<|>|[[\](),])|\.@([A-Za-z_][\w-]*)|\.([A-Za-z_][\w-]*)|(-?\d+(?:\.\d+)?)|([A-Za-zА-Яа-я_][\w]*))/y;

function tokenize( text ) {
    const tokens = [];
    let at = 0;
    while ( at < text.length ) {
        if ( /^\s*$/.test( text.slice( at ) ) ) {
            break;
        }
        TOKEN.lastIndex = at;
        const match = TOKEN.exec( text );
        if ( !match ) {
            throw new ConditionSyntaxError( `cannot read "${ text.slice( at ).trim().slice( 0, 20 ) }"` );
        }
        at = TOKEN.lastIndex;
        if ( match[ 1 ] !== undefined ) {
            tokens.push( { type: "string", text: match[ 1 ].replace( /''/g, "'" ) } );
        } else if ( match[ 2 ] ) {
            tokens.push( { type: "symbol", text: match[ 2 ] } );
        } else if ( match[ 3 ] ) {
            tokens.push( { type: "attribute", text: match[ 3 ] } );
        } else if ( match[ 4 ] ) {
            tokens.push( { type: "property", text: match[ 4 ] } );
        } else if ( match[ 5 ] ) {
            tokens.push( { type: "number", text: match[ 5 ] } );
        } else {
            const upper = match[ 6 ].toUpperCase();
            tokens.push( KEYWORDS.has( upper ) ? { type: "keyword", text: upper } : { type: "word", text: match[ 6 ] } );
        }
    }
    return tokens;
}

// One clause's tokens, read left to right.
class Reader {

    constructor( text, forms, hook ) {
        this.tokens = tokenize( text );
        this.at = 0;
        this.forms = forms;
        this.hook = hook;
    }

    peek( offset = 0 ) {
        return this.tokens[ this.at + offset ] || null;
    }

    is( type, text, offset = 0 ) {
        const token = this.peek( offset );
        return Boolean( token ) && token.type === type && ( text === undefined || token.text === text );
    }

    take( type, text ) {
        if ( !this.is( type, text ) ) {
            throw new ConditionSyntaxError( `expected ${ text || type } at ${ this.where() }` );
        }
        return this.tokens[ this.at++ ];
    }

    where() {
        const rest = this.tokens.slice( this.at, this.at + 4 ).map( ( token ) => ( token.type === "string" ? `'${ token.text }'` : token.text ) );
        return rest.length ? `"${ rest.join( " " ) }"` : "the end";
    }

    end() {
        if ( this.at < this.tokens.length ) {
            throw new ConditionSyntaxError( `unexpected ${ this.where() }` );
        }
    }

    // A value: quoted, or a number or bare word, which the workbooks also write (CDI04's `1`, CDP35's VF036).
    value() {
        if ( this.is( "string" ) ) {
            return this.hook( this.take( "string" ).text );
        }
        if ( this.is( "number" ) || this.is( "word" ) ) {
            this.forms.add( "unquoted value" );
            return this.hook( this.tokens[ this.at++ ].text );
        }
        throw new ConditionSyntaxError( `expected a value at ${ this.where() }` );
    }

    // Is a value next, and not the path of a new comparison? `OR 'T3'` continues the shorthand; `OR 'b'.value` does not.
    valueAhead( offset ) {
        const token = this.peek( offset );
        if ( !token || ![ "string", "number", "word" ].includes( token.type ) ) {
            return false;
        }
        const after = this.peek( offset + 1 );
        return !after || ( after.type !== "property" && after.type !== "attribute" );
    }

    list() {
        this.take( "symbol", "[" );
        const values = [ this.value() ];
        while ( this.is( "symbol", "," ) ) {
            this.take( "symbol", "," );
            values.push( this.value() );
        }
        this.take( "symbol", "]" );
        return values;
    }

    listColumn() {
        const list = this.take( "word" ).text;
        if ( !LIST_ID.test( list ) ) {
            throw new ConditionSyntaxError( `"${ list }" is not a code list` );
        }
        if ( this.is( "property" ) ) {
            this.forms.add( "CLxxx.column" );
            return { list: list, column: this.take( "property" ).text };
        }
        this.take( "symbol", "[" );
        const column = this.take( "string" ).text;
        this.take( "symbol", "]" );
        return { list: list, column: column };
    }

    // `'BG' (fixed)`: a word in parentheses after a value is a remark, and is dropped.
    annotation() {
        if ( this.is( "symbol", "(" ) && this.is( "word", undefined, 1 ) && this.is( "symbol", ")", 2 ) ) {
            this.at += 3;
            this.forms.add( "annotation" );
        }
    }

    operand() {
        let path;
        if ( this.is( "keyword", "THIS" ) ) {
            this.take( "keyword", "THIS" );
            path = { text: null, self: true };
        } else {
            const text = this.take( "string" ).text;
            if ( text === "*" || text === ".." ) {
                this.forms.add( "bare '*' or '..'" );
                path = { text: null, self: true };
            } else {
                path = { text: text, self: false };
            }
        }
        let attribute = null;
        let property = null;
        let column = null;
        let sawValue = false;
        while ( this.is( "attribute" ) || this.is( "property" ) ) {
            const token = this.tokens[ this.at++ ];
            const name = token.text;
            if ( token.type === "attribute" ) {
                attribute = name;
            } else if ( name === "value" ) {
                sawValue = true;
            } else if ( name === "required" || name === "cardinality" ) {
                if ( sawValue && !attribute ) {
                    this.forms.add( ".value.required" );
                }
                property = name;
            } else if ( name === "content" || name === "contents" ) {
                this.forms.add( ".content" );
                property = PROPERTY.ELEMENT;
            } else if ( name === "meta" || name === "entry" ) {
                if ( name === "meta" ) {
                    this.forms.add( ".meta[…]" );
                }
                this.take( "symbol", "[" );
                column = this.take( "string" ).text;
                this.take( "symbol", "]" );
                property = PROPERTY.ENTRY;
            } else {
                this.forms.add( "attribute without @" );
                attribute = name;
            }
        }
        if ( !property && ( sawValue || attribute ) ) {
            property = PROPERTY.VALUE;
        }
        return { path: path, attribute: attribute, property: property, column: column };
    }

    // A value comparison needs a value property; a path given without one compares its value (CDP35).
    valued( operand ) {
        if ( operand.property === null ) {
            this.forms.add( "missing property" );
            return { ...operand, property: PROPERTY.VALUE };
        }
        return operand;
    }

    // The values of `= v { OR v }`, globs made of the workbook's x, and the operator they amount to.
    relation( operator ) {
        const values = [ this.value() ];
        while ( this.is( "keyword", "OR" ) && this.valueAhead( 1 ) ) {
            this.take( "keyword", "OR" );
            values.push( this.value() );
        }
        if ( values.length > 1 ) {
            if ( operator !== OPERATOR.EQUAL && operator !== OPERATOR.NOT_EQUAL ) {
                throw new ConditionSyntaxError( `"${ operator }" takes one value` );
            }
            this.forms.add( "shorthand OR" );
        }
        let set = operator;
        if ( values.length > 1 ) {
            set = operator === OPERATOR.EQUAL ? OPERATOR.IN : OPERATOR.NOT_IN;
        }
        return this.globbed( set, values );
    }

    globbed( operator, values ) {
        const globs = values.map( ( value ) => value.replace( X_WILDCARD, ( whole, before, run ) => before + "?".repeat( run.length ) ) );
        if ( globs.every( ( glob, index ) => glob === values[ index ] ) ) {
            return { operator: operator, values: values };
        }
        this.forms.add( "x as a wildcard" );
        const negative = operator === OPERATOR.NOT_EQUAL || operator === OPERATOR.NOT_IN;
        return { operator: negative ? OPERATOR.NOT_MATCHES : OPERATOR.MATCHES, values: globs };
    }

    // `[NOT] IN …` and `[NOT] MATCHES …`, after the operand; `null` when neither follows.
    membership() {
        const negated = this.is( "keyword", "NOT" ) && ( this.is( "keyword", "IN", 1 ) || this.is( "keyword", "MATCHES", 1 ) );
        if ( negated ) {
            this.take( "keyword", "NOT" );
        }
        if ( this.is( "keyword", "IN" ) ) {
            this.take( "keyword", "IN" );
            const operator = negated ? OPERATOR.NOT_IN : OPERATOR.IN;
            if ( this.is( "word" ) ) {
                return { operator: operator, values: [], set: this.listColumn() };
            }
            return { ...this.globbed( operator, this.list() ), set: null };
        }
        if ( this.is( "keyword", "MATCHES" ) ) {
            this.take( "keyword", "MATCHES" );
            return { operator: negated ? OPERATOR.NOT_MATCHES : OPERATOR.MATCHES, values: this.is( "symbol", "[" ) ? this.list() : [ this.value() ], set: null };
        }
        return null;
    }

    comparison( previous ) {
        let operand;
        if ( this.is( "symbol" ) && RELATIONS.has( this.peek().text ) ) {
            // `!= '01.01' AND != '01.04'`: the left side is the previous comparison's (CDX26, CDX28).
            if ( !previous ) {
                throw new ConditionSyntaxError( `a comparison has no left side at ${ this.where() }` );
            }
            this.forms.add( "left side omitted" );
            operand = previous;
        } else {
            operand = this.operand();
        }
        let result;
        if ( this.is( "keyword", "IS" ) ) {
            this.take( "keyword", "IS" );
            const negated = this.is( "keyword", "NOT" ) ? Boolean( this.take( "keyword", "NOT" ) ) : false;
            const word = this.take( "keyword" ).text;
            const UNARY = { NULL: negated ? OPERATOR.IS_NOT_NULL : OPERATOR.IS_NULL, TRUE: OPERATOR.IS_TRUE, FALSE: OPERATOR.IS_FALSE };
            if ( !UNARY[ word ] || ( negated && word !== "NULL" ) ) {
                throw new ConditionSyntaxError( `IS ${ negated ? "NOT " : "" }${ word } is not a test` );
            }
            const target = word === "NULL" && operand.property === null ? { ...operand, property: PROPERTY.ELEMENT } : operand;
            result = { kind: "comparison", operand: word === "NULL" ? target : this.valued( target ), operator: UNARY[ word ], values: [], set: null };
        } else {
            const member = this.membership();
            if ( member ) {
                result = { kind: "comparison", operand: this.valued( operand ), ...member };
            } else {
                const relation = this.take( "symbol" ).text;
                if ( !RELATIONS.has( relation ) ) {
                    throw new ConditionSyntaxError( `"${ relation }" is not an operator` );
                }
                result = { kind: "comparison", operand: this.valued( operand ), ...this.relation( relation ), set: null };
            }
        }
        this.annotation();
        return result;
    }

    predicate() {
        const terms = [ this.conjunction() ];
        while ( this.is( "keyword", "OR" ) ) {
            this.take( "keyword", "OR" );
            terms.push( this.conjunction() );
        }
        return terms.length === 1 ? terms[ 0 ] : { kind: "or", terms: terms };
    }

    conjunction() {
        const terms = [ this.unary( null ) ];
        while ( this.is( "keyword", "AND" ) || this.is( "symbol", "&&" ) ) {
            if ( this.is( "symbol", "&&" ) ) {
                this.forms.add( "&&" );
            }
            this.at++;
            const last = terms[ terms.length - 1 ];
            terms.push( this.unary( last.kind === "comparison" ? last.operand : null ) );
        }
        return terms.length === 1 ? terms[ 0 ] : { kind: "and", terms: terms };
    }

    unary( previous ) {
        if ( this.is( "keyword", "NOT" ) ) {
            this.take( "keyword", "NOT" );
            return { kind: "not", term: this.unary( null ) };
        }
        if ( this.is( "symbol", "(" ) ) {
            this.take( "symbol", "(" );
            const inner = this.predicate();
            this.take( "symbol", ")" );
            return inner;
        }
        return this.comparison( previous );
    }

    branch() {
        const alternatives = [ this.alternative() ];
        while ( this.is( "keyword", "OR" ) ) {
            this.take( "keyword", "OR" );
            alternatives.push( this.alternative() );
        }
        return { alternatives: alternatives };
    }

    alternative() {
        const effects = this.effectTerm();
        while ( this.is( "keyword", "AND" ) || this.is( "symbol", "&&" ) ) {
            if ( this.is( "symbol", "&&" ) ) {
                this.forms.add( "&&" );
            }
            this.at++;
            effects.push( ...this.effectTerm() );
        }
        return effects;
    }

    effectTerm() {
        if ( this.is( "symbol", "(" ) ) {
            this.take( "symbol", "(" );
            const effects = this.alternative();
            this.take( "symbol", ")" );
            return effects;
        }
        if ( this.is( "keyword", "NOTE" ) ) {
            this.take( "keyword", "NOTE" );
            return [ { kind: EFFECT.NOTE, text: this.take( "string" ).text } ];
        }
        return [ this.effect() ];
    }

    effect() {
        const operand = this.operand();
        let effect;
        if ( this.is( "keyword", "IS" ) ) {
            this.take( "keyword", "IS" );
            const word = this.take( "keyword" ).text;
            if ( word === "NULL" ) {
                effect = { kind: EFFECT.ABSENT, operand: operand.property === null ? { ...operand, property: PROPERTY.ELEMENT } : operand };
            } else if ( word === "ANY" ) {
                effect = { kind: EFFECT.ANY, operand: this.valued( operand ) };
            } else if ( word === "TRUE" || word === "FALSE" ) {
                // "Must be true" (CDP38): a restriction by a test.
                effect = { kind: EFFECT.RESTRICT, operand: this.valued( operand ), operator: word === "TRUE" ? OPERATOR.IS_TRUE : OPERATOR.IS_FALSE, values: [], set: null };
            } else {
                throw new ConditionSyntaxError( `IS ${ word } is not an effect` );
            }
        } else if ( this.is( "symbol", "=" ) && this.is( "keyword", "ANY", 1 ) ) {
            this.at += 2;
            this.forms.add( "ANY without IS" );
            effect = { kind: EFFECT.ANY, operand: this.valued( operand ) };
        } else if ( operand.property === PROPERTY.REQUIRED ) {
            this.take( "symbol", "=" );
            const requirement = this.value();
            if ( requirement !== "R" && requirement !== "O" ) {
                throw new ConditionSyntaxError( `"${ requirement }" is not a requirement an effect can set` );
            }
            effect = { kind: EFFECT.REQUIRE, operand: operand, requirement: requirement };
        } else if ( operand.property === PROPERTY.CARDINALITY ) {
            this.take( "symbol", "=" );
            effect = { kind: EFFECT.CARDINALITY, operand: operand, cardinality: readCardinality( this.value() ) };
        } else {
            const member = this.membership();
            if ( member ) {
                effect = { kind: EFFECT.RESTRICT, operand: this.valued( operand ), ...member };
            } else {
                // Every relation restricts: "must be above 1" (CDI09) as well as "must be '2'".
                const relation = this.take( "symbol" ).text;
                if ( !RELATIONS.has( relation ) ) {
                    throw new ConditionSyntaxError( `"${ relation }" is not an operator` );
                }
                effect = { kind: EFFECT.RESTRICT, operand: this.valued( operand ), ...this.relation( relation ), set: null };
            }
        }
        this.annotation();
        return effect;
    }
}

// The cardinality rules of the importer's cells, repeated here because spec-model depends on nothing: 'min..max',
// where max is a number, '*', or missing ('5..', open above).
function readCardinality( text ) {
    const match = /^(\d+)\s*\.\.\s*(\d+|\*)?$/.exec( text.trim() );
    if ( !match ) {
        throw new ConditionSyntaxError( `"${ text }" is not a cardinality` );
    }
    return { min: Number( match[ 1 ] ), max: match[ 2 ] === undefined || match[ 2 ] === "*" ? null : Number( match[ 2 ] ) };
}

function readScope( body, forms, hook ) {
    const reader = new Reader( body, forms, hook );
    const operand = reader.operand();
    reader.end();
    return operand.path;
}

function readPredicate( body, forms, hook ) {
    const reader = new Reader( body, forms, hook );
    const predicate = reader.predicate();
    reader.end();
    return predicate;
}

// A branch that cannot be read is kept whole, as prose (design record §6.8). Forms its failed reading met are not
// reported: they belong to text the language does not read.
function readBranch( body, forms, hook, notes ) {
    const met = new Set();
    try {
        const reader = new Reader( body, met, hook );
        const branch = reader.branch();
        reader.end();
        met.forEach( ( form ) => forms.add( form ) );
        return branch;
    } catch ( error ) {
        if ( !( error instanceof ConditionSyntaxError ) ) {
            throw error;
        }
        const text = body.trim();
        notes.push( text );
        return { alternatives: [ [ { kind: EFFECT.NOTE, text: text } ] ] };
    }
}

/**
 * Reads a condition (design record §6), in the canonical form or in the workbooks' import dialect (§6.8).
 *
 * The result names each dialect form the text used, keeps a THEN or ELSE clause it cannot read as a `NOTE`, and leaves
 * the condition unread — `condition` is `null` and `error` says why — when the IF or FOR EACH clause cannot be read.
 *
 * @method
 * @param {string} text
 * @param {{value?: function( string ): string}} [options] `value` receives every value — compared values, requirement
 *     letters, cardinalities, never note text — and returns the one to use: the importer folds look-alikes here.
 * @returns {{condition: import( "#definitions" ).Condition|null, forms: string[], notes: string[], error: string|null}}
 * @public
 */
module.exports.parseCondition = ( text, options = {} ) => {
    const hook = options.value || ( ( value ) => value );
    const forms = new Set();
    const notes = [];
    const unread = ( error ) => ( { condition: null, forms: [], notes: [], error: error } );
    try {
        const clauses = splitClauses( text || "" );
        const find = ( keyword ) => clauses.filter( ( clause ) => clause.keyword === keyword );
        for ( const keyword of [ "FOR EACH", "IF", "THEN", "ELSE" ] ) {
            if ( find( keyword ).length > 1 ) {
                return unread( `two ${ keyword } clauses` );
            }
        }
        if ( clauses.length === 0 ) {
            return unread( "the condition is empty" );
        }
        const [ scopeClause ] = find( "FOR EACH" );
        const [ ifClause ] = find( "IF" );
        const [ thenClause ] = find( "THEN" );
        const [ elseClause ] = find( "ELSE" );
        if ( !ifClause ) {
            return unread( "there is no IF clause" );
        }
        if ( !thenClause ) {
            return unread( "there is no THEN clause" );
        }
        const condition = {
            scope: scopeClause ? readScope( scopeClause.body, forms, hook ) : null,
            predicate: readPredicate( ifClause.body, forms, hook ),
            then: readBranch( thenClause.body, forms, hook, notes ),
            otherwise: elseClause ? readBranch( elseClause.body, forms, hook, notes ) : null
        };
        return { condition: condition, forms: DIALECT_FORMS.filter( ( form ) => forms.has( form ) ), notes: notes, error: null };
    } catch ( error ) {
        if ( error instanceof ConditionSyntaxError ) {
            return unread( error.message );
        }
        throw error;
    }
};
