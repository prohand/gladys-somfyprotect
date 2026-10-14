// -----------------------------------------------------------------------------
// Errors of the Somfy Protect cloud, told apart so the user reads the right
// advice: a wrong password is not an outage, and a rate limit asks for patience
// rather than for a retry loop.
// -----------------------------------------------------------------------------

import { localize, pick } from '../i18n.js';

/** Base class: an HTTP status (0 when the request never got an answer). */
export class SomfyError extends Error {
  constructor(message, { status = 0, cause } = {}) {
    super(message, { cause });
    this.name = 'SomfyError';
    this.status = status;
  }
}

/** The account was refused (wrong email or password, account locked...). */
export class SomfyAuthError extends SomfyError {
  constructor(message, options) {
    super(message, options);
    this.name = 'SomfyAuthError';
  }
}

/** Too many requests: the cloud asks to wait `retryAfter` seconds. */
export class SomfyRateLimitError extends SomfyError {
  constructor(message, { retryAfter = 60, ...options } = {}) {
    super(message, { status: 429, ...options });
    this.name = 'SomfyRateLimitError';
    this.retryAfter = retryAfter;
  }
}

/**
 * What to tell the user about an error, in every language.
 * @param {unknown} err
 * @returns {Record<string, string>}
 */
export function describeError(err) {
  if (err instanceof SomfyAuthError) {
    return localize((l) =>
      pick(l, {
        en: 'Somfy Protect refused the account: check the email and the password.',
        fr: 'Somfy Protect a refusé le compte : vérifiez l’e-mail et le mot de passe.',
        de: 'Somfy Protect hat das Konto abgelehnt: Prüfe E-Mail und Passwort.',
        es: 'Somfy Protect ha rechazado la cuenta: compruebe el correo y la contraseña.',
      }),
    );
  }
  if (err instanceof SomfyRateLimitError) {
    return localize((l) =>
      pick(l, {
        en: `Somfy Protect limits the requests: next try in ${err.retryAfter} s.`,
        fr: `Somfy Protect limite les requêtes : nouvel essai dans ${err.retryAfter} s.`,
        de: `Somfy Protect begrenzt die Anfragen: nächster Versuch in ${err.retryAfter} s.`,
        es: `Somfy Protect limita las peticiones: nuevo intento en ${err.retryAfter} s.`,
      }),
    );
  }
  const status = err instanceof SomfyError && err.status ? ` (HTTP ${err.status})` : '';
  return localize((l) =>
    pick(l, {
      en: `Somfy Protect cloud unreachable${status}, check the integration logs.`,
      fr: `Cloud Somfy Protect injoignable${status}, consultez les logs de l’intégration.`,
      de: `Somfy-Protect-Cloud nicht erreichbar${status}, prüfe die Protokolle der Integration.`,
      es: `Nube de Somfy Protect inaccesible${status}, consulte los registros de la integración.`,
    }),
  );
}
