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
 * The studio's screens in real Chromium, where a click is a click (plan 9a, final review): a write is sent once however
 * fast it is asked for, each button says what it acts on, focus follows the form it opens, the status form starts on the
 * state the chosen environment is in, the sidebar's own words are in the screen's language, and "Now" shows both languages.
 * A write's guard holds until its refresh has landed, over a network made slow on purpose (CodeRabbit on #10). A missing
 * browser skips locally and fails in CI, as in the accessibility test.
 */

/* global document -- the function handed to `waitForFunction` runs in the browser. */

const { after, before, describe, it } = require( "node:test" );
const assert = require( "node:assert/strict" );
const { IN_CI, SEEDED, startPortal } = require( "./support/server" );
const { grant, signIn } = require( "./support/staff" );
const { openDatabase } = require( "@health-dev-portal/data/database" );
const { readSetting } = require( "@health-dev-portal/data/files" );
const { TWO_PEOPLE } = require( "@health-dev-portal/data/review" );
const { addMaintenance, currentStatus, setStatus } = require( "@health-dev-portal/data/status" );
const { EVERY_SPEC, ROLE } = require( "@health-dev-portal/data/staff" );
const labels = require( "../studio/labels.json" ).studio;

describe( "The studio, in Chromium", { skip: !SEEDED && "the portal's seed is not built (npm run fixtures:fetch, then npm test)" }, () => {
    let portal = null;
    let browser = null;
    let skip = null;

    before( async () => {
        const { chromium } = require( "playwright" );
        try {
            browser = await chromium.launch();
        } catch ( error ) {
            if ( IN_CI ) {
                throw new Error( "Chromium is not installed: CI runs `npx playwright install --with-deps chromium` first.", { cause: error } );
            }
            skip = "Chromium is not installed (npx playwright install chromium)";
            return;
        }
        portal = await startPortal();
        for ( const username of [ "admin", "config-admin", "reader" ] ) {
            await signIn( portal.url, username );
        }
        await grant( portal.database, "admin", [ { role: ROLE.ADMIN, spec: EVERY_SPEC } ] );
        const db = await openDatabase( `sqlite:${ portal.database }` );
        // Production is degraded and the test environment has never been set; two windows to come, a day apart.
        await setStatus( db, { environment: "production", state: "degraded", message: { bg: "Бавни отговори", en: "Slow answers" }, by: "browser-test", at: new Date( "2026-11-17T08:00:00Z" ) } );
        for ( const day of [ "20", "21" ] ) {
            await addMaintenance( db, { environment: "production", startsAt: new Date( `2099-11-${ day }T20:00:00Z` ), endsAt: new Date( `2099-11-${ day }T21:30:00Z` ),
                message: { bg: "Обновяване", en: "Upgrade" }, by: "browser-test" } );
        }
        await db.close();
    } );

    after( async () => {
        if ( browser !== null ) {
            await browser.close();
        }
        if ( portal !== null ) {
            await portal.stop();
        }
    } );

    // A page of its own for a person, in a language, with the person's session cookies.
    const open = async ( username, language ) => {
        const context = await browser.newContext();
        const page = await context.newPage();
        const session = await signIn( portal.url, username );
        await context.addCookies( session.cookie.split( "; " ).map( ( pair ) => ( { name: pair.slice( 0, pair.indexOf( "=" ) ), value: pair.slice( pair.indexOf( "=" ) + 1 ), url: portal.url } ) ) );
        await page.goto( new URL( `/language/${ language }`, portal.url ).href );
        return { context, page };
    };
    const show = async ( page, address, ready ) => {
        await page.goto( new URL( address, portal.url ).href );
        await page.waitForSelector( ready );
        await page.waitForLoadState( "networkidle" );
    };
    // The posts a page sends to a service, counted from now on.
    const posts = ( page, service ) => {
        const sent = [];
        page.on( "request", ( request ) => request.method() === "POST" && request.url().endsWith( `/app/${ service }` ) && sent.push( request.url() ) );
        return sent;
    };
    const countOf = async ( table ) => {
        const db = await openDatabase( `sqlite:${ portal.database }` );
        try {
            return ( await db.get( `SELECT COUNT(*) AS n FROM ${ table }` ) ).n;
        } finally {
            await db.close();
        }
    };
    // Focus is set once Alpine has drawn what it moves to, a moment after the click: wait for it, and fail with where it is.
    const focused = async ( page, id, message ) => {
        // A function and not a string: the page's content security policy forbids evaluating one, and says so as an error.
        await page.waitForFunction( ( wanted ) => document.activeElement && document.activeElement.id === wanted, id, { timeout: 3000 } )
            .catch( async () => assert.fail( `${ message }: focus is on ${ JSON.stringify( await page.evaluate( "document.activeElement && document.activeElement.id" ) ) }` ) );
    };
    // Runs an action and waits for the service's answer, then for the screen to settle: the count of requests and of rows is
    // read only once a duplicate would have shown.
    const answered = async ( page, service, action ) => {
        const response = page.waitForResponse( ( one ) => one.request().method() === "POST" && one.url().endsWith( `/app/${ service }` ) );
        await action();
        await response;
        await page.waitForTimeout( 400 );
        await page.waitForLoadState( "networkidle" );
    };
    // The component's own method called twice in one turn: a click that the button's `disabled` has not yet caught up with.
    // A script as a string: it runs in the browser, whose globals this file does not declare.
    const twice = ( page, component, method ) => page.evaluate( `( () => { const data = Alpine.$data( document.querySelector( '[x-data="${ component }"]' ) ); data.${ method }(); data.${ method }(); } )()` );
    // An expression over a component's data, `data`, evaluated in the browser.
    const dataOf = ( page, component, expression ) => page.evaluate( `( ( data ) => ${ expression } )( Alpine.$data( document.querySelector( '[x-data="${ component }"]' ) ) )` );
    // The bodies of the posts a page sends to a service, from now on.
    const bodiesOf = ( page, service ) => {
        const sent = [];
        page.on( "request", ( request ) => request.method() === "POST" && request.url().endsWith( `/app/${ service }` ) && sent.push( request.postDataJSON() ) );
        return sent;
    };
    // Holds the next request of a method to an address, as a slow network would: the server answers at once, and the page
    // gets that answer only on `release()`. `arrived` settles once the request is held.
    const held = async ( page, address, method ) => {
        let arrive = null;
        let release = null;
        const arrived = new Promise( ( resolve ) => {
            arrive = resolve;
        } );
        const released = new Promise( ( resolve ) => {
            release = resolve;
        } );
        let armed = true;
        await page.route( ( url ) => url.pathname === address, async ( route ) => {
            if ( !armed || route.request().method() !== method ) {
                await route.fallback();
                return;
            }
            armed = false;
            const response = await route.fetch();
            arrive();
            await released;
            // The page may have dropped the request meanwhile, as the framework does with a GET of an address it asks again.
            await route.fulfill( { response: response } ).catch( () => {} );
        } );
        return { arrived: arrived, release: release };
    };
    // Makes the next request of a method to an address fail, as a dropped connection would.
    const failing = async ( page, address, method ) => {
        let armed = true;
        await page.route( ( url ) => url.pathname === address, async ( route ) => {
            if ( !armed || route.request().method() !== method ) {
                await route.fallback();
                return;
            }
            armed = false;
            await route.abort();
        } );
    };
    const answerOf = ( page, address, method ) => page.waitForResponse( ( one ) => one.request().method() === method && new URL( one.url() ).pathname === address );
    // Whether the screen holds still: every button named by `name` disabled, or every one enabled.
    const disabledAll = ( page, name ) => page.getByRole( "button", { name: name } ).evaluateAll( ( buttons ) => buttons.length > 0 && buttons.every( ( one ) => one.disabled ) );
    const enabledAll = ( page, name ) => page.getByRole( "button", { name: name } ).evaluateAll( ( buttons ) => buttons.length > 0 && buttons.every( ( one ) => !one.disabled ) );

    it( "sends a status once for a double click and for two calls in one turn", { timeout: 60000 }, async ( context ) => {
        if ( skip !== null ) {
            context.skip( skip );
            return;
        }
        const { context: browserContext, page } = await open( "admin", "bg" );
        await show( page, "/app/environment-status", "#ti-environment-state" );
        const sent = posts( page, "status-set" );
        const before = await countOf( "status_updates" );
        await answered( page, "status-set", () => page.getByRole( "button", { name: labels.environment.set.bg, exact: true } ).dblclick() );
        assert.equal( sent.length, 1, "a double click posts once" );
        assert.equal( await countOf( "status_updates" ), before + 1 );
        await answered( page, "status-set", () => twice( page, "tiStudioEnvironment", "setStatus" ) );
        assert.equal( sent.length, 2, "two calls in one turn post once more, not twice" );
        assert.equal( await countOf( "status_updates" ), before + 2 );
        await browserContext.close();
    } );

    it( "sends an announcement once for a double click and for two calls in one turn", { timeout: 60000 }, async ( context ) => {
        if ( skip !== null ) {
            context.skip( skip );
            return;
        }
        const { context: browserContext, page } = await open( "admin", "bg" );
        await show( page, "/app/environment-status", "#ti-environment-starts" );
        const sent = posts( page, "maintenance-add" );
        const fill = async ( day ) => {
            await page.fill( "#ti-environment-starts", `2099-12-${ day }T10:00` );
            await page.fill( "#ti-environment-ends", `2099-12-${ day }T11:00` );
        };
        const before = await countOf( "maintenance_windows" );
        await fill( "01" );
        await answered( page, "maintenance-add", () => page.getByRole( "button", { name: labels.environment.add.bg, exact: true } ).dblclick() );
        assert.equal( sent.length, 1, "a double click posts once" );
        assert.equal( await countOf( "maintenance_windows" ), before + 1 );
        await fill( "02" );
        await answered( page, "maintenance-add", () => twice( page, "tiStudioEnvironment", "announce" ) );
        assert.equal( sent.length, 2 );
        assert.equal( await countOf( "maintenance_windows" ), before + 2 );
        await browserContext.close();
    } );

    it( "gives each maintenance window's button a name of its own", { timeout: 60000 }, async ( context ) => {
        if ( skip !== null ) {
            context.skip( skip );
            return;
        }
        const { context: browserContext, page } = await open( "admin", "bg" );
        await show( page, "/app/environment-status", "#ti-environment-state" );
        const names = await page.getByRole( "button", { name: new RegExp( `^${ labels.environment.cancel.bg }` ) } ).evaluateAll( ( buttons ) => buttons.map( ( one ) => one.getAttribute( "aria-label" ) ) );
        assert.ok( names.length >= 2, "two windows are announced" );
        assert.equal( new Set( names ).size, names.length, names.join( " | " ) );
        for ( const name of names ) {
            assert.ok( name.startsWith( labels.environment.cancel.bg ), "the visible text is the start of the name (WCAG 2.5.3)" );
            assert.ok( name.includes( labels.environment.env.production.bg ), name );
        }
        await browserContext.close();
    } );

    it( "starts the status form on the chosen environment's current state, and follows a change of environment", { timeout: 60000 }, async ( context ) => {
        if ( skip !== null ) {
            context.skip( skip );
            return;
        }
        const { context: browserContext, page } = await open( "admin", "bg" );
        await show( page, "/app/environment-status", "#ti-environment-state" );
        assert.equal( await page.inputValue( "#ti-environment-status-environment" ), "production" );
        assert.equal( await page.inputValue( "#ti-environment-state" ), "degraded", "production's own state, not the first one" );
        await page.selectOption( "#ti-environment-status-environment", "test" );
        assert.equal( await page.inputValue( "#ti-environment-state" ), "operational", "a never-set environment starts on the first state" );
        await page.selectOption( "#ti-environment-status-environment", "production" );
        assert.equal( await page.inputValue( "#ti-environment-state" ), "degraded" );
        await browserContext.close();
    } );

    it( "shows each environment's message in both languages, each named, on a screen in either language", { timeout: 60000 }, async ( context ) => {
        if ( skip !== null ) {
            context.skip( skip );
            return;
        }
        // The earlier tests have set production's state with no message; this one starts from a message in both languages.
        const db = await openDatabase( `sqlite:${ portal.database }` );
        await setStatus( db, { environment: "production", state: "degraded", message: { bg: "Бавни отговори", en: "Slow answers" }, by: "browser-test" } );
        await db.close();
        for ( const language of [ "bg", "en" ] ) {
            const { context: browserContext, page } = await open( "admin", language );
            await show( page, "/app/environment-status", "#ti-environment-state" );
            const now = await page.locator( "#ti-environment-now + ul li" ).first().innerText();
            assert.ok( now.includes( `${ labels.environment[ "message-bg" ][ language ] }: Бавни отговори` ), `${ language }: ${ now }` );
            assert.ok( now.includes( `${ labels.environment[ "message-en" ][ language ] }: Slow answers` ), `${ language }: ${ now }` );
            await browserContext.close();
        }
    } );

    it( "saves a person's roles once, names each Edit button by its person, moves focus with the form, and spaces the change line", { timeout: 60000 }, async ( context ) => {
        if ( skip !== null ) {
            context.skip( skip );
            return;
        }
        const { context: browserContext, page } = await open( "admin", "bg" );
        await show( page, "/app/people", "#ti-people-edit-0" );
        const names = await page.getByRole( "button", { name: new RegExp( `^${ labels.people.edit.bg }` ) } ).evaluateAll( ( buttons ) => buttons.map( ( one ) => one.getAttribute( "aria-label" ) ) );
        assert.ok( names.length >= 3, "the staff who have signed in" );
        assert.equal( new Set( names ).size, names.length, names.join( " | " ) );
        assert.ok( names.includes( `${ labels.people.edit.bg }: Test Reader` ), names.join( " | " ) );
        // The tag says whose word it is as of when, in the screen's language.
        const tag = await page.locator( ".ti-tag.accent" ).allInnerTexts();
        assert.ok( tag.length > 0 && tag.every( ( one ) => one.toLowerCase().includes( "към последното влизане" ) ), `tags: ${ JSON.stringify( tag ) }` );

        const reader = page.getByRole( "button", { name: `${ labels.people.edit.bg }: Test Reader`, exact: true } );
        const readerID = await reader.getAttribute( "id" );
        await reader.click();
        await page.waitForSelector( "#ti-people-form-title" );
        await focused( page, "ti-people-form-title", "focus goes to the form's heading" );
        await page.getByLabel( labels.home.role.reader.bg, { exact: true } ).check();
        const sent = posts( page, "people-grants" );
        const before = await countOf( "staff_grant_changes" );
        await answered( page, "people-grants", () => page.getByRole( "button", { name: labels.people.save.bg, exact: true } ).dblclick() );
        assert.equal( sent.length, 1, "a double click posts once" );
        assert.equal( await countOf( "staff_grant_changes" ), before + 1 );
        await focused( page, readerID, "focus returns to the row's button when the form closes" );
        const line = await page.locator( "section:has(h2) ul li" ).first().innerText();
        assert.match( line, /\d\d:\d\d · Test Reader · /, line );

        await page.locator( `#${ readerID }` ).click();
        await page.waitForSelector( "#ti-people-form-title" );
        await page.getByRole( "button", { name: labels.people.cancel.bg, exact: true } ).click();
        await focused( page, readerID, "and when it is cancelled" );
        // Two calls in one turn, as the button's `disabled` has not yet caught up.
        await page.locator( `#${ readerID }` ).click();
        await page.waitForSelector( "#ti-people-form-title" );
        const again = await countOf( "staff_grant_changes" );
        await answered( page, "people-grants", () => twice( page, "tiStudioPeople", "save" ) );
        assert.equal( await countOf( "staff_grant_changes" ), again + 1, "two calls in one turn save once" );
        await browserContext.close();
    } );

    it( "words the sidebar's own texts in the screen's language", { timeout: 60000 }, async ( context ) => {
        if ( skip !== null ) {
            context.skip( skip );
            return;
        }
        for ( const language of [ "bg", "en" ] ) {
            const { context: browserContext, page } = await open( "admin", language );
            await show( page, "/studio/", ".ti-sidebar-foot" );
            const attribute = ( selector, name ) => page.locator( selector ).first().getAttribute( name );
            assert.equal( await attribute( ".ti-sidebar", "aria-label" ), labels.nav.main[ language ] );
            assert.equal( await attribute( ".ti-sidebar-collapse-btn", "aria-label" ), labels.nav.collapse[ language ] );
            assert.equal( await attribute( ".ti-sidebar-foot > button.ti-sidebar-item", "data-tip" ), labels.nav[ "theme-tip" ][ language ] );
            const theme = await page.evaluate( "document.documentElement.dataset.theme" );
            const expected = theme === "daylight" ? labels.nav[ "theme-glass" ][ language ] : labels.nav[ "theme-daylight" ][ language ];
            assert.equal( await page.locator( ".ti-sidebar-foot > button.ti-sidebar-item .ti-sidebar-item-label" ).first().innerText(), expected );
            await page.locator( ".ti-sidebar-collapse-btn" ).click();
            assert.equal( await attribute( ".ti-sidebar-collapse-btn", "aria-label" ), labels.nav.expand[ language ] );
            await browserContext.close();
        }
    } );

    // A save's answer closed whatever form was open: a person opened while another's save was in flight lost their form,
    // and what was typed on it, the moment that save landed (CodeRabbit on #10).
    it( "keeps the form being saved, and every Edit button disabled, until the save has landed", { timeout: 60000 }, async ( context ) => {
        if ( skip !== null ) {
            context.skip( skip );
            return;
        }
        const { context: browserContext, page } = await open( "admin", "bg" );
        await show( page, "/app/people", "#ti-people-edit-0" );
        const edit = new RegExp( `^${ labels.people.edit.bg }` );
        const reader = page.getByRole( "button", { name: `${ labels.people.edit.bg }: Test Reader`, exact: true } );
        const readerID = await reader.getAttribute( "id" );
        const otherID = await page.getByRole( "button", { name: edit } ).evaluateAll( ( buttons, id ) => buttons.find( ( one ) => one.id !== id ).id, readerID );
        await reader.click();
        await page.waitForSelector( "#ti-people-form-title" );
        await page.getByLabel( labels.home.role.approver.bg, { exact: true } ).click();
        const saving = await held( page, "/app/people-grants", "POST" );
        await page.getByRole( "button", { name: labels.people.save.bg, exact: true } ).click();
        await saving.arrived;
        await page.waitForTimeout( 200 );
        const facts = { editDisabledWhileSaving: await disabledAll( page, edit ) };
        // Another person's Edit, called as a click that the button's `disabled` has not yet caught up with.
        await dataOf( page, "tiStudioPeople", `data.edit( data.people.find( ( one ) => one.buttonID === "${ otherID }" ).key )` );
        await page.waitForTimeout( 200 );
        facts.formWhileSaving = await page.locator( "#ti-people-form-title" ).innerText();
        const landed = answerOf( page, "/app/people-grants", "POST" );
        saving.release();
        await landed;
        await page.waitForTimeout( 400 );
        await page.waitForLoadState( "networkidle" );
        facts.editEnabledAfterSave = await enabledAll( page, edit );
        assert.deepEqual( facts, { editDisabledWhileSaving: true, formWhileSaving: "Test Reader", editEnabledAfterSave: true } );
        await focused( page, readerID, "focus returns to the saved person's row" );
        await browserContext.close();
    } );

    // Settings released its guard on the save's answer, before the refresh that follows it: a second save could be sent
    // while the first one's refresh was still on its way, and that refresh then put the older value back on the screen while
    // the newer save was in flight (CodeRabbit on #10).
    it( "holds the settings' Save until the save's refresh has landed, or failed, so a slow refresh cannot land on a newer save", { timeout: 60000 }, async ( context ) => {
        if ( skip !== null ) {
            context.skip( skip );
            return;
        }
        const { context: browserContext, page } = await open( "admin", "bg" );
        await show( page, "/app/settings", "#ti-settings-self-approval" );
        const sent = bodiesOf( page, "settings-save" );
        const save = page.getByRole( "button", { name: labels.settings.save.bg, exact: true } );
        const shown = () => page.isChecked( "#ti-settings-self-approval" );
        const stored = async () => {
            const db = await openDatabase( `sqlite:${ portal.database }` );
            try {
                return await readSetting( db, TWO_PEOPLE ) !== "on";
            } finally {
                await db.close();
            }
        };
        const refresh = await held( page, "/app/settings", "GET" );
        await page.click( "#ti-settings-self-approval" );
        const saved = answerOf( page, "/app/settings-save", "POST" );
        await save.click();
        await saved;
        await refresh.arrived;
        await page.waitForTimeout( 200 );
        const facts = { guardWhileRefreshing: await save.isDisabled() };
        // A second save while the first one's refresh is on its way, itself slow: a click the button has not caught up with.
        const second = await held( page, "/app/settings-save", "POST" );
        await page.click( "#ti-settings-self-approval" );
        await dataOf( page, "tiStudioSettings", "data.save()" );
        await page.waitForTimeout( 300 );
        facts.sentWhileRefreshing = sent.length;
        const landed = answerOf( page, "/app/settings", "GET" );
        refresh.release();
        await landed;
        await page.waitForTimeout( 200 );
        facts.shownIsNewestSent = await shown() === sent[ sent.length - 1 ].selfApproval;
        second.release();
        await page.waitForTimeout( 400 );
        await page.waitForLoadState( "networkidle" );
        facts.guardAfterRefresh = !await save.isDisabled();
        facts.shownIsStored = await shown() === await stored();
        await failing( page, "/app/settings", "GET" );
        await page.click( "#ti-settings-self-approval" );
        const savedAgain = answerOf( page, "/app/settings-save", "POST" );
        await save.click();
        await savedAgain;
        await page.waitForTimeout( 400 );
        facts.guardAfterFailedRefresh = !await save.isDisabled();
        assert.deepEqual( facts, { guardWhileRefreshing: true, sentWhileRefreshing: 1, shownIsNewestSent: true, guardAfterRefresh: true, shownIsStored: true,
            guardAfterFailedRefresh: true } );
        await browserContext.close();
    } );

    // Environment status released its guard before the refresh too: `send` returned `load()`, which returned nothing, so a
    // slow first refresh could put an older "Now" and an older state on the form while a newer status was in flight
    // (CodeRabbit on #10).
    it( "holds the status form's Set until the refresh has landed, or failed, so a slow refresh cannot land on a newer status", { timeout: 60000 }, async ( context ) => {
        if ( skip !== null ) {
            context.skip( skip );
            return;
        }
        const { context: browserContext, page } = await open( "admin", "bg" );
        await show( page, "/app/environment-status", "#ti-environment-state" );
        const sent = bodiesOf( page, "status-set" );
        const set = page.getByRole( "button", { name: labels.environment.set.bg, exact: true } );
        const shown = () => dataOf( page, "tiStudioEnvironment", "( data.current.find( ( one ) => one.environment === \"test\" ) || {} ).state" );
        const stored = async () => {
            const db = await openDatabase( `sqlite:${ portal.database }` );
            try {
                return ( await currentStatus( db ) ).find( ( one ) => one.environment === "test" ).state;
            } finally {
                await db.close();
            }
        };
        await page.selectOption( "#ti-environment-status-environment", "test" );
        await page.selectOption( "#ti-environment-state", "maintenance" );
        const refresh = await held( page, "/app/environment-status", "GET" );
        const answered = answerOf( page, "/app/status-set", "POST" );
        await set.click();
        await answered;
        await refresh.arrived;
        await page.waitForTimeout( 200 );
        const facts = { guardWhileRefreshing: await set.isDisabled() };
        // A second status while the first one's refresh is on its way, itself slow: a click the button has not caught up with.
        const second = await held( page, "/app/status-set", "POST" );
        await page.selectOption( "#ti-environment-state", "outage" );
        await dataOf( page, "tiStudioEnvironment", "data.setStatus()" );
        await page.waitForTimeout( 300 );
        facts.sentWhileRefreshing = sent.length;
        const landed = answerOf( page, "/app/environment-status", "GET" );
        refresh.release();
        await landed;
        await page.waitForTimeout( 200 );
        facts.nowIsNewestSent = await shown() === sent[ sent.length - 1 ].state;
        facts.formIsNewestSent = await page.inputValue( "#ti-environment-state" ) === sent[ sent.length - 1 ].state;
        second.release();
        await page.waitForTimeout( 400 );
        await page.waitForLoadState( "networkidle" );
        facts.guardAfterRefresh = !await set.isDisabled();
        facts.nowIsStored = await shown() === await stored();
        await failing( page, "/app/environment-status", "GET" );
        const answeredAgain = answerOf( page, "/app/status-set", "POST" );
        await set.click();
        await answeredAgain;
        await page.waitForTimeout( 400 );
        facts.guardAfterFailedRefresh = !await set.isDisabled();
        assert.deepEqual( facts, { guardWhileRefreshing: true, sentWhileRefreshing: 1, nowIsNewestSent: true, formIsNewestSent: true, guardAfterRefresh: true,
            nowIsStored: true, guardAfterFailedRefresh: true } );
        await browserContext.close();
    } );
} );
