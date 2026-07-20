import { UserFacingError } from './errors';

/**
 * Runtime validation for values arriving over IPC.
 *
 * TypeScript annotations on `ipcMain.handle` callbacks are erased at build, so
 * they constrain nothing at the boundary. These helpers are deliberately small
 * and hand-written rather than schema-driven: the set of things that actually
 * need checking here is enumerable, and the codebase's existing convention
 * (app-config-service's normalizeValue) is exactly this shape.
 *
 * They throw UserFacingError so the message survives toUserMessage() and
 * reaches the operator instead of collapsing to the generic string.
 */

/** Membership in a closed set, with the value echoed back narrowed. */
export function requireOneOf<T extends string>(
    value: unknown,
    allowed: readonly T[],
    label: string,
): T {
    if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
        throw new UserFacingError(`Geçersiz ${label}: ${String(value)}`);
    }
    return value as T;
}

export function requireString(value: unknown, label: string, maxLength = 512): string {
    if (typeof value !== 'string' || !value.trim()) {
        throw new UserFacingError(`${label} zorunlu.`);
    }
    if (value.length > maxLength) {
        throw new UserFacingError(`${label} çok uzun (en fazla ${maxLength} karakter).`);
    }
    return value.trim();
}

export function requirePattern(value: unknown, pattern: RegExp, label: string): string {
    const s = requireString(value, label);
    if (!pattern.test(s)) {
        throw new UserFacingError(`Geçersiz ${label} biçimi.`);
    }
    return s;
}

/**
 * An array with a hard length cap.
 *
 * The cap is the point: better-sqlite3 is synchronous, so an unbounded array
 * that reaches a transaction blocks the main process — and with it the job
 * runner, the idle auto-lock timer and every IPC call. A `jobs:create` payload
 * is worse still, because it is persisted and replayed by resumeOnStartup(),
 * turning one oversized request into a hang on every subsequent launch.
 */
export function requireArray<T>(value: unknown, label: string, maxLength: number): T[] {
    if (!Array.isArray(value)) {
        throw new UserFacingError(`${label} bir liste olmalı.`);
    }
    if (value.length > maxLength) {
        throw new UserFacingError(
            `${label} çok fazla kayıt içeriyor (${value.length}). Tek seferde en fazla ${maxLength} kayıt işlenebilir.`,
        );
    }
    return value as T[];
}

/** Keys a template token can actually have: TAG_REGEX matches `\w+` and nothing else. */
const TOKEN_KEY_REGEX = /^\w{1,64}$/;

/**
 * A flat string→string map, e.g. the variables backing a signature preview.
 *
 * Absent means empty, not invalid — the field is genuinely optional at every
 * call site. Returns a NEW object so a caller cannot hand the validated
 * reference back into a mutation, and so unvalidated extra fields cannot ride
 * along.
 *
 * `__proto__` and friends are rejected explicitly. Today the merge sites use
 * object spread, whose define-semantics make a `__proto__` key a harmless own
 * property; the day one of them becomes Object.assign it would be prototype
 * pollution instead. The key regex would already exclude them — this is a
 * second, deliberate line so that intent survives a future edit to the regex.
 */
export function requireStringRecord(
    value: unknown,
    label: string,
    maxEntries: number,
    maxValueLength: number,
): Record<string, string> {
    if (value === undefined || value === null) return {};
    if (typeof value !== 'object' || Array.isArray(value)) {
        throw new UserFacingError(`${label} bir nesne olmalı.`);
    }
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length > maxEntries) {
        throw new UserFacingError(
            `${label} çok fazla alan içeriyor (${entries.length}). En fazla ${maxEntries} alan olabilir.`,
        );
    }
    const out: Record<string, string> = {};
    for (const [key, raw] of entries) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
            throw new UserFacingError(`${label} içinde izin verilmeyen alan adı: ${key}`);
        }
        if (!TOKEN_KEY_REGEX.test(key)) {
            throw new UserFacingError(`${label} içinde geçersiz alan adı: ${key}`);
        }
        if (typeof raw !== 'string') {
            throw new UserFacingError(`${label} içindeki "${key}" alanı metin olmalı.`);
        }
        if (raw.length > maxValueLength) {
            throw new UserFacingError(
                `${label} içindeki "${key}" alanı çok uzun (en fazla ${maxValueLength} karakter).`,
            );
        }
        out[key] = raw;
    }
    return out;
}

export function requireBytes(
    value: ArrayBuffer | Uint8Array | undefined | null,
    label: string,
    maxBytes: number,
): Buffer {
    if (!value) {
        throw new UserFacingError(`${label} boş.`);
    }
    const buffer = Buffer.from(value instanceof Uint8Array ? value : new Uint8Array(value));
    if (buffer.byteLength === 0) {
        throw new UserFacingError(`${label} boş.`);
    }
    if (buffer.byteLength > maxBytes) {
        throw new UserFacingError(
            `${label} çok büyük (${Math.round(buffer.byteLength / 1024)} KB). En fazla ${Math.round(maxBytes / 1024)} KB.`,
        );
    }
    return buffer;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function requireEmailList(value: unknown, label: string, maxLength: number): string[] {
    const list = requireArray<unknown>(value, label, maxLength);
    return list.map((entry, i) => {
        if (typeof entry !== 'string' || !EMAIL_RE.test(entry.trim())) {
            throw new UserFacingError(`${label} içindeki ${i + 1}. kayıt geçerli bir e-posta değil.`);
        }
        return entry.trim();
    });
}

// --- Image sniffing -------------------------------------------------------

/**
 * Detect an image type from its leading bytes.
 *
 * The renderer supplies both the bytes and a `mimeType`, and nothing ties them
 * together — the browser's File.type is just the OS's guess from the file
 * extension. Since the label we hand to Drive becomes the Content-Type the CDN
 * serves the file with, it has to come from the bytes.
 *
 * SVG is deliberately absent: it has no magic number, it is script-bearing, and
 * signature media is embedded via <img src> from a public CDN URL. Rasters only.
 */
export function sniffImageMime(buffer: Buffer): string | null {
    if (buffer.length < 12) return null;

    // PNG: 89 50 4E 47 0D 0A 1A 0A
    if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
        return 'image/png';
    }
    // JPEG: FF D8 FF
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
        return 'image/jpeg';
    }
    // GIF: "GIF87a" / "GIF89a"
    if (buffer.subarray(0, 6).toString('latin1') === 'GIF87a'
        || buffer.subarray(0, 6).toString('latin1') === 'GIF89a') {
        return 'image/gif';
    }
    // WEBP: "RIFF" .... "WEBP"
    if (buffer.subarray(0, 4).toString('latin1') === 'RIFF'
        && buffer.subarray(8, 12).toString('latin1') === 'WEBP') {
        return 'image/webp';
    }
    return null;
}

export function requireImageBytes(
    value: ArrayBuffer | Uint8Array | undefined | null,
    label: string,
    maxBytes: number,
): { buffer: Buffer; mimeType: string } {
    const buffer = requireBytes(value, label, maxBytes);
    const mimeType = sniffImageMime(buffer);
    if (!mimeType) {
        throw new UserFacingError(
            `${label} tanınan bir görsel değil. Desteklenen biçimler: PNG, JPEG, GIF, WEBP.`,
        );
    }
    return { buffer, mimeType };
}
