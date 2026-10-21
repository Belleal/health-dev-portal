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
 * The evaluator (design record §6.6, §6.7): plain code without I/O, so the message tester can run it in the browser.
 * Where a path repeats below the condition's scope, a comparison holds when it holds for at least one of its
 * occurrences — a provisional rule until the NHIS team confirms how its own validation reads them (HEL-9).
 */

const { EFFECT, OPERATOR, PROPERTY } = require( "#conditions" );
const { operandKey } = require( "#condition-binding" );
const { printBranch, printCondition, printEffect } = require( "#condition-printer" );
const { findColumn } = require( "#links" );

/**
 * @typedef {Object} InstanceNode One XML element of a message: its tag, its attributes and its child elements. The
 *     root's children are `header` and `contents`.
 * @property {string} tag
 * @property {Object<string, string>} attributes
 * @property {InstanceNode[]} children
 */

/**
 * @typedef {Object} Violation An effect a message breaks.
 * @property {string} scope The occurrence, e.g. `contents/prescription/group[2]/medication[1]`, or `(message)`.
 * @property {string} branch `then` or `else`.
 * @property {string} effect The effect printed, or the whole branch when none of its alternatives held.
 * @property {string} reason
 */

const UNKNOWN = Symbol( "unknown" );

const tagsOf = ( identity ) => identity.replace( /[@#].*$/, "" ).split( "/" );

const attributeOf = ( identity ) => ( identity.includes( "@" ) ? identity.split( "@" )[ 1 ].replace( /#.*$/, "" ) : null );

const repeats = ( element ) => Boolean( element ) && Boolean( element.cardinality ) && ( element.cardinality.max === null || element.cardinality.max > 1 );

const NUMBER = /^-?\d+(?:\.\d+)?$/;

const globMatches = ( glob, value ) => new RegExp( `^${ glob.replace( /[.+^${}()|[\]\\]/g, "\\$&" ).replace( /\?/g, "." ).replace( /\*/g, ".*" ) }$`, "u" ).test( value );

function ordered( operator, value, bound ) {
    const both = NUMBER.test( value ) && NUMBER.test( bound );
    const left = both ? Number( value ) : value;
    const right = both ? Number( bound ) : bound;
    switch ( operator ) {
        case OPERATOR.LESS: return left < right;
        case OPERATOR.LESS_OR_EQUAL: return left <= right;
        case OPERATOR.GREATER: return left > right;
        default: return left >= right;
    }
}

// Whether one value passes a test; UNKNOWN when it needs code lists the caller did not give.
function passes( operator, value, test, allowed ) {
    switch ( operator ) {
        case OPERATOR.EQUAL: return value === test.values[ 0 ];
        case OPERATOR.NOT_EQUAL: return value !== test.values[ 0 ];
        case OPERATOR.IN: return allowed ? allowed.has( value ) : test.values.includes( value );
        case OPERATOR.NOT_IN: return allowed ? !allowed.has( value ) : !test.values.includes( value );
        case OPERATOR.MATCHES: return test.values.some( ( glob ) => globMatches( glob, value ) );
        case OPERATOR.NOT_MATCHES: return !test.values.some( ( glob ) => globMatches( glob, value ) );
        case OPERATOR.IS_TRUE: return value === "true";
        case OPERATOR.IS_FALSE: return value === "false";
        default: return ordered( operator, value, test.values[ 0 ] );
    }
}

class Evaluation {

    constructor( condition, binding, root, model, codeLists ) {
        this.condition = condition;
        this.binding = binding;
        this.root = root;
        this.model = model;
        this.codeLists = codeLists || null;
        this.unchecked = [];
    }

    skip( text ) {
        if ( !this.unchecked.includes( text ) ) {
            this.unchecked.push( text );
        }
    }

    identity( operand ) {
        return this.binding.paths[ operandKey( operand ) ];
    }

    // The scope's tag path (§6.6): FOR EACH's, else the deepest repeating element on the common prefix of every bound
    // path; `null` when the condition is judged once over the whole message.
    scopeTags() {
        if ( this.condition.scope ) {
            return tagsOf( this.binding.paths[ operandKey( { path: this.condition.scope, attribute: null } ) ] );
        }
        const prefix = Object.values( this.binding.paths ).map( tagsOf ).reduce( ( common, tags ) => {
            let shared = 0;
            while ( shared < common.length && common[ shared ] === tags[ shared ] ) {
                shared++;
            }
            return common.slice( 0, shared );
        } );
        for ( let length = prefix.length; length > 0; length-- ) {
            if ( repeats( this.model.get( prefix.slice( 0, length ).join( "/" ) ) ) ) {
                return prefix.slice( 0, length );
            }
        }
        return null;
    }

    // Every occurrence of the scope, with its name: a 1-based index on every repeating step.
    occurrences( tags ) {
        let found = [ { node: this.root, label: "" } ];
        tags.forEach( ( tag, depth ) => {
            const repeating = repeats( this.model.get( tags.slice( 0, depth + 1 ).join( "/" ) ) );
            found = found.flatMap( ( { node, label } ) => node.children.filter( ( child ) => child.tag === tag )
                .map( ( child, index ) => ( { node: child, label: `${ label }${ label ? "/" : "" }${ tag }${ repeating ? `[${ index + 1 }]` : "" }` } ) ) );
        } );
        return found;
    }

    // The instance nodes of an identity: under the occurrence when the path lies under the scope, else under the root.
    nodes( identity, occurrence, scope ) {
        const tags = tagsOf( identity );
        const inside = scope && scope.every( ( tag, index ) => tags[ index ] === tag );
        let found = [ inside ? occurrence : this.root ];
        for ( const tag of inside ? tags.slice( scope.length ) : tags ) {
            found = found.flatMap( ( node ) => node.children.filter( ( child ) => child.tag === tag ) );
        }
        return found;
    }

    values( identity, occurrence, scope ) {
        const attribute = attributeOf( identity );
        return this.nodes( identity, occurrence, scope ).map( ( node ) => ( attribute ? node.attributes[ attribute ] : undefined ) ).filter( ( value ) => value !== undefined );
    }

    list( identity ) {
        const element = this.model.get( identity );
        return this.codeLists && element && element.codeList ? this.codeLists.get( element.codeList ) || null : null;
    }

    allowedSet( set ) {
        const list = this.codeLists ? this.codeLists.get( set.list ) : null;
        const column = list ? findColumn( list, set.column ) : -1;
        return column >= 0 ? new Set( list.entries.map( ( entry ) => entry.values[ column ] ).filter( ( value ) => value !== null && value !== undefined ) ) : null;
    }

    // The values a test reads: an element's values, or — for `.entry['…']` — the column of the entries they name.
    operandValues( test, occurrence, scope ) {
        const identity = this.identity( test.operand );
        const values = this.values( identity, occurrence, scope );
        if ( test.operand.property !== PROPERTY.ENTRY ) {
            return values;
        }
        const list = this.list( identity );
        const column = list ? findColumn( list, test.operand.column ) : -1;
        if ( column < 0 ) {
            return UNKNOWN;
        }
        return values.map( ( value ) => list.entries.find( ( entry ) => entry.key === value ) )
            .map( ( entry ) => ( entry ? entry.values[ column ] : null ) ).filter( ( value ) => value !== null && value !== undefined );
    }

    comparison( test, occurrence, scope ) {
        const identity = this.identity( test.operand );
        if ( test.operand.property === PROPERTY.ELEMENT ) {
            const present = this.nodes( identity, occurrence, scope ).length > 0;
            return test.operator === OPERATOR.IS_NOT_NULL ? present : !present;
        }
        if ( test.operand.property !== PROPERTY.VALUE && test.operand.property !== PROPERTY.ENTRY ) {
            return UNKNOWN;
        }
        const values = this.operandValues( test, occurrence, scope );
        const allowed = test.set ? this.allowedSet( test.set ) : null;
        if ( values === UNKNOWN || ( test.set && !allowed ) ) {
            return UNKNOWN;
        }
        if ( test.operator === OPERATOR.IS_NULL ) {
            return values.length === 0;
        }
        if ( test.operator === OPERATOR.IS_NOT_NULL ) {
            return values.length > 0;
        }
        return values.some( ( value ) => passes( test.operator, value, test, allowed ) );
    }

    predicate( predicate, occurrence, scope ) {
        if ( predicate.kind === "comparison" ) {
            const result = this.comparison( predicate, occurrence, scope );
            if ( result === UNKNOWN ) {
                // A comparison prints as the restriction it would be: `'x'.entry['Contagious'] IS NOT null`.
                this.skip( printEffect( { ...predicate, kind: EFFECT.RESTRICT } ) );
            }
            return result;
        }
        if ( predicate.kind === "not" ) {
            const inner = this.predicate( predicate.term, occurrence, scope );
            return inner === UNKNOWN ? UNKNOWN : !inner;
        }
        const results = predicate.terms.map( ( term ) => this.predicate( term, occurrence, scope ) );
        if ( predicate.kind === "and" ) {
            return results.includes( false ) ? false : results.includes( UNKNOWN ) ? UNKNOWN : true;
        }
        return results.includes( true ) ? true : results.includes( UNKNOWN ) ? UNKNOWN : false;
    }

    // Why an effect fails in an occurrence, or `null` when it holds or cannot be judged.
    failure( effect, occurrence, scope ) {
        if ( effect.kind === EFFECT.NOTE ) {
            this.skip( printEffect( effect ) );
            return null;
        }
        const identity = this.identity( effect.operand );
        const nodes = this.nodes( identity, occurrence, scope );
        const attribute = attributeOf( identity );
        const carrying = attribute ? nodes.filter( ( node ) => node.attributes[ attribute ] !== undefined ) : nodes;
        // An effect on `.entry['…']` restricts the column of the entries the values name, not the values themselves
        // (final review: A01, whose Contagious is 1, failed "= '1'"). Without the code lists it cannot be judged.
        const entries = effect.operand.property === PROPERTY.ENTRY ? this.operandValues( effect, occurrence, scope ) : null;
        if ( entries === UNKNOWN ) {
            this.skip( printEffect( effect ) );
            return null;
        }
        switch ( effect.kind ) {
            case EFFECT.REQUIRE:
                return effect.requirement === "R" && carrying.length === 0 ? "must be present" : null;
            case EFFECT.ABSENT:
                if ( entries ) {
                    return entries.length > 0 ? "must be absent" : null;
                }
                return ( effect.operand.property === PROPERTY.ELEMENT ? nodes : carrying ).length > 0 ? "must be absent" : null;
            case EFFECT.CARDINALITY: {
                const { min, max } = effect.cardinality;
                return nodes.length < min || ( max !== null && nodes.length > max )
                    ? `${ nodes.length } occurrence(s), not ${ min }..${ max === null ? "*" : max }` : null;
            }
            case EFFECT.RESTRICT: {
                const allowed = effect.set ? this.allowedSet( effect.set ) : null;
                if ( effect.set && !allowed ) {
                    this.skip( printEffect( effect ) );
                    return null;
                }
                const offending = ( entries || this.values( identity, occurrence, scope ) ).find( ( value ) => !passes( effect.operator, value, effect, allowed ) );
                return offending === undefined ? null : `value '${ offending }' is not allowed`;
            }
            default:
                return null;
        }
    }

    branch( branch, name, occurrence, scope, label ) {
        const outcomes = branch.alternatives.map( ( alternative ) => alternative
            .map( ( effect ) => ( { effect, reason: this.failure( effect, occurrence, scope ) } ) )
            .filter( ( outcome ) => outcome.reason !== null ) );
        if ( outcomes.some( ( failures ) => failures.length === 0 ) ) {
            return [];
        }
        if ( branch.alternatives.length > 1 ) {
            return [ { scope: label, branch: name, effect: printBranch( branch ), reason: "no alternative holds" } ];
        }
        return outcomes[ 0 ].map( ( { effect, reason } ) => ( { scope: label, branch: name, effect: printEffect( effect ), reason } ) );
    }

    run() {
        if ( Object.values( this.binding.paths ).some( ( identity ) => identity === null ) ) {
            return { violations: [], unchecked: [ printCondition( this.condition ) ] };
        }
        const scope = this.scopeTags();
        const occurrences = scope ? this.occurrences( scope ) : [ { node: this.root, label: "(message)" } ];
        const violations = [];
        for ( const { node, label } of occurrences ) {
            const holds = this.predicate( this.condition.predicate, node, scope );
            if ( holds === UNKNOWN ) {
                continue;
            }
            const [ branch, name ] = holds ? [ this.condition.then, "then" ] : [ this.condition.otherwise, "else" ];
            if ( branch ) {
                violations.push( ...this.branch( branch, name, node, scope, label ) );
            }
        }
        return { violations: violations, unchecked: this.unchecked };
    }
}

/**
 * Evaluates a bound condition against a message instance (design record §6.6): once per occurrence of its scope — the
 * FOR EACH path, or by default the innermost repeating element containing all its paths — applying THEN where the
 * predicate holds and ELSE where it does not. A branch holds when one of its alternatives holds in full.
 *
 * What cannot be judged is listed, not guessed: notes; tests on code-list columns without `options.codeLists`; and the
 * whole condition when a path of its binding is unresolved.
 *
 * @method
 * @param {import( "#definitions" ).Condition} condition
 * @param {import( "#condition-binding" ).ConditionBinding} binding
 * @param {InstanceNode} instance The message's root.
 * @param {Map<string, import( "#definitions" ).ElementNode>} model The message's elements by identity.
 * @param {{codeLists?: Map<string, import( "#definitions" ).CodeList>}} [options]
 * @returns {{violations: Violation[], unchecked: string[]}}
 * @public
 */
module.exports.evaluateCondition = ( condition, binding, instance, model, options = {} ) =>
    new Evaluation( condition, binding, instance, model, options.codeLists ).run();
