/**
 * GoWorks error types.
 *
 * `UserFacingError`: carries a human-readable message (in Turkish) that can be
 * shown to the user as a toast in the renderer. Service/worker code throws this
 * class for errors it wants to surface to the user.
 *
 * Generic `Error`: internal error. At the IPC boundary, `toUserMessage()` maps it
 * to the generic "Beklenmeyen hata oluştu" toast, while the stack is kept in the
 * log file.
 */

export class UserFacingError extends Error {
    readonly isUserFacing = true as const;
    constructor(message: string) {
        super(message);
        this.name = 'UserFacingError';
        // V8 stack capture (works in Node environments)
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
