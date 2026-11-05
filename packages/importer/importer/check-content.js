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
const { bindBlueprints, checkBlueprintFields } = require( "@health-dev-portal/spec-model/blueprints" );
const { keyTypeOf } = require( "@health-dev-portal/spec-model/key-type" );
const { ELEMENT_KIND, LIFECYCLE, SPEC_KIND } = require( "@health-dev-portal/spec-model/kinds" );
const { ERROR_CODE_LIST, linkConditions, linkModule, linkRules } = require( "@health-dev-portal/spec-model/links" );
const { validateMessageTree } = require( "@health-dev-portal/spec-model/validation" );
const { compareVersions } = require( "#cells" );
const { DEFAULT_ATTRIBUTE, checkPart } = require( "#message-tree" );
const { isErrorMessage, isMessageCode } = require( "#messages-sheet" );
const { isRuleId } = require( "#rules-sheet" );
const { foldLookAlikes } = require( "#scripts" );
const { importConditions } = require( "#condition-import" );

const flatten = ( elements ) => elements.flatMap( ( node ) => [ node, ...flatten( node.children ) ] );

// What the sheet readers check as they read a row, checked again on the content by their own tests. An edit was never
// checked for these, and a version's inherited ones went at its first recheck (final review, I2). The identity goes in
// the details, so an anomaly on an element no sheet holds still finds its item.
const elementAnomalies = ( messages ) => messages.flatMap( ( message ) => flatten( message.elements ) ).flatMap( ( node ) => {
    const found = [];
    const named = { identity: node.identity };
    if ( node.kind === ELEMENT_KIND.ATTRIBUTE ) {
        checkPart( node.attribute || DEFAULT_ATTRIBUTE, node.source, found, named );
    } else if ( node.kind !== ELEMENT_KIND.POLYMORPHIC ) {
        // A polymorphic element is checked through its variants, which carry its tag, as the tree builder does.
        if ( !node.tag ) {
            found.push( createAnomaly( "missing-tag", node.source, named ) );
        } else if ( checkPart( node.tag, node.source, found, named ) && node.kind !== ELEMENT_KIND.GROUP ) {
            checkPart( node.attribute || DEFAULT_ATTRIBUTE, node.source, found, named );
        }
    }
    if ( !node.name || !( node.name.en || node.name.bg ) ) {
        found.push( createAnomaly( "missing-name", node.source, named ) );
    }
    return found;
} );

const messageAnomalies = ( messages ) => messages.flatMap( ( message ) => [
    ...( isMessageCode( message.code ) ? [] : [ createAnomaly( "malformed-message-code", message.source, { value: message.code, code: message.code } ) ] ),
    ...( message.pairedWith || isErrorMessage( message ) ? [] : [ createAnomaly( "unpaired-message", message.source, { code: message.code } ) ] )
] );
const rowOf = ( source ) => source ? source.row : null;

// Design record §5.3: a reference to a condition that does not exist blocks; both sides are in the same version.
const undefinedConditions = ( messages, conditions ) => {
    const defined = new Set( conditions.map( ( condition ) => condition.id ) );
    return messages.flatMap( ( message ) => flatten( message.elements ) )
        .flatMap( ( node ) => node.conditions.filter( ( id ) => !defined.has( id ) )
            .map( ( id ) => createAnomaly( "unknown-condition", node.source, { identity: node.identity || node.name.en, id: id } ) ) );
};

// The second and later of items sharing a key, as the sheet readers report them: rows when the items were read from one.
const repeated = ( items, keyOf, type, name ) => {
    const first = new Map();
    const anomalies = [];
    for ( const item of items ) {
        const key = keyOf( item );
        if ( first.has( key ) ) {
            anomalies.push( createAnomaly( type, item.source, { [ name ]: key, firstRow: rowOf( first.get( key ).source ), row: rowOf( item.source ) } ) );
        } else {
            first.set( key, item );
        }
    }
    return anomalies;
};

/**
 * What a module's messages and conditions make of each other once its trees are built: blueprints bound and their
 * fields checked, then the conditions checked for existence, parsed, printed, bound and type-checked (design record
 * §4.4, §6). The module importer calls this after reading its sheets, and `checkContent` after an edit, so the two are
 * checked by the same code. Anomalies come in two groups so the importer can keep its order: the Conditions sheet's own
 * findings go between them.
 *
 * @method
 * @param {import( "@health-dev-portal/spec-model/definitions" ).Message[]} messages
 * @param {import( "@health-dev-portal/spec-model/definitions" ).ConditionText[]} conditions
 * @param {import( "@health-dev-portal/spec-model/definitions" ).BlueprintCatalogue|null} catalogue Without one nothing is bound.
 * @param {{conditionsDefined?: boolean}} [options] `false` when the version has no conditions to name, as a workbook without
 *     its Conditions sheet: every reference would otherwise be reported on top of the missing sheet.
 * @returns {{blueprintBindings: Array, conditions: import( "@health-dev-portal/spec-model/definitions" ).ConditionText[],
 *     conditionBindings: Array, blueprintAnomalies: Array, conditionAnomalies: Array}}
 * @public
 */
module.exports.checkModuleLanguage = ( messages, conditions, catalogue, options = {} ) => {
    // A workbook name with a Cyrillic look-alike (`Аccommodation`) names the object its Latin spelling does.
    const blueprints = catalogue
        ? bindBlueprints( messages, catalogue, { name: ( value ) => foldLookAlikes( value ).folded } )
        : { bindings: [], anomalies: [] };
    const language = importConditions( conditions, messages, catalogue ? { blueprints: catalogue.blueprints, bindings: blueprints.bindings } : undefined );
    return {
        blueprintBindings: blueprints.bindings,
        conditions: language.conditions,
        conditionBindings: language.bindings,
        blueprintAnomalies: [ ...blueprints.anomalies, ...checkBlueprintFields( messages, blueprints.bindings ) ],
        conditionAnomalies: [ ...( options.conditionsDefined === false ? [] : undefinedConditions( messages, conditions ) ), ...language.anomalies ]
    };
};

/**
 * @typedef {Object} CheckTargets What a version is checked against (design record §4.8); `null` means not checked.
 * @property {import( "@health-dev-portal/spec-model/definitions" ).CodeList[]|null} codeLists The lists it resolves to.
 * @property {import( "@health-dev-portal/spec-model/definitions" ).RulesVersion|null} rules
 * @property {import( "@health-dev-portal/spec-model/definitions" ).BlueprintCatalogue|null} catalogue
 */

/**
 * Checks a version's content as it stands, with no workbook behind it (design record §5.4: the same checks run on every
 * edit). Its derived parts are recomputed — a module's conditions, condition bindings and blueprint bindings, a list's
 * key type — and every check that concerns the content itself runs; those that concern a workbook's layout cannot, and
 * do not.
 *
 * @method
 * @param {string} kind One of `SPEC_KIND`: module, code-list or rules.
 * @param {Object} content A module, code-list or rules version.
 * @param {CheckTargets} targets
 * @returns {{content: Object, anomalies: import( "@health-dev-portal/spec-model/definitions" ).Anomaly[]}}
 * @throws {TypeError} For a kind without content.
 * @public
 */
module.exports.checkContent = ( kind, content, targets ) => {
    if ( kind === SPEC_KIND.MODULE ) {
        const anomalies = [ ...repeated( content.messages, ( message ) => message.code, "duplicate-message", "code" ), ...messageAnomalies( content.messages ),
            ...elementAnomalies( content.messages ) ];
        for ( const message of content.messages ) {
            anomalies.push( ...validateMessageTree( message.elements ) );
        }
        anomalies.push( ...repeated( content.conditions, ( condition ) => condition.id, "duplicate-condition", "id" ) );
        // The Conditions sheet's reader reports this too; measured, all but one published module has one.
        anomalies.push( ...content.conditions.filter( ( condition ) => !condition.text ).map( ( condition ) => createAnomaly( "empty-condition", condition.source,
            { id: condition.id } ) ) );
        const language = module.exports.checkModuleLanguage( content.messages, content.conditions, targets.catalogue );
        anomalies.push( ...language.blueprintAnomalies, ...language.conditionAnomalies );
        const checked = { ...content, conditions: language.conditions, conditionBindings: language.conditionBindings, blueprintBindings: language.blueprintBindings };
        if ( targets.codeLists || targets.rules ) {
            anomalies.push( ...linkModule( checked, { nomenclatures: targets.codeLists ? { codeLists: targets.codeLists } : null, rules: targets.rules } ) );
        }
        if ( targets.codeLists ) {
            anomalies.push( ...linkConditions( checked, { codeLists: targets.codeLists } ) );
        }
        return { content: checked, anomalies: anomalies };
    }
    if ( kind === SPEC_KIND.CODE_LIST ) {
        const entries = content.list.entries;
        return {
            content: { ...content, list: { ...content.list, keyType: keyTypeOf( entries.map( ( entry ) => entry.key ) ) } },
            anomalies: [
                ...repeated( entries, ( entry ) => entry.key, "duplicate-key", "key" ),
                ...entries.filter( ( entry ) => entry.since && entry.validUntil && compareVersions( entry.validUntil, entry.since ) < 0 )
                    .map( ( entry ) => createAnomaly( "valid-until-before-since", entry.source, { since: entry.since, validUntil: entry.validUntil, key: entry.key } ) )
            ]
        };
    }
    if ( kind === SPEC_KIND.RULES ) {
        const anomalies = [ ...repeated( content.rules, ( rule ) => rule.id, "duplicate-rule", "id" ) ];
        for ( const rule of content.rules ) {
            if ( !isRuleId( rule.id ) ) {
                anomalies.push( createAnomaly( "malformed-rule-id", rule.source, { value: rule.id, id: rule.id } ) );
            }
            if ( rule.lifecycle !== LIFECYCLE.WITHDRAWN && !( rule.definition && ( rule.definition.bg || rule.definition.en ) ) ) {
                anomalies.push( createAnomaly( "rule-without-definition", rule.source, { id: rule.id } ) );
            }
        }
        if ( targets.codeLists && targets.codeLists.some( ( list ) => list.id === ERROR_CODE_LIST ) ) {
            anomalies.push( ...linkRules( content, { codeLists: targets.codeLists } ) );
        }
        return { content: content, anomalies: anomalies };
    }
    throw new TypeError( `A ${ kind } version has no content to check.` );
};
