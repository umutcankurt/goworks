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
