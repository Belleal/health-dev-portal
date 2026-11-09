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
 * The names of the modules and of the rules (plan 8a, decision 5). The model has none for them — a code list carries its
 * own name, a module only its key — so the site names them here, in both languages, in the order the home page lists
 * them: e-Prescription first, as the most used, then the other modules, the rules last.
 */

/**
 * Each named spec, in the home page's order.
 *
 * @type {Array<{spec: string, name: import( "@health-dev-portal/spec-model/definitions" ).LocalText}>}
 * @public
 */
module.exports.SPEC_NAMES = Object.freeze( [
    { spec: "e-prescription", name: { bg: "Е-рецепта", en: "e-Prescription" } },
    { spec: "e-referral", name: { bg: "Е-направление", en: "e-Referral" } },
    { spec: "e-examination", name: { bg: "Е-преглед", en: "e-Examination" } },
    { spec: "e-hospitalization", name: { bg: "Е-хоспитализация", en: "e-Hospitalization" } },
    { spec: "e-immunization", name: { bg: "Е-имунизация", en: "e-Immunization" } },
    { spec: "e-dental", name: { bg: "Е-дентално лечение", en: "e-Dental treatment" } },
    { spec: "long-term-care", name: { bg: "Дългосрочна грижа", en: "Long-term care" } },
    { spec: "common-services", name: { bg: "Общи медицински услуги", en: "Common medical services" } },
    { spec: "rules", name: { bg: "Бизнес правила", en: "Business rules" } }
].map( ( one ) => Object.freeze( { spec: one.spec, name: Object.freeze( one.name ) } ) ) );

const BY_SPEC = new Map( module.exports.SPEC_NAMES.map( ( one ) => [ one.spec, one.name ] ) );

/**
 * A module's or the rules' name in a language; a spec not named here shows its ID, so a new module is never nameless.
 *
 * @method
 * @param {string} spec
 * @param {string} lang
 * @returns {string}
 * @public
 */
module.exports.specName = ( spec, lang ) => {
    const name = BY_SPEC.get( spec );
    return name && name[ lang ] ? name[ lang ] : spec;
};
