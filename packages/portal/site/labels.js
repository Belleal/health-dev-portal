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
 * The interface's own words, in both languages (plan 8a, decision 5; design record §8.4). A model's texts are not here:
 * they come with the model, through text.js. A test holds both languages to the same keys, and every `label( … )` call
 * in site/ to a key that exists.
 */

/**
 * The site's languages, Bulgarian first: `/` goes to it, and `x-default` names it (design record §8.1, §8.5).
 *
 * @type {string[]}
 * @public
 */
module.exports.LANGUAGES = Object.freeze( [ "bg", "en" ] );

/**
 * Every label, by language and key. `{name}` in a text is filled from the values a call passes.
 *
 * @type {{bg: Object<string, string>, en: Object<string, string>}}
 * @public
 */
module.exports.LABELS = Object.freeze( {
    bg: Object.freeze( {
        siteName: "НЗИС · Разработчици",
        footer: "Портал за разработчици на Националната здравноинформационна система",
        languageName: "Български",
        skipToContent: "Към съдържанието",
        mainSections: "Основни раздели",
        sectionSpecs: "Спецификации",
        sectionNomenclatures: "Номенклатури",
        sectionErrors: "Грешки",
        sectionChanges: "Промени",
        sidebar: "В този раздел",
        panel: "Подробности",
        untranslated: "не е преведено",
        backwardCompatibleUntil: "обратно съвместима до {date}",
        notFoundTitle: "Страницата не е намерена",
        notFoundText: "Няма такъв адрес или на него няма публикувана версия.",
        goHome: "Към началната страница",
        goneTitle: "Версията вече не се поддържа",
        goneText: "Тази версия е била публикувана и оттогава е заменена.",
        goneChanges: "Какво се е променило оттогава",
        failedTitle: "Възникна грешка",
        failedText: "Страницата не можа да бъде показана. Опитайте отново след малко.",
        homeTitle: "Начало",
        versionsByStage: "Версии по среди",
        columnSpec: "Спецификация",
        columnTesting: "Тестова",
        columnProduction: "Продукция",
        columnPrevious: "Предишна",
        aheadLegend: "Червено: тестовата версия е по-нова от продукционната.",
        nomenclaturesSummary: "{count} списъка, {ahead} с по-нова тестова версия",
        upcomingTitle: "Предстоящо в продукция",
        upcomingNone: "Няма предстоящи издания.",
        dateNotSet: "датата още не е определена",
        breakingChanges: "Несъвместими промени: {count}",
        compareWithProduction: "сравнение с продукцията",
        latestTitle: "Последни издания",
        latestNone: "Все още няма издания.",
        stageTesting: "тестова",
        stageProduction: "продукция",
        specsIndexTitle: "Спецификации по среди",
        noVersion: "—"
    } ),
    en: Object.freeze( {
        siteName: "NHIS · Developers",
        footer: "The developer portal of the National Health Information System",
        languageName: "English",
        skipToContent: "Skip to content",
        mainSections: "Main sections",
        sectionSpecs: "Specifications",
        sectionNomenclatures: "Nomenclatures",
        sectionErrors: "Errors",
        sectionChanges: "Changes",
        sidebar: "In this section",
        panel: "Details",
        untranslated: "not yet translated",
        backwardCompatibleUntil: "backward compatible until {date}",
        notFoundTitle: "Page not found",
        notFoundText: "There is no such address, or no version is published at it.",
        goHome: "Go to the home page",
        goneTitle: "This version is no longer kept",
        goneText: "This version was published and has since been replaced.",
        goneChanges: "What has changed since",
        failedTitle: "Something went wrong",
        failedText: "The page could not be shown. Please try again in a moment.",
        homeTitle: "Home",
        versionsByStage: "Versions by stage",
        columnSpec: "Specification",
        columnTesting: "Testing",
        columnProduction: "Production",
        columnPrevious: "Previous",
        aheadLegend: "Red: the testing version is newer than the one in production.",
        nomenclaturesSummary: "{count} lists, {ahead} with a newer testing version",
        upcomingTitle: "Upcoming in production",
        upcomingNone: "Nothing is upcoming.",
        dateNotSet: "date not set yet",
        breakingChanges: "Breaking changes: {count}",
        compareWithProduction: "compare with production",
        latestTitle: "Latest publications",
        latestNone: "Nothing has been published yet.",
        stageTesting: "testing",
        stageProduction: "production",
        specsIndexTitle: "Specifications by stage",
        noVersion: "—"
    } )
} );

/**
 * The language a page in `lang` links to as the other one.
 *
 * @method
 * @param {string} lang
 * @returns {string}
 * @throws {RangeError} For a language the site does not have.
 * @public
 */
module.exports.otherLanguage = ( lang ) => {
    if ( !module.exports.LANGUAGES.includes( lang ) ) {
        throw new RangeError( `The site has no language "${ lang }".` );
    }
    return module.exports.LANGUAGES.find( ( one ) => one !== lang );
};

/**
 * One of the interface's words, in a language, with its named values filled in. The text is plain: it is escaped where
 * a page puts it, like any other value.
 *
 * @method
 * @param {string} lang
 * @param {string} key
 * @param {Object<string, *>} [values] For each `{name}` in the text.
 * @returns {string}
 * @throws {RangeError} For a language or key there is none of, or a `{name}` with no value: a word missing on a page is a
 *     defect to see, not a blank to ship.
 * @public
 */
module.exports.label = ( lang, key, values = {} ) => {
    const table = module.exports.LABELS[ lang ];
    if ( !table ) {
        throw new RangeError( `The site has no language "${ lang }".` );
    }
    if ( !Object.hasOwn( table, key ) ) {
        throw new RangeError( `There is no label "${ key }".` );
    }
    return table[ key ].replace( /\{(\w+)\}/g, ( placeholder, name ) => {
        if ( !Object.hasOwn( values, name ) ) {
            throw new RangeError( `The label "${ key }" needs a value for {${ name }}.` );
        }
        return String( values[ name ] );
    } );
};
