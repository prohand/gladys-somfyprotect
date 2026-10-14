// -----------------------------------------------------------------------------
// The languages every user-facing text is written in.
//
// Gladys renders a multi-language object in the reader's own language and
// falls back to English for any other one. Every message this integration
// returns (action answers, connection status, widget texts, transport badge
// tooltips) is such an object, with one key per language below.
// -----------------------------------------------------------------------------

/** The languages of the Gladys interface, English first: it is the fallback. */
export const LANGUAGES = ['en', 'fr', 'de', 'es'];

/**
 * The text of one language, English when the object has none for it.
 * @param {string} language a key of {@link LANGUAGES}, or anything else
 * @param {Record<string, string>} texts one text per language, `en` included
 * @returns {string}
 */
export function pick(language, texts) {
  return texts[language] ?? texts.en;
}

/**
 * One multi-language object, built by calling `build` once per language.
 * @param {(language: string) => string} build the text in one language
 * @returns {Record<string, string>} `{ en, fr, de, es }`
 */
export function localize(build) {
  return Object.fromEntries(LANGUAGES.map((language) => [language, build(language)]));
}

/** The three security levels of a Somfy Protect site, as the app names them. */
export const SECURITY_LEVEL_LABELS = {
  disarmed: { en: 'Disarmed', fr: 'Désactivée', de: 'Deaktiviert', es: 'Desactivada' },
  partial: { en: 'Partial', fr: 'Partielle', de: 'Teilweise', es: 'Parcial' },
  armed: { en: 'Armed', fr: 'Totale', de: 'Aktiviert', es: 'Total' },
};

/** The kinds of alarm a site can raise (`alarm_triggered` scene trigger). */
export const ALARM_KIND_LABELS = {
  intrusion: { en: 'Intrusion', fr: 'Intrusion', de: 'Einbruch', es: 'Intrusión' },
  panic: { en: 'Panic', fr: 'Panique', de: 'Panik', es: 'Pánico' },
  fire: { en: 'Fire', fr: 'Incendie', de: 'Feuer', es: 'Incendio' },
};
