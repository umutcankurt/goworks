/**
 * Helpers for handling errors at the IPC boundary.
 *
 * Critical rule: the stack trace MUST NOT be lost across IPC. Pattern:
 *
 *     } catch (error) {
 *         logger.error('[admin:getUsers] failed', error);   // full stack
 *         return { success: false, error: toUserMessage(error) }; // message only
 *     }
 *
 * As of Phase C1, the logger writes error.stack to the file; only a readable
 * string is sent to the renderer.
 */
import { isUserFacingError } from './errors';

const GENERIC_TR = 'Beklenmeyen hata oluştu. Detaylar log dosyasındadır.';

/**
 * Same wording requireGoogleAuth() uses, so the user gets one consistent story
 * whether the session was already known to be dead or Google rejected the token
 * mid-call. Dashboard's ErrorCard matches on 'oturum', so this keeps its
 * "sign in again" guidance working.
 */
const GOOGLE_AUTH_TR = 'Google oturumunuz sona erdi. Lütfen tekrar giriş yapın.';

/**
 * Recognises an expired/revoked Google credential.
 *
 * Deliberately AUTHENTICATION only — a 403 means the session is fine but the
 * account lacks the right, and telling that user to sign in again sends them
 * round a loop that cannot help.
 *
 * This maps a recognised error CLASS to a fixed string we own; it never echoes
 * the underlying message, so nothing leaks.
 */
function isGoogleAuthFailure(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false;
    const e = error as { code?: unknown; status?: unknown; message?: unknown; response?: { status?: unknown } };
    if (e.code === 401 || e.status === 401 || e.response?.status === 401) return true;
    if (typeof e.message !== 'string') return false;
    const m = e.message.toLowerCase();
    return m.includes('invalid authentication credentials')
        || m.includes('invalid credentials')
        || m.includes('invalid_grant')
        // google-auth-library, when the client holds nothing at all.
        || m.includes('no access, refresh token');
}

/**
 * Returns the message to show in the renderer.
 * - `UserFacingError` → its own message (prepared, in Turkish)
 * - Generic Error / unknown → "Beklenmeyen hata oluştu (log dosyasında detay)"
 *
 * Stack/PII does NOT leak to the renderer.
 */
export function toUserMessage(error: unknown): string {
    if (isUserFacingError(error)) {
        return error.message;
    }
    // A dead Google session is the one generic failure the user can actually act
    // on, and it is common enough that "Beklenmeyen hata oluştu" wastes their time.
    if (isGoogleAuthFailure(error)) {
        return GOOGLE_AUTH_TR;
    }
    return GENERIC_TR;
}

/**
 * Converts an error into a single-line log message. Logger.error usually accepts
 * an Error instance and serializes the stack itself; this helper is for combining
 * a label + serialized error string into a single format.
 */
export function formatErrorForLog(error: unknown): string {
    if (error instanceof Error) {
        return error.stack || `${error.name}: ${error.message}`;
    }
    if (error === null) return 'null';
    if (error === undefined) return 'undefined';
    try {
        return JSON.stringify(error);
    } catch {
        return String(error);
    }
}

/**
 * Generic discriminated union for IPC responses.
 *
 *     async (_, params): Promise<IpcResult<UserList>> => { ... }
 *
 * Renderer side: `if (result.success) { use result.data } else { toast(result.error) }`.
 */
export type IpcResult<T> =
    | { success: true; data: T }
    | { success: false; error: string };

export function ok<T>(data: T): IpcResult<T> {
    return { success: true, data };
}

export function fail(error: unknown): IpcResult<never> {
    return { success: false, error: toUserMessage(error) };
}
