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

const { createAnomaly } = require( "@health-dev-portal/spec-model/anomalies" );
const { deepFreeze } = require( "@health-dev-portal/spec-model/freeze" );
const { isValidPart, joinPath, withAttribute, withVariant } = require( "@health-dev-portal/spec-model/identity" );
const { ELEMENT_KIND } = require( "@health-dev-portal/spec-model/kinds" );
const { validateMessageTree } = require( "@health-dev-portal/spec-model/validation" );
const { cellAt, columnMap, findRow } = require( "#raw" );
const { isNone, noneToNull, parseCardinality, parseConstraint, parseReferenceList, parseRequirement } = require( "#cells" );
const { findMixedScriptWords, foldLookAlikes } = require( "#scripts" );
const { END_FILLS, NEUTRAL_FILLS, ROW_FILLS, matchLegend } = require( "#legend" );

const COLUMNS = Object.freeze( {
    name: "Name",
    requirement: "R/C/O",
    cardinality: "Cardinality",
    dataType: "Data types",
    constraint: "Constraint",
    fixedValue: "Fixed Value",
    defaultValue: "Default Value",
    rules: "Rules",
    conditions: "Conditions",
    codeList: "Code Lists",
    tag: "Field Name / Tag",
    attribute: "Attribute"
} );

const DESCRIPTION_HEADER = /^Описание/;
// Case-sensitive on purpose: "End of Period" is a real field in P001, P004, P011 and P018 (Review Focus 3).
const END_ROW = /^END of\s+(.+)$/;
const LEADING_STARS = /^\*+/;
const DEFAULT_ATTRIBUTE = "value";
// Folding catches look-alikes only; a tag holding any other non-Latin letter (a Cyrillic к, a Bulgarian word) would
// publish a tag NHIS never sends. Space is left to isValidPart, which refuses it as invalid-tag.
const NOT_LATIN = /[^\x20-\x7E]/;
// The columns that make a row an element: a row with any of them and no name would vanish from the tree.
const ELEMENT_COLUMNS = Object.freeze( [ "requirement", "cardinality", "dataType", "tag" ] );

function mapColumns( header, sheetName, anomalies ) {
    const titles = columnMap( header );
    const columns = {};
    let complete = true;
    for ( const [ key, title ] of Object.entries( COLUMNS ) ) {
        if ( titles.has( title ) ) {
            columns[ key ] = titles.get( title );
        } else {
            complete = false;
            anomalies.push( createAnomaly( "missing-column", { sheet: sheetName, row: header.number }, { column: title } ) );
        }
    }
    const description = [ ...titles.entries() ].find( ( [ title ] ) => DESCRIPTION_HEADER.test( title ) );
    columns.description = description ? description[ 1 ] : null;
    return complete ? columns : null;
}

function kindOf( fill, source, anomalies ) {
    if ( fill === null || matchLegend( fill, NEUTRAL_FILLS ) ) {
        return ELEMENT_KIND.FIELD;
    }
    const kind = matchLegend( fill, ROW_FILLS );
    if ( kind ) {
        return kind;
    }
    anomalies.push( createAnomaly( matchLegend( fill, END_FILLS ) ? "end-fill-on-data-row" : "unknown-fill", source, { colour: fill } ) );
    return ELEMENT_KIND.FIELD;
}

// A tag or attribute must be Latin and a valid identity part; reports which rule it breaks.
function checkPart( value, source, anomalies ) {
    if ( NOT_LATIN.test( value ) ) {
        anomalies.push( createAnomaly( "non-latin-tag", source, { tag: value } ) );
        return false;
    }
    if ( !isValidPart( value ) ) {
        anomalies.push( createAnomaly( "invalid-tag", source, { tag: value } ) );
        return false;
    }
    return true;
}

function readRow( row, columns, source, anomalies ) {
    const at = ( key ) => ( { ...source, column: columns[ key ] } );
    const text = ( key ) => cellAt( row, columns[ key ] ).text;
    // Code columns only: a look-alike letter is folded, and the fold is reported (HEL-12).
    const code = ( key ) => {
        const { folded, letters } = foldLookAlikes( text( key ) );
        if ( letters.length ) {
            anomalies.push( createAnomaly( "look-alike-letter", at( key ), { value: text( key ), letters: letters.join( ", " ), folded: folded } ) );
        }
        return folded;
    };
    const requirementText = code( "requirement" );
    const cardinalityText = code( "cardinality" );
    const tagText = code( "tag" );
    // A name and nothing else is a note typed into the sheet, not an element; reading it as one would block the import
    // on an invalid requirement (Review Focus 2).
    if ( !requirementText && !cardinalityText && isNone( tagText ) ) {
        anomalies.push( createAnomaly( "note-row", at( "name" ), { text: text( "name" ) } ) );
        return null;
    }

    const nameCell = cellAt( row, columns.name );
    const kind = kindOf( nameCell.fill, at( "name" ), anomalies );
    const stars = LEADING_STARS.exec( nameCell.text );
    if ( stars && ( kind !== ELEMENT_KIND.GROUP || stars[ 0 ].length !== nameCell.indent ) ) {
        anomalies.push( createAnomaly( "asterisks-disagree", at( "name" ), { stars: stars[ 0 ].length, depth: nameCell.indent } ) );
    }
    const name = nameCell.text.replace( LEADING_STARS, "" ).trim();
    for ( const word of findMixedScriptWords( name ) ) {
        anomalies.push( createAnomaly( "mixed-script-word", at( "name" ), { word: word } ) );
    }

    const requirement = parseRequirement( requirementText );
    if ( requirement === null ) {
        anomalies.push( createAnomaly( "invalid-requirement", at( "requirement" ), { value: requirementText } ) );
    }
    const cardinality = parseCardinality( cardinalityText );
    if ( cardinality === null ) {
        anomalies.push( createAnomaly( "invalid-cardinality", at( "cardinality" ), { value: cardinalityText } ) );
    }
    const dataType = noneToNull( text( "dataType" ) );
    const { constraint, unparsed } = parseConstraint( text( "constraint" ), dataType );
    for ( const token of unparsed ) {
        anomalies.push( createAnomaly( "unparsed-constraint", at( "constraint" ), { token: token } ) );
    }
    const references = ( key, kindName ) => {
        const { values, invalid } = parseReferenceList( code( key ), kindName );
        for ( const value of invalid ) {
            anomalies.push( createAnomaly( "invalid-reference", at( key ), { value: value, kind: kindName } ) );
        }
        return values;
    };
    const fixedValue = noneToNull( code( "fixedValue" ) );
    const defaultValue = noneToNull( code( "defaultValue" ) );
    const rules = references( "rules", "rule" );
    const conditions = references( "conditions", "condition" );
    const codeLists = references( "codeList", "codeList" );
    if ( codeLists.length > 1 ) {
        anomalies.push( createAnomaly( "multiple-code-lists", at( "codeList" ), { values: codeLists.join( ", " ) } ) );
    }

    return {
        identity: null,
        path: null,
        depth: nameCell.indent,
        kind: kind,
        name: { bg: null, en: name },
        requirement: requirement,
        cardinality: cardinality,
        dataType: dataType,
        constraint: constraint,
        fixedValue: fixedValue,
        defaultValue: defaultValue,
        rules: rules,
        conditions: conditions,
        codeList: codeLists[ 0 ] || null,
        tag: noneToNull( tagText ),
        attribute: noneToNull( code( "attribute" ) ),
        description: { bg: columns.description ? noneToNull( cellAt( row, columns.description ).text ) : null, en: null },
        source: source,
        children: []
    };
}

// Indentation decides placement; a row deeper than its parent plus one cannot be placed and blocks the import.
function place( node, roots, open, source, anomalies ) {
    while ( open.length && open[ open.length - 1 ].depth >= node.depth ) {
        open.pop();
    }
    const parent = open[ open.length - 1 ] || null;
    if ( node.depth === 0 ) {
        roots.push( node );
    } else if ( parent && parent.depth === node.depth - 1 ) {
        parent.children.push( node );
    } else {
        anomalies.push( createAnomaly( "depth-jump", source, { depth: node.depth, parentDepth: parent ? parent.depth : "none" } ) );
        ( parent ? parent.children : roots ).push( node );
    }
    open.push( node );
}

// END rows only confirm what indentation already decided; not every group has one, and many shorten the group's name
// ("END of Verification" closes "Verification Code" in P005) — so a mismatch is a warning and changes nothing.
function closeGroup( open, name, source, anomalies ) {
    const target = name.replace( LEADING_STARS, "" ).trim().toLowerCase();
    for ( let index = open.length - 1; index >= 0; index-- ) {
        if ( open[ index ].kind === ELEMENT_KIND.GROUP && open[ index ].name.en.toLowerCase() === target ) {
            open.length = index;
            return;
        }
    }
    anomalies.push( createAnomaly( "unexpected-end-row", source, { name: name } ) );
}

function identify( nodes, parentPath, parentField, anomalies ) {
    for ( const node of nodes ) {
        if ( node.kind === ELEMENT_KIND.POLYMORPHIC ) {
            // Variants are fields at the polymorphic element's own level; they share a tag, so they are numbered.
            identify( node.children, parentPath, null, anomalies );
            node.children.forEach( ( variant, index ) => {
                if ( variant.identity ) {
                    variant.identity = withVariant( variant.identity, index + 1 );
                }
            } );
            const first = node.children.find( ( variant ) => variant.path );
            node.path = first ? first.path : null;
            node.identity = first ? withAttribute( first.path, first.attribute || DEFAULT_ATTRIBUTE ) : null;
            continue;
        }
        if ( node.kind === ELEMENT_KIND.ATTRIBUTE ) {
            if ( !parentField ) {
                anomalies.push( createAnomaly( "attribute-without-field", node.source ) );
                continue;
            }
            if ( node.tag && node.tag !== parentField.tag ) {
                anomalies.push( createAnomaly( "attribute-tag-mismatch", node.source, { tag: node.tag, fieldTag: parentField.tag } ) );
            }
            const attribute = node.attribute || DEFAULT_ATTRIBUTE;
            if ( !checkPart( attribute, node.source, anomalies ) ) {
                continue;
            }
            node.path = parentField.path;
            node.identity = withAttribute( parentField.path, attribute );
            continue;
        }
        if ( !node.tag ) {
            anomalies.push( createAnomaly( "missing-tag", node.source ) );
            continue;
        }
        if ( !checkPart( node.tag, node.source, anomalies ) ) {
            continue;
        }
        node.path = joinPath( parentPath, node.tag );
        if ( node.kind === ELEMENT_KIND.GROUP ) {
            node.identity = node.path;
            identify( node.children, node.path, null, anomalies );
            continue;
        }
        const attribute = node.attribute || DEFAULT_ATTRIBUTE;
        if ( !checkPart( attribute, node.source, anomalies ) ) {
            continue;
        }
        node.identity = withAttribute( node.path, attribute );
        identify( node.children, node.path, node, anomalies );
    }
}

/**
 * Builds a message's element tree from its sheet and reports every anomaly at its row (design record §5.3).
 *
 * @method
 * @param {import( "#workbook-reader" ).RawSheet} sheet
 * @returns {{elements: import( "@health-dev-portal/spec-model/definitions" ).ElementNode[], anomalies: import( "@health-dev-portal/spec-model/definitions" ).Anomaly[]}}
 * @public
 */
module.exports.buildMessageTree = ( sheet ) => {
    const anomalies = [];
    const header = findRow( sheet, ( row ) => cellAt( row, 1 ).text === COLUMNS.name );
    if ( !header ) {
        anomalies.push( createAnomaly( "missing-header-row", { sheet: sheet.name } ) );
        return { elements: [], anomalies: anomalies };
    }
    const columns = mapColumns( header, sheet.name, anomalies );
    if ( !columns ) {
        return { elements: [], anomalies: anomalies };
    }

    const roots = [];
    const open = [];
    for ( const row of sheet.rows ) {
        if ( row.number <= header.number ) {
            continue;
        }
        const name = cellAt( row, columns.name ).text;
        const source = { sheet: sheet.name, row: row.number };
        if ( !name ) {
            // A row with element values and no name would vanish without a word (final review); 0 such rows in 1.5.1.
            if ( ELEMENT_COLUMNS.some( ( key ) => cellAt( row, columns[ key ] ).text ) ) {
                anomalies.push( createAnomaly( "missing-name", source ) );
            }
            continue;
        }
        // An END row is the capitalised marker with nothing else on the row; a field always has R/C/O and a tag.
        const end = END_ROW.exec( name );
        if ( end && !cellAt( row, columns.requirement ).text && isNone( cellAt( row, columns.tag ).text ) ) {
            closeGroup( open, end[ 1 ], source, anomalies );
            continue;
        }
        const node = readRow( row, columns, source, anomalies );
        if ( node ) {
            place( node, roots, open, source, anomalies );
        }
    }
    identify( roots, "", null, anomalies );
    anomalies.push( ...validateMessageTree( roots ) );
    return { elements: deepFreeze( roots ), anomalies: anomalies };
};
