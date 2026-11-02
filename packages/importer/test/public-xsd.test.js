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
 * The published /api/v1/ XSD set, as his.bg serves it (design record §5.8). Every expected value was measured on
 * 2026-11-02 with a reader independent of this code, the one the design record's figures come from.
 */

const { describe, it, before } = require( "node:test" );
const assert = require( "node:assert/strict" );
const fs = require( "node:fs" );
const path = require( "node:path" );
const { expandMessage, readXsdSet } = require( "#xsd-reader" );
const { learnCatalogue } = require( "#blueprint-catalogue" );
const { importSet } = require( "#set-importer" );

const WORKBOOKS = path.resolve( __dirname, "../../../.fixtures/public" );
const DIRECTORY = path.join( WORKBOOKS, "api-v1" );
const MODULES = Object.freeze( {
    "e-prescription": "eprescription-1.5.1.xlsx",
    "common-services": "common-services-1.2.2.xlsx",
    "e-referral": "ereferral-1.4.4.xlsx",
    "e-dental": "edental-1.0.7.xlsx",
    "e-examination": "eexamination-1.3.10.xlsx",
    "e-hospitalization": "ehospitalization-1.1.1.xlsx",
    "long-term-care": "longterm-care-1.0.4.xlsx",
    "e-immunization": "eimmunization-1.2.2.xlsx"
} );
const PRESENT = [ path.join( DIRECTORY, "NHIS-Entities.xsd" ), ...Object.values( MODULES ).map( ( file ) => path.join( WORKBOOKS, file ) ) ].every( fs.existsSync );

// In CI a missing fixture is a failure, never a skip: a skipped regression test looks exactly like a passing one.
if ( !PRESENT && process.env.CI ) {
    throw new Error( "The public XSD set is missing: CI must run `npm run fixtures:fetch` before the tests." );
}

// Every identity of a shape, as the recon counted them: a group by its path, a field by each attribute.
const identities = ( node ) => [
    ...( node.kind === "group" && node.path !== "" ? [ node.path ] : [] ),
    ...node.attributes.map( ( attribute ) => `${ node.path }@${ attribute.name }` ),
    ...node.children.flatMap( identities )
];
const signatures = ( node ) => [ ...( node.kind === "signature" ? [ node ] : [] ), ...node.children.flatMap( signatures ) ];

describe( "The published XSD set", { skip: PRESENT ? false : "run `npm run fixtures:fetch` first" }, () => {
    let set;

    before( () => {
        set = readXsdSet( fs.readdirSync( DIRECTORY ).map( ( name ) => ( { name: name, text: fs.readFileSync( path.join( DIRECTORY, name ), "utf8" ) } ) ) );
    } );

    it( "reads all 117 published XSDs, and indexes 113 messages", () => {
        assert.equal( fs.readdirSync( DIRECTORY ).filter( ( name ) => name.startsWith( "NHIS-" ) ).length, 117 );
        assert.equal( set.messages.size, 113 );
    } );

    it( "expands e-Dental's eleven messages as the recon measured", () => {
        const codes = [ ...set.messages.keys() ].filter( ( code ) => code.startsWith( "D" ) ).sort();
        assert.equal( codes.length, 11 );
        const roots = codes.map( ( code ) => expandMessage( set, code ) );
        assert.equal( roots.flatMap( identities ).length, 353 );
        // The recon skipped the Signature references; the reader keeps them, in the five requests.
        assert.deepEqual( codes.filter( ( code, index ) => signatures( roots[ index ] ).length === 1 ), [ "D001", "D003", "D005", "D007", "D009" ] );
    } );

    it( "gives each message file's version", () => {
        assert.deepEqual( [ "D001", "H001", "P001", "S001" ].map( ( code ) => set.messages.get( code ).version ), [ "1.0.5", "1.0.6", "1.3.2", "1.6.2" ] );
    } );

    it( "expands every published message", () => {
        for ( const code of set.messages.keys() ) {
            assert.equal( expandMessage( set, code ).tag, "message", code );
        }
    } );

    describe( "its blueprints (design record §4.4)", () => {
        let catalogue;

        before( () => {
            catalogue = learnCatalogue( set );
        } );

        it( "learns 18 blueprints from the published set", () => {
            assert.equal( catalogue.blueprints.length, 18 );
            const typesOf = ( key ) => catalogue.blueprints.find( ( blueprint ) => blueprint.key === key ).types;
            assert.deepEqual( [ ...typesOf( "medicalPractitionerSimple" ) ].sort(), [ "medicalPractitioner", "medicalPractitionerSimple",
                "medicalPractitionerWithAccompanying", "medicalPractitionerWithAccompanyingAndName", "medicalPractitionerWithName" ] );
            assert.deepEqual( [ ...typesOf( "patient" ) ].sort(), [ "patient", "patientExtended", "patientExtendedWithID", "patientP001", "patientP004", "patientP011" ] );
            assert.deepEqual( [ ...typesOf( "procedure" ) ].sort(), [ "procedure", "procedureR010" ] );
            assert.deepEqual( [ ...typesOf( "diagnosisBasic" ) ].sort(), [ "diagnosisBasic", "diagnosisFull" ] );
        } );

        it( "binds 197 groups of the published messages", () => {
            assert.equal( Object.values( catalogue.published ).reduce( ( sum, paths ) => sum + Object.keys( paths ).length, 0 ), 197 );
        } );

        it( "is plain data: it survives JSON", () => {
            assert.deepEqual( JSON.parse( JSON.stringify( catalogue ) ), catalogue );
        } );

        describe( "bound to the eight production modules", () => {
            let modules;
            const ofType = ( result, type ) => result.anomalies.filter( ( anomaly ) => anomaly.type === type );

            before( async () => {
                modules = ( await importSet( { catalogue: catalogue, modules: Object.entries( MODULES )
                    .map( ( [ spec, file ] ) => ( { spec: spec, source: path.join( WORKBOOKS, file ) } ) ) } ) ).modules;
            } );

            it( "binds 246 groups: 108 by name, 104 by type, 34 by sibling (design record §4.4)", () => {
                const by = {};
                modules.flatMap( ( result ) => result.version.blueprintBindings ).forEach( ( binding ) => {
                    by[ binding.by ] = ( by[ binding.by ] || 0 ) + 1;
                } );
                assert.deepEqual( by, { name: 108, type: 104, sibling: 34 } );
            } );

            it( "reports no name that differs, and the five fields of HEL-24", () => {
                assert.equal( modules.flatMap( ( result ) => ofType( result, "blueprint-name-differs" ) ).length, 0 );
                assert.deepEqual( modules.flatMap( ( result ) => ofType( result, "blueprint-field-differs" )
                    .map( ( anomaly ) => `${ result.version.spec } ${ anomaly.details.blueprint } ${ anomaly.details.field }` ) ), [
                    "common-services addressBase line@value",
                    "e-referral diagnosisBasic note@value",
                    "e-referral medicalPractitionerSimple pmi@value",
                    "e-referral medicalPractitionerSimple pmiDeputy@value",
                    "e-immunization addressBase line@value"
                ] );
            } );
        } );
    } );
} );
