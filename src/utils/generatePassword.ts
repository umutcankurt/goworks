/**
 * Cryptographically secure random password generator.
 *
 * Unlike `passwordStrength.ts` — which is a UX hint — this IS a security control:
 * the string it returns becomes a live Google Workspace account password during
 * offboarding (`src/pages/Offboard.tsx`, the `reset_pwd` step).
 *
 * `Math.random()` must never be used here. It is not a CSPRNG: V8 implements it
 * with xorshift128+, whose internal state can be recovered from a couple of
 * observed outputs, which makes every subsequent "random" password predictable.
 * CodeQL flags that as `js/insecure-randomness`, and an ESLint rule now blocks it
 * repo-wide. `crypto.getRandomValues()` is the renderer-side CSPRNG; the main
 * process uses `randomBytes()` from `node:crypto` for the same purpose (see the
 * OAuth state / PKCE verifier in `electron/auth-service.ts` and the vault key
 * material in `electron/services/vault-service.ts`).
 */

/**
 * Ambiguity-free alphabet: `I`, `l`, `O`, `0` and `1` are excluded so a password
 * can be read aloud or transcribed without confusion. 63 characters, covering all
 * four classes Google Workspace accepts.
 */
export const PASSWORD_ALPHABET =
    'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*';

/** 24 characters over the 63-symbol alphabet is ~143 bits of entropy. */
export const DEFAULT_GENERATED_PASSWORD_LENGTH = 24;

/**
 * Generate a random password using rejection sampling over a CSPRNG byte stream.
 *
 * @throws if `length` is not a positive integer, or if `alphabet` does not hold
 * between 2 and 256 characters — outside that range the sampling below is either
 * meaningless or non-terminating.
 */
export function generatePassword(
    length: number = DEFAULT_GENERATED_PASSWORD_LENGTH,
    alphabet: string = PASSWORD_ALPHABET,
): string {
    if (!Number.isInteger(length) || length < 1) {
        throw new Error(`generatePassword: length must be a positive integer, got ${length}`);
    }

    const n = alphabet.length;
    if (n < 2 || n > 256) {
        throw new Error(`generatePassword: alphabet must hold 2-256 characters, got ${n}`);
    }

    // Largest multiple of n that fits in a byte. Bytes at or above it are thrown
    // away: mapping the whole 0-255 range with `% n` would make the first
    // (256 % n) symbols more likely than the rest. For the 63-character alphabet
    // 256 % 63 === 4, so bytes >= 252 are rejected.
    const limit = 256 - (256 % n);

    const buffer = new Uint8Array(length);
    let password = '';

    while (password.length < length) {
        crypto.getRandomValues(buffer);
        for (const byte of buffer) {
            if (byte >= limit) continue; // would bias the result
            password += alphabet[byte % n];
            if (password.length === length) break;
        }
    }

    return password;
}
