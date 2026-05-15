/**
 * IPC sınırında error işleme yardımcıları.
 *
 * Kritik kural: stack trace IPC üzerinde KAYBOLMAMALI. Pattern:
 *
 *     } catch (error) {
 *         logger.error('[admin:getUsers] failed', error);   // tam stack
 *         return { success: false, error: toUserMessage(error) }; // sadece message
 *     }
 *
 * Logger Faz C1'de error.stack'i dosyaya yazıyor; renderer'a sadece
 * okunaklı string gönderilir.
 */
import { isUserFacingError } from './errors';

const GENERIC_TR = 'Beklenmeyen hata oluştu. Detaylar log dosyasındadır.';

/**
 * Renderer'a gösterilecek mesajı döner.
 * - `UserFacingError` → kendi message'ı (Türkçe, hazırlanmış)
 * - Generic Error / unknown → "Beklenmeyen hata oluştu (log dosyasında detay)"
 *
 * Stack/PII renderer'a SIZMAZ.
 */
export function toUserMessage(error: unknown): string {
    if (isUserFacingError(error)) {
        return error.message;
    }
    return GENERIC_TR;
}

/**
 * Bir hatayı tek satır log mesajına dönüştürür. Logger.error genelde
 * Error instance'ı kabul eder ve stack'i kendi serialize eder; bu helper
 * label + serialized error stringi tek formatta toplamak için.
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
 * IPC response için generic discriminated union.
 *
 *     async (_, params): Promise<IpcResult<UserList>> => { ... }
 *
 * Renderer tarafı `if (result.success) { use result.data } else { toast(result.error) }`.
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
