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

/**
 * @typedef {Object} SchemaDifference One way two XSDs of a message accept different things (design record §5.5).
 * @property {string} message The message's code.
 * @property {string} path The element's tag path.
 * @property {string|null} attribute The attribute's name, when the difference is in one.
 * @property {string} kind `only-published`, `only-generated`, `kind`, `cardinality`, `order`, `required`, `value-type` or
 *     `fixed`.
 * @property {string|null} published What the published XSD has, in words: `0..1`, the child tags, a value type; `null`
 *     when it has nothing.
 * @property {string|null} generated What the generated XSD has, alike.
 */

/**
 * @typedef {SchemaDifference & {cause: string}} DriftEntry A difference and the cause the report can establish:
 *     `shared-type`, `choice`, `deliberate`, `change-note` or `unexplained` (design record §5.5).
 */

/**
 * The published set's shared files: a particle one of their types declares is part of today's shared types.
 *
 * @type {ReadonlyArray<string>}
 * @public
 */
module.exports.SHARED_FILES = Object.freeze( [ "NHIS-Commons.xsd", "NHIS-Entities.xsd", "NHIS-Fields.xsd", "NHIS-Nomenclatures.xsd" ] );

/**
 * A value type in one line, for a report: its base, then each facet it has.
 *
 * @method
 * @param {import( "#definitions" ).ValueType} value
 * @returns {string} e.g. `string, maxLength 36, pattern [a-zA-Z0-9\- ]+`.
 * @public
 */
module.exports.describeValueType = ( value ) => [
    value.base,
    // A minimum length of 0 accepts what no minimum does; written out, every published note field differed for it.
    ...[ "minInclusive", "maxInclusive", "totalDigits", "fractionDigits", "minLength", "maxLength" ]
        .filter( ( facet ) => value[ facet ] !== null && value[ facet ] !== undefined && !( facet === "minLength" && value[ facet ] === 0 ) )
        .map( ( facet ) => `${ facet } ${ value[ facet ] }` ),
    ...( value.enumeration.length ? [ `enumeration ${ [ ...value.enumeration ].sort().join( " | " ) }` ] : [] ),
    ...[ ...value.patterns ].sort().map( ( pattern ) => `pattern ${ pattern }` )
].join( ", " );

const bounds = ( node ) => `${ node.min }..${ node.max === null ? "*" : node.max }`;

function compareAttributes( code, path, published, generated, out ) {
    const difference = ( attribute, kind, before, after ) => out.push( { message: code, path: path, attribute: attribute, kind: kind, published: before, generated: after } );
    for ( const theirs of published ) {
        const ours = generated.find( ( candidate ) => candidate.name === theirs.name );
        if ( !ours ) {
            continue;
        }
        // Patterns and enumerations are sets, so the description sorts them: their order changes nothing accepted.
        const before = module.exports.describeValueType( theirs.value );
        const after = module.exports.describeValueType( ours.value );
        if ( before !== after ) {
            difference( theirs.name, "value-type", before, after );
        }
        if ( theirs.required !== ours.required ) {
            difference( theirs.name, "required", theirs.required ? "required" : "optional", ours.required ? "required" : "optional" );
        }
        if ( theirs.fixed !== ours.fixed ) {
            difference( theirs.name, "fixed", theirs.fixed, ours.fixed );
        }
    }
    published.filter( ( theirs ) => !generated.some( ( ours ) => ours.name === theirs.name ) )
        .forEach( ( theirs ) => difference( theirs.name, "only-published", "present", null ) );
    generated.filter( ( ours ) => !published.some( ( theirs ) => theirs.name === ours.name ) )
        .forEach( ( ours ) => difference( ours.name, "only-generated", null, "present" ) );
}

function compareNode( code, published, generated, out ) {
    const difference = ( kind, before, after ) => out.push( { message: code, path: published.path, attribute: null, kind: kind, published: before, generated: after } );
    if ( published.kind !== generated.kind ) {
        difference( "kind", published.kind, generated.kind );
        return;
    }
    if ( bounds( published ) !== bounds( generated ) ) {
        difference( "cardinality", bounds( published ), bounds( generated ) );
    }
    compareAttributes( code, published.path, published.attributes, generated.attributes, out );
    const theirs = new Map( published.children.map( ( child ) => [ child.path, child ] ) );
    const ours = new Map( generated.children.map( ( child ) => [ child.path, child ] ) );
    // Order matters on the wire only between elements both have; one only one side has is reported as such.
    const before = published.children.filter( ( child ) => ours.has( child.path ) ).map( ( child ) => child.tag );
    const after = generated.children.filter( ( child ) => theirs.has( child.path ) ).map( ( child ) => child.tag );
    if ( before.join( " " ) !== after.join( " " ) ) {
        difference( "order", before.join( " " ), after.join( " " ) );
    }
    for ( const child of published.children ) {
        if ( ours.has( child.path ) ) {
            compareNode( code, child, ours.get( child.path ), out );
        } else {
            // A missing group is one difference, not one per element under it.
            out.push( { message: code, path: child.path, attribute: null, kind: "only-published", published: child.kind, generated: null } );
        }
    }
    generated.children.filter( ( child ) => !theirs.has( child.path ) )
        .forEach( ( child ) => out.push( { message: code, path: child.path, attribute: null, kind: "only-generated", published: null, generated: child.kind } ) );
}

/**
 * Compares what a published and a generated XSD of one message accept (design record §5.5): the elements and their
 * order, cardinality, and each attribute with its value type, use and fixed value. How a schema is organised — its type
 * names, what it shares — is not compared, nor documentation.
 *
 * @method
 * @param {string} code The message's code.
 * @param {import( "#definitions" ).SchemaNode} published
 * @param {import( "#definitions" ).SchemaNode} generated
 * @returns {SchemaDifference[]} In the published tree's order, an element only the generated side has after its
 *     siblings.
 * @public
 */
module.exports.compareShapes = ( code, published, generated ) => {
    const out = [];
    compareNode( code, published, generated, out );
    return out;
};

const index = ( root ) => {
    const byPath = new Map();
    const visit = ( node ) => {
        byPath.set( node.path, node );
        node.children.forEach( visit );
    };
    visit( root );
    return byPath;
};

// A change note as the workbooks write it: the paths it quotes ("..dentalProcedure.code", "nhifCode") and the messages it
// names (D001, D003). A tag matched as a word anywhere explained 109 differences, 11 of them by notes about other
// messages and 33 by notes about other paths (plan 4's final review).
const noteOf = ( text ) => ( {
    codes: new Set( text.match( /\b[A-Z]\d{3}\b/g ) || [] ),
    paths: [ ...text.matchAll( /"(?:\.\.)?([A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)*)"/g ) ].map( ( match ) => match[ 1 ].split( "." ) )
} );

// A note explains a difference when it names its message, or none, and quotes a path its element's path ends with.
const explains = ( note, difference ) => {
    if ( note.codes.size && !note.codes.has( difference.message ) ) {
        return false;
    }
    const tags = difference.path.split( "/" );
    return note.paths.some( ( segments ) => segments.length <= tags.length && segments.every( ( segment, index ) => tags[ tags.length - segments.length + index ] === segment ) );
};

// Versions compare numerically, part by part: 1.0.10 is after 1.0.6.
const newer = ( version, than ) => {
    const a = String( version ).split( "." ).map( Number );
    const b = String( than ).split( "." ).map( Number );
    for ( let part = 0; part < Math.max( a.length, b.length ); part++ ) {
        if ( ( a[ part ] || 0 ) !== ( b[ part ] || 0 ) ) {
            return ( a[ part ] || 0 ) > ( b[ part ] || 0 );
        }
    }
    return false;
};

/**
 * Gives each difference the cause the report can establish by itself (design record §5.5), the first that applies:
 * - `shared-type`: an element or attribute only the published XSD has, declared by one of the shared files' types —
 *   today's shared types allow fields a message does not list;
 * - `choice`: a cardinality or use that differs on an element inside a published `xs:choice`, which the generated XSD
 *   leaves to the conditions;
 * - `deliberate`: what §4.10 changes on purpose — a coded value typed `xs:int` where the published type is a string,
 *   and a fixed value the published XSD did not have;
 * - `change-note`: across versions, an element whose tag a change note of a version after the published XSD's names;
 * - `unexplained`: anything else, which a person reads.
 *
 * @method
 * @param {SchemaDifference[]} differences
 * @param {{publishedShape: import( "#definitions" ).SchemaNode, generatedShape: import( "#definitions" ).SchemaNode,
 *     publishedVersion: string|null, changeNotes: import( "#definitions" ).ChangeVersion[]}} context
 * @returns {DriftEntry[]}
 * @public
 */
module.exports.explainDifferences = ( differences, context ) => {
    const published = index( context.publishedShape );
    const generated = index( context.generatedShape );
    const later = context.publishedVersion
        ? context.changeNotes.filter( ( version ) => newer( version.version, context.publishedVersion ) ).flatMap( ( version ) => version.notes.map( ( note ) => noteOf( note.text ) ) )
        : [];
    const cause = ( difference ) => {
        const theirs = published.get( difference.path );
        const origin = theirs ? theirs.origin : null;
        // An element is the shared type's that declares it; an attribute is the shared type's that defines its element's
        // type, so H005's own physician still takes nhifCode from NHIS-Fields' qualification. Only what today's type
        // leaves optional is its looseness: a field it requires, as the responses' senderISName, is refused if missing.
        const from = difference.attribute ? origin && origin.typeFile : origin && origin.file;
        const optional = difference.attribute
            ? Boolean( theirs ) && theirs.attributes.some( ( attribute ) => attribute.name === difference.attribute && !attribute.required )
            : Boolean( theirs ) && theirs.min === 0;
        if ( difference.kind === "only-published" && from && module.exports.SHARED_FILES.includes( from ) && optional ) {
            return "shared-type";
        }
        if ( ( difference.kind === "cardinality" || difference.kind === "required" ) && origin && origin.choice ) {
            return "choice";
        }
        if ( difference.kind === "value-type" ) {
            // A coded value is typed by its list's key type alone (§4.10): today's CLxxx string, or a restriction such as
            // nhifCode's two digits, gives way to it on purpose.
            const ours = generated.get( difference.path );
            const attribute = ours ? ours.attributes.find( ( candidate ) => candidate.name === difference.attribute ) : null;
            if ( attribute && attribute.documentation && attribute.documentation.startsWith( "Code list " ) ) {
                return "deliberate";
            }
        }
        if ( difference.kind === "fixed" && difference.published === null && difference.generated !== null ) {
            return "deliberate";
        }
        // An order difference is never a note's: it is a wire difference to read (HEL-26), and notes rarely speak of order.
        if ( difference.kind !== "order" && later.some( ( note ) => explains( note, difference ) ) ) {
            return "change-note";
        }
        return "unexplained";
    };
    return differences.map( ( difference ) => ( { ...difference, cause: cause( difference ) } ) );
};
