/**
 * Lightweight master-password strength heuristic — no external dependency.
 *
 * Used by every screen that asks the user to choose a master password
 * (onboarding step, vault setup/lock screen, Settings → change password) so the
 * minimum length and the weak/medium/strong meter stay consistent everywhere.
 *
 * This is a UX hint, NOT a security control: the real protection is the Argon2id
 * KDF cost in `electron/services/vault-service.ts`. We deliberately avoid a heavy
 * estimator (zxcvbn) to keep the renderer bundle small.
 */

/** Hard minimum enforced before a vault can be created. */
export const MIN_PASSWORD_LENGTH = 6;

/** Soft recommendation surfaced as a hint (not enforced). */
export const RECOMMENDED_PASSWORD_LENGTH = 12;

export type PasswordStrengthLevel = 'weak' | 'medium' | 'strong';

export interface PasswordStrength {
    /** 0–4, suitable for a 4-segment meter. */
    score: number;
    level: PasswordStrengthLevel;
}

/**
 * Score a password from its length and character-class variety. Returns a 0–4
 * score and a coarse level. Empty → weak/0.
 */
export function evaluatePasswordStrength(password: string): PasswordStrength {
    if (!password) return { score: 0, level: 'weak' };

    let score = 0;
    // Length contributes up to 3 points.
    if (password.length >= MIN_PASSWORD_LENGTH) score += 1;
    if (password.length >= 10) score += 1;
    if (password.length >= RECOMMENDED_PASSWORD_LENGTH) score += 1;

    // Character-class variety contributes up to 2 points.
    const classes =
        (/[a-z]/.test(password) ? 1 : 0) +
        (/[A-Z]/.test(password) ? 1 : 0) +
        (/[0-9]/.test(password) ? 1 : 0) +
        (/[^A-Za-z0-9]/.test(password) ? 1 : 0);
    if (classes >= 3) score += 1;
    if (classes === 4) score += 1;

    score = Math.min(4, score);
    const level: PasswordStrengthLevel = score <= 1 ? 'weak' : score <= 3 ? 'medium' : 'strong';
    return { score, level };
}
