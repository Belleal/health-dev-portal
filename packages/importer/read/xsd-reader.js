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

const { SaxesParser } = require( "saxes" );
const { SHARED_FILES } = require( "@health-dev-portal/spec-model/schema-compare" );

/**
 * @typedef {Object} XsdElement One element of a parsed XSD.
 * @property {string} name The local name, without its prefix: `complexType`, `element`, `attribute`, …
 * @property {Object<string, string>} attributes As written, prefixes included.
 * @property {XsdElement[]} children
 * @property {string} text
 */

/**
 * @typedef {Object} XsdType A top-level type and the file that defines it.
 * @property {XsdElement} node
 * @property {string} file
 */

/**
 * @typedef {Object} XsdMessage One message file of the set.
 * @property {string} code e.g. `P001`.
 * @property {string} file e.g. `NHIS-P001.xsd`.
 * @property {string|null} version The schema's `version` attribute: the module version it was cut at.
 * @property {XsdElement} root The schema element.
 * @property {Map<string, XsdType>} types The file's own top-level types.
 */

/**
 * @typedef {Object} XsdSet A published XSD set: the shared files' types, and each message file.
 * @property {Map<string, XsdType>} shared
 * @property {Map<string, XsdMessage>} messages By code.
 */

/**
 * The files whose types every message includes (design record §5.8). Defined beside the drift report, which tells a
 * shared type's looseness by them.
 *
 * @type {ReadonlyArray<string>}
 * @public
 */
module.exports.SHARED_FILES = SHARED_FILES;

const MESSAGE_FILE = /^NHIS-([A-Z]\d{3})\.xsd$/;

/**
 * An XSD that cannot be read: malformed, or carrying a DOCTYPE.
 *
 * @public
 */
class UnreadableSchemaError extends Error {
    constructor( message, options ) {
        super( message, options );
        this.name = "UnreadableSchemaError";
    }
}
module.exports.UnreadableSchemaError = UnreadableSchemaError;

const localName = ( name ) => ( name || "" ).replace( /^[^:]*:/, "" );

/**
 * Parses an XSD into a plain tree. A DOCTYPE is refused outright: an XSD needs none, and a DTD is where external
 * entities live (design record §10.1). Nothing is ever fetched.
 *
 * @method
 * @param {string} text
 * @param {string} fileName Named in the error.
 * @returns {XsdElement} The document element.
 * @throws {UnreadableSchemaError} "Cannot read <file>: …".
 * @public
 */
module.exports.parseXsd = ( text, fileName ) => {
    const parser = new SaxesParser( { xmlns: false } );
    const top = { name: "#document", attributes: {}, children: [], text: "" };
    const stack = [ top ];
    parser.on( "doctype", () => {
        throw new Error( "a DOCTYPE is not allowed in an XSD" );
    } );
    parser.on( "opentag", ( tag ) => {
        const node = { name: localName( tag.name ), attributes: { ...tag.attributes }, children: [], text: "" };
        stack[ stack.length - 1 ].children.push( node );
        stack.push( node );
    } );
    parser.on( "text", ( value ) => {
        stack[ stack.length - 1 ].text += value;
    } );
    parser.on( "cdata", ( value ) => {
        stack[ stack.length - 1 ].text += value;
    } );
    parser.on( "closetag", () => {
        stack.pop();
    } );
    try {
        parser.write( text ).close();
    } catch ( error ) {
        throw new UnreadableSchemaError( `Cannot read ${ fileName }: ${ error.message }`, { cause: error } );
    }
    if ( top.children.length !== 1 ) {
        throw new UnreadableSchemaError( `Cannot read ${ fileName }: no document element.` );
    }
    return top.children[ 0 ];
};

const childNamed = ( node, name ) => node.children.find( ( candidate ) => candidate.name === name ) || null;
const topLevelTypes = ( schema, file ) => new Map( schema.children
    .filter( ( candidate ) => ( candidate.name === "complexType" || candidate.name === "simpleType" ) && candidate.attributes.name )
    .map( ( candidate ) => [ candidate.attributes.name, { node: candidate, file: file } ] ) );

/**
 * Reads a published XSD set: the shared files' types, and each message file with its own types. Any other file —
 * xmldsig's schema, say — is neither parsed nor indexed.
 *
 * @method
 * @param {Array<{name: string, text: string}>} files
 * @returns {XsdSet}
 * @throws {UnreadableSchemaError} For a shared or message file that cannot be read.
 * @public
 */
module.exports.readXsdSet = ( files ) => {
    const shared = new Map();
    const messages = new Map();
    for ( const file of files ) {
        const code = MESSAGE_FILE.exec( file.name );
        if ( module.exports.SHARED_FILES.includes( file.name ) ) {
            for ( const [ name, type ] of topLevelTypes( module.exports.parseXsd( file.text, file.name ), file.name ) ) {
                shared.set( name, type );
            }
        } else if ( code ) {
            const root = module.exports.parseXsd( file.text, file.name );
            messages.set( code[ 1 ], { code: code[ 1 ], file: file.name, version: root.attributes.version || null, root: root,
                types: topLevelTypes( root, file.name ) } );
        }
    }
    return { shared: shared, messages: messages };
};

const EMPTY_FACETS = Object.freeze( { minLength: null, maxLength: null, patterns: [], minInclusive: null, maxInclusive: null, enumeration: [],
    totalDigits: null, fractionDigits: null } );

// A restriction's facets over its base's: patterns accumulate, as XSD ANDs them across derivation steps, and every
// other facet takes the nearest definition.
function restrict( base, restriction ) {
    const value = { ...base, patterns: [ ...base.patterns ], enumeration: [] };
    for ( const facet of restriction.children ) {
        const given = facet.attributes.value;
        switch ( facet.name ) {
            case "length":
                value.minLength = Number( given );
                value.maxLength = Number( given );
                break;
            case "minLength":
            case "maxLength":
            case "totalDigits":
            case "fractionDigits":
                value[ facet.name ] = Number( given );
                break;
            case "minInclusive":
            case "maxInclusive":
                value[ facet.name ] = given;
                break;
            case "pattern":
                value.patterns.push( given );
                break;
            case "enumeration":
                value.enumeration.push( given );
                break;
            default:
                break;
        }
    }
    if ( value.enumeration.length === 0 ) {
        value.enumeration = [ ...base.enumeration ];
    }
    return value;
}

/**
 * Resolves a value type, named or inline, to its built-in base and facets.
 *
 * @param {string|null} name A type reference such as `xs:string` or `nhis:CL001`.
 * @param {XsdElement|null} inline An inline `simpleType`.
 * @param {function( string ): XsdType|null} lookup
 * @param {Set<string>} [seen]
 * @returns {import( "@health-dev-portal/spec-model/definitions" ).ValueType}
 */
function valueType( name, inline, lookup, seen = new Set() ) {
    const node = inline || ( name && lookup( localName( name ) ) ? lookup( localName( name ) ).node : null );
    if ( !node || seen.has( node ) ) {
        // A built-in, or a name the set does not define: its local name is the base.
        return { base: name ? localName( name ) : "string", ...EMPTY_FACETS, patterns: [], enumeration: [] };
    }
    seen.add( node );
    const restriction = childNamed( node, "restriction" );
    if ( !restriction ) {
        // A union or a list: nothing the NHIS files use for an attribute value.
        return { base: "string", ...EMPTY_FACETS, patterns: [], enumeration: [] };
    }
    const base = valueType( restriction.attributes.base || null, childNamed( restriction, "simpleType" ), lookup, seen );
    return restrict( base, restriction );
}

const documentationOf = ( node ) => {
    const annotation = childNamed( node, "annotation" );
    return annotation ? annotation.children.filter( ( candidate ) => candidate.name === "documentation" ) : [];
};

function elementDocumentation( node ) {
    const texts = documentationOf( node );
    if ( texts.length === 0 ) {
        return null;
    }
    const of = ( language ) => {
        const found = texts.find( ( text ) => ( text.attributes[ "xml:lang" ] || "bg" ) === language );
        return found ? found.text.trim() : null;
    };
    return { bg: of( "bg" ), en: of( "en" ) };
}

function attributeOf( node, lookup ) {
    const texts = documentationOf( node );
    return {
        name: node.attributes.name,
        required: node.attributes.use === "required",
        value: valueType( node.attributes.type || null, childNamed( node, "simpleType" ), lookup ),
        fixed: node.attributes.fixed === undefined ? null : node.attributes.fixed,
        documentation: texts.length ? texts.map( ( text ) => text.text.trim() ).join( "\n" ) : null
    };
}

// A complex type's content, its base's first: the element particles in order, each with the file that declared it and
// the ordinal of the choice it sits in, and the attributes. Choices are counted over the whole content, base included.
function contentOf( node, file, lookup, counter = { choices: 0 }, seen = new Set() ) {
    const items = [];
    const attributes = [];
    const walk = ( compositor, choice ) => {
        for ( const child of compositor.children ) {
            if ( child.name === "element" ) {
                items.push( { node: child, file: file, choice: choice } );
            } else if ( child.name === "choice" ) {
                walk( child, ++counter.choices );
            } else if ( child.name === "sequence" || child.name === "all" ) {
                walk( child, choice );
            }
        }
    };
    const collect = ( holder ) => {
        for ( const child of holder.children ) {
            if ( child.name === "sequence" || child.name === "all" ) {
                walk( child, null );
            } else if ( child.name === "choice" ) {
                walk( child, ++counter.choices );
            } else if ( child.name === "attribute" && child.attributes.name !== "dataType" ) {
                attributes.push( child );
            }
        }
    };
    const derived = childNamed( node, "complexContent" ) || childNamed( node, "simpleContent" );
    const derivation = derived ? ( childNamed( derived, "extension" ) || childNamed( derived, "restriction" ) ) : null;
    if ( derivation ) {
        const base = lookup( localName( derivation.attributes.base ) );
        if ( base && !seen.has( base.node ) ) {
            seen.add( base.node );
            const inherited = contentOf( base.node, base.file, lookup, counter, seen );
            items.push( ...inherited.items );
            attributes.push( ...inherited.attributes );
        }
        collect( derivation );
    } else {
        collect( node );
    }
    return { items: items, attributes: attributes };
}

const occurs = ( value, fallback ) => {
    if ( value === undefined ) {
        return fallback;
    }
    return value === "unbounded" ? null : Number( value );
};

// The root's path is "", so every path below it starts at header, contents or Signature, as the model's identities do.
const pathOf = ( parentPath, tag ) => {
    if ( parentPath === null ) {
        return "";
    }
    return parentPath ? `${ parentPath }/${ tag }` : tag;
};

// `within` holds the message file and the named types on the way down: a type that holds an element of its own type
// would expand forever, and overflowed the stack (CodeRabbit on #12). No published type does; a broken file may.
function expand( item, parentPath, lookup, within ) {
    const element = item.node;
    const choice = item.choice === null ? null : `${ parentPath }#${ item.choice }`;
    const min = occurs( element.attributes.minOccurs, 1 );
    const max = occurs( element.attributes.maxOccurs, 1 );
    if ( element.attributes.ref ) {
        const tag = localName( element.attributes.ref );
        return { tag: tag, path: pathOf( parentPath, tag ), kind: tag === "Signature" ? "signature" : "group", min: min, max: max,
            type: null, attributes: [], children: [], documentation: null, origin: { file: item.file, choice: choice, typeFile: null } };
    }
    const tag = element.attributes.name;
    const path = pathOf( parentPath, tag );
    const inline = childNamed( element, "complexType" );
    const type = inline ? null : localName( element.attributes.type );
    if ( type && within.types.includes( type ) ) {
        throw new RangeError( `${ within.file }: type ${ type } contains itself, at ${ path }.` );
    }
    const definition = inline ? { node: inline, file: item.file } : lookup( type );
    // Where the element's type is defined, as well as where the element is declared: an attribute only today's XSD has
    // comes from the type, and a physician typed in H005's own file still takes its qualification from NHIS-Fields.
    const origin = { file: item.file, choice: choice, typeFile: definition ? definition.file : null };
    const content = definition && definition.node.name === "complexType" ? contentOf( definition.node, definition.file, lookup ) : { items: [], attributes: [] };
    const field = content.items.length === 0 && content.attributes.length > 0;
    return {
        tag: tag,
        path: path,
        kind: field ? "field" : "group",
        min: min,
        max: max,
        type: type,
        attributes: field ? content.attributes.map( ( attribute ) => attributeOf( attribute, lookup ) ) : [],
        children: field ? [] : content.items.map( ( child ) => expand( child, path, lookup, { file: within.file, types: type ? [ ...within.types, type ] : within.types } ) ),
        documentation: elementDocumentation( element ),
        origin: origin
    };
}

/**
 * Expands one published message into its schema shape (design record §5.5): the root `message`, every element below
 * it with its occurrence bounds, every field's attributes with their value types, and on each node the file that
 * declared it and the choice it sits in. A message's own types shadow the shared ones and stay within it: e-Dental
 * defines `dentalTreatment` three different ways in three message files.
 *
 * @method
 * @param {XsdSet} set
 * @param {string} code
 * @returns {import( "@health-dev-portal/spec-model/definitions" ).SchemaNode}
 * @throws {RangeError} When the set has no such message, the message no `message` element, or a type contains itself.
 * @public
 */
module.exports.expandMessage = ( set, code ) => {
    const message = set.messages.get( code );
    if ( !message ) {
        throw new RangeError( `The XSD set has no message ${ code }.` );
    }
    const lookup = ( name ) => message.types.get( name ) || set.shared.get( name ) || null;
    const root = message.root.children.find( ( candidate ) => candidate.name === "element" && candidate.attributes.name === "message" );
    if ( !root ) {
        throw new RangeError( `${ message.file } declares no message element.` );
    }
    return expand( { node: root, file: message.file, choice: null }, null, lookup, { file: message.file, types: [] } );
};
