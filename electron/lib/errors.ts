/**
 * GoWorks error tipleri.
 *
 * `UserFacingError`: Renderer'a toast olarak basılabilecek, kullanıcıya
 * okunaklı bir mesaj taşır (Türkçe). Servis/worker kodu kullanıcıya
 * göstermek istediği hatayı bu sınıfla atar.
 *
 * Generic `Error`: İnternal hata. IPC sınırında `toUserMessage()` ile
 * "Beklenmeyen hata oluştu" generic toast'a düşer, stack log dosyasında
 * tutulur.
 */

export class UserFacingError extends Error {
    readonly isUserFacing = true as const;
    constructor(message: string) {
        super(message);
        this.name = 'UserFacingError';
        // V8 stack capture (Node ortamlarında çalışır)
        if (typeof (Error as { captureStackTrace?: (target: object, ctor: unknown) => void })
            .captureStackTrace === 'function') {
            (Error as { captureStackTrace: (target: object, ctor: unknown) => void })
                .captureStackTrace(this, UserFacingError);
        }
    }
}

export function isUserFacingError(err: unknown): err is UserFacingError {
    return err instanceof Error && (err as Error & { isUserFacing?: boolean }).isUserFacing === true;
}
