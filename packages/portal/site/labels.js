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
        noVersion: "—",
        stageSwitcher: "Среда",
        switchTesting: "Тестова {number}",
        switchProduction: "Продукция {number}",
        switchPrevious: "Предишна {number}",
        plannedProduction: "предстои в продукция на {date}",
        plannedNotSet: "датата за продукция още не е определена",
        segmentOther: "друго",
        moduleLinks: "Към модула",
        conditions: "Условия",
        dictionary: "Речник",
        changelog: "История на промените",
        columnCode: "Код",
        columnTitle: "Наименование",
        columnDirection: "Вид",
        directionRequest: "заявка",
        directionResponse: "отговор",
        respondedBy: "отговор",
        respondsTo: "в отговор на",
        lifecycleWithdrawn: "оттеглено",
        lifecycleInDevelopment: "в разработка",
        columnRule: "Правило",
        columnDefinition: "Определение",
        columnErrorCode: "Код на грешка",
        columnSince: "От версия",
        ruleSource: "Източник: {source}",
        columnCondition: "Условие",
        columnAppliesTo: "Прилага се към",
        conditionsNone: "Към съобщението няма условия.",
        conditionMissing: "Няма такова условие в тази версия.",
        columnAbbreviation: "Съкращение",
        columnName: "Наименование",
        columnDescription: "Описание",
        messageTabs: "Раздели на съобщението",
        tabElements: "Елементи",
        tabConditions: "Условия",
        tabChanges: "Промени",
        columnElement: "Елемент",
        columnRequirement: "Задължителност",
        columnCount: "Брой",
        columnType: "Тип",
        columnConstraints: "Ограничения",
        columnLinks: "Връзки",
        requirementR: "задължителен",
        requirementC: "условен",
        requirementO: "незадължителен",
        typeGroup: "група",
        typeChoice: "избор",
        markerNew: "ново",
        markerChanged: "променено",
        markerRemoved: "премахнато",
        markerMoved: "преместено",
        nestedOf: "Вложените елементи на {tag}",
        panelPath: "Идентичност",
        panelCodeList: "Номенклатура",
        panelRules: "Бизнес правила",
        panelConditions: "Условия",
        panelDefault: "Стойност по подразбиране",
        panelFixed: "Фиксирана стойност",
        panelUsedAlsoIn: "Използва се и в",
        panelXml: "В XML",
        panelAddress: "Адрес",
        panelSender: "Изпраща",
        panelRecipient: "Получава",
        copyLink: "Копирай връзка",
        copied: "Копирано",
        charsetDigits: "цифри",
        charsetLatin: "латински букви, цифри, тире и интервал",
        charsetLetters: "букви, включително кирилица, тире и интервал",
        lengthCount: "{count} знака",
        lengthOne: "1 знак",
        digitsCount: "{count} цифри",
        digitsOne: "1 цифра",
        boundUpTo: "до {amount}",
        boundAtLeast: "поне {amount}",
        boundExactly: "точно {amount}",
        boundBetween: "от {min} до {amount}",
        characterClass: "знаци {charset}: {meaning}",
        characterClassUndefined: "знаци {charset}",
        formatIs: "формат {format}",
        changesAgainst: "Разлики спрямо продукцията, {number}",
        changesNone: "Съобщението не се различава от продукционното.",
        changesNotTesting: "Тук се показват разликите на версия в тестова среда спрямо продукционната. Промените по версии са в историята на промените.",
        columnChange: "Промяна",
        columnBefore: "Преди",
        columnAfter: "След",
        columnCategory: "Категория",
        categoryBreaking: "несъвместима",
        categoryNonBreaking: "съвместима",
        filterLabel: "Търсене",
        filterButton: "Филтрирай",
        filterKeepsExpired: "Показват се и изтеклите записи.",
        listsCount: "Номенклатури: {count}",
        listsNone: "Няма номенклатури, които отговарят на търсенето.",
        listsLede: "Всички публикувани номенклатури. Търсенето е по код и наименование, без значение от главни и малки букви и от азбуката.",
        listKeyType: "Тип на ключа: {type}",
        entriesShown: "Записи {from}–{to} от {total}",
        entriesNone: "Няма записи.",
        columnKey: "Ключ",
        columnDescriptionBg: "Описание (български)",
        columnDescriptionEn: "Описание (английски)",
        columnDisplayBg: "Изписване (български)",
        columnDisplayEn: "Изписване (английски)",
        columnValidUntil: "Валиден до",
        showExpired: "Покажи изтеклите записи ({count})",
        hideExpired: "Скрий изтеклите записи",
        pagerLabel: "Страници",
        pagePrevious: "Предишна страница",
        pageNext: "Следваща страница",
        pageOf: "Страница {page} от {pages}",
        downloadsTitle: "Изтегляне",
        downloadJson: "JSON, точният файл",
        downloadCsv: "CSV, за електронни таблици",
        csvNote: "В CSV стойност, която започва с =, +, -, @, табулация или нов ред, е предшествана от ', за да не бъде приета за формула от електронната таблица. JSON е точният файл.",
        usedInTitle: "Използва се в",
        usedInMore: "и още {count}",
        usedInNone: "Не се използва от публикуван модул.",
        errorsTitleProduction: "Грешки и предупреждения",
        errorsTitleTesting: "Грешки и предупреждения в тестване",
        errorsLede: "Грешките са кодовете от номенклатура CL999, а предупрежденията — от CL998. Към всяка грешка са посочени бизнес правилата, които я пораждат.",
        errorsVersions: "Показани версии",
        errorsFromProduction: "{spec} {number} (продукция; няма версия в тестване)",
        errorsFromStage: "{spec} {number}",
        errorsTestingLink: "Какво предстои: грешки и предупреждения в тестване",
        errorsProductionLink: "Грешки и предупреждения в продукция",
        errorsSectionErrors: "Грешки (CL999)",
        errorsSectionWarnings: "Предупреждения (CL998)",
        errorsRaisedBy: "Пораждана от правилата",
        errorsNoRules: "Няма правило, което да я поражда.",
        errorsNone: "Няма публикувана версия."
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
        noVersion: "—",
        stageSwitcher: "Stage",
        switchTesting: "Testing {number}",
        switchProduction: "Production {number}",
        switchPrevious: "Previous production {number}",
        plannedProduction: "due in production on {date}",
        plannedNotSet: "no production date is set yet",
        segmentOther: "other",
        moduleLinks: "In the module",
        conditions: "Conditions",
        dictionary: "Dictionary",
        changelog: "Changelog",
        columnCode: "Code",
        columnTitle: "Title",
        columnDirection: "Kind",
        directionRequest: "request",
        directionResponse: "response",
        respondedBy: "response",
        respondsTo: "in reply to",
        lifecycleWithdrawn: "withdrawn",
        lifecycleInDevelopment: "in development",
        columnRule: "Rule",
        columnDefinition: "Definition",
        columnErrorCode: "Error code",
        columnSince: "Since",
        ruleSource: "Source: {source}",
        columnCondition: "Condition",
        columnAppliesTo: "Applies to",
        conditionsNone: "The message has no conditions.",
        conditionMissing: "This version has no such condition.",
        columnAbbreviation: "Abbreviation",
        columnName: "Name",
        columnDescription: "Description",
        messageTabs: "Message sections",
        tabElements: "Elements",
        tabConditions: "Conditions",
        tabChanges: "Changes",
        columnElement: "Element",
        columnRequirement: "Requirement",
        columnCount: "Count",
        columnType: "Type",
        columnConstraints: "Constraints",
        columnLinks: "Links",
        requirementR: "required",
        requirementC: "conditional",
        requirementO: "optional",
        typeGroup: "group",
        typeChoice: "choice",
        markerNew: "new",
        markerChanged: "changed",
        markerRemoved: "removed",
        markerMoved: "moved",
        nestedOf: "Nested elements of {tag}",
        panelPath: "Identity",
        panelCodeList: "Code list",
        panelRules: "Business rules",
        panelConditions: "Conditions",
        panelDefault: "Default value",
        panelFixed: "Fixed value",
        panelUsedAlsoIn: "Used also in",
        panelXml: "In XML",
        panelAddress: "Address",
        panelSender: "Sender",
        panelRecipient: "Recipient",
        copyLink: "Copy link",
        copied: "Copied",
        charsetDigits: "digits",
        charsetLatin: "Latin letters, digits, hyphen and space",
        charsetLetters: "letters, Cyrillic included, hyphen and space",
        lengthCount: "{count} characters",
        lengthOne: "1 character",
        digitsCount: "{count} digits",
        digitsOne: "1 digit",
        boundUpTo: "up to {amount}",
        boundAtLeast: "at least {amount}",
        boundExactly: "exactly {amount}",
        boundBetween: "{min} to {amount}",
        characterClass: "characters {charset}: {meaning}",
        characterClassUndefined: "characters {charset}",
        formatIs: "format {format}",
        changesAgainst: "Differences from production, {number}",
        changesNone: "The message does not differ from the one in production.",
        changesNotTesting: "This tab shows how a version in testing differs from the one in production. The changes between versions are in the changelog.",
        columnChange: "Change",
        columnBefore: "Before",
        columnAfter: "After",
        columnCategory: "Category",
        categoryBreaking: "breaking",
        categoryNonBreaking: "non-breaking",
        filterLabel: "Search",
        filterButton: "Filter",
        filterKeepsExpired: "Expired entries are shown too.",
        listsCount: "Code lists: {count}",
        listsNone: "No code list matches the search.",
        listsLede: "Every published code list. The search covers the code and the name, whatever the case and the alphabet.",
        listKeyType: "Key type: {type}",
        entriesShown: "Entries {from}–{to} of {total}",
        entriesNone: "No entries.",
        columnKey: "Key",
        columnDescriptionBg: "Description (Bulgarian)",
        columnDescriptionEn: "Description (English)",
        columnDisplayBg: "Display (Bulgarian)",
        columnDisplayEn: "Display (English)",
        columnValidUntil: "Valid until",
        showExpired: "Show expired entries ({count})",
        hideExpired: "Hide expired entries",
        pagerLabel: "Pages",
        pagePrevious: "Previous page",
        pageNext: "Next page",
        pageOf: "Page {page} of {pages}",
        downloadsTitle: "Download",
        downloadJson: "JSON, the exact file",
        downloadCsv: "CSV, for spreadsheets",
        csvNote: "In the CSV a value that starts with =, +, -, @, a tab or a line break is preceded by ', so that a spreadsheet does not take it for a formula. The JSON is the exact file.",
        usedInTitle: "Used in",
        usedInMore: "and {count} more",
        usedInNone: "No published module uses it.",
        errorsTitleProduction: "Errors and warnings",
        errorsTitleTesting: "Errors and warnings in testing",
        errorsLede: "Errors are the codes of code list CL999 and warnings those of CL998. Each error names the business rules that raise it.",
        errorsVersions: "Versions shown",
        errorsFromProduction: "{spec} {number} (production; there is no version in testing)",
        errorsFromStage: "{spec} {number}",
        errorsTestingLink: "What is coming: errors and warnings in testing",
        errorsProductionLink: "Errors and warnings in production",
        errorsSectionErrors: "Errors (CL999)",
        errorsSectionWarnings: "Warnings (CL998)",
        errorsRaisedBy: "Raised by the rules",
        errorsNoRules: "No rule raises it.",
        errorsNone: "No version is published."
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
