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
 * The document every page is (plan 8a, decision 6; design record §8.4–8.5): the portal's own head, one stylesheet and
 * one deferred script by their content hash, and nothing inline.
 */

const { before, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const crypto = require( "node:crypto" );
const fs = require( "node:fs" );
const path = require( "node:path" );
const { html } = require( "@ti-engine/web-content/html" );
const { page } = require( "#layout" );
const { setPublicUrl } = require( "#paths" );

const PUBLIC = path.resolve( __dirname, "../../public" );
const hashOf = ( file ) => crypto.createHash( "sha256" ).update( fs.readFileSync( path.join( PUBLIC, file ) ) ).digest( "hex" ).slice( 0, 12 );

describe( "The document", () => {

    before( () => setPublicUrl( "https://developers.example.test" ) );

    const stagePage = () => page( { lang: "bg", title: "P001 <тест>", path: "/bg/specs/e-prescription/production/P001",
        canonical: "/bg/specs/e-prescription/1.5.1/P001", section: "specs", band: html`<p>лента</p>`, sidebar: html`<p>страна</p>`,
        main: html`<h1>P001</h1>`, panel: html`<p>панел</p>`, nonce: "abc+/=" } );

    it( "writes the portal's own head: language, title, canonical, and hreflang both ways with x-default at Bulgarian", () => {
        const text = stagePage();
        assert.match( text, /^<!DOCTYPE html>\n<html lang="bg">/ );
        assert.match( text, /<meta charset="utf-8">/ );
        assert.match( text, /<meta name="viewport" content="width=device-width, initial-scale=1">/ );
        assert.match( text, /<title>P001 &lt;тест&gt; · НЗИС · Разработчици<\/title>/ );
        assert.match( text, /<link rel="canonical" href="https:\/\/developers\.example\.test\/bg\/specs\/e-prescription\/1\.5\.1\/P001">/ );
        // The alternates are the canonical page's, in each language (a stage page's canonical is its fixed address).
        assert.match( text, /hreflang="bg" href="https:\/\/developers\.example\.test\/bg\/specs\/e-prescription\/1\.5\.1\/P001"/ );
        assert.match( text, /hreflang="en" href="https:\/\/developers\.example\.test\/en\/specs\/e-prescription\/1\.5\.1\/P001"/ );
        assert.match( text, /hreflang="x-default" href="https:\/\/developers\.example\.test\/bg\/specs\/e-prescription\/1\.5\.1\/P001"/ );
    } );

    it( "loads one stylesheet and one deferred script by their hash, both with the nonce, and nothing inline", () => {
        const text = stagePage();
        assert.deepEqual( [ ...text.matchAll( /<link rel="stylesheet"[^>]*>/g ) ].map( ( match ) => match[ 0 ] ),
            [ `<link rel="stylesheet" href="/static/portal/portal.css?v=${ hashOf( "portal/portal.css" ) }" nonce="abc+/=">` ] );
        assert.deepEqual( [ ...text.matchAll( /<script\b[^>]*>/g ) ].map( ( match ) => match[ 0 ] ),
            [ `<script src="/static/portal/portal.js?v=${ hashOf( "portal/portal.js" ) }" defer nonce="abc+/=">` ] );
        assert.doesNotMatch( text, /\sstyle=|<style\b|\son[a-z]+=/i );
    } );

    it( "marks the section, and links the same page in the other language", () => {
        const text = stagePage();
        assert.match( text, /<a href="\/bg\/specs" aria-current="true">Спецификации<\/a>/ );
        assert.match( text, /<a href="\/en\/specs\/e-prescription\/production\/P001" hreflang="en" lang="en">English<\/a>/ );
        assert.match( text, /<div class="band">\s*<p>лента<\/p>/ );
        assert.match( text, /<aside class="sidebar"[^>]*>\s*<p>страна<\/p>/ );
        assert.match( text, /<main id="main"[^>]*>\s*<h1>P001<\/h1>/ );
        assert.match( text, /<aside class="panel"[^>]*>\s*<p>панел<\/p>/ );
    } );

    it( "leaves out what a page does not have: no canonical for a page not found, no band, sidebar or panel", () => {
        const text = page( { lang: "en", title: "Page not found", path: "/app/x", main: html`<h1>x</h1>`, nonce: "n" } );
        assert.match( text, /<html lang="en">/ );
        assert.doesNotMatch( text, /rel="canonical"|rel="alternate"|class="band"|class="sidebar"|class="panel"|aria-current/ );
        assert.match( text, /<a href="\/bg\/" hreflang="bg" lang="bg">Български<\/a>/ );
    } );
} );
