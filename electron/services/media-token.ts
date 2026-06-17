/**
 * Pure helper for assigning stable per-template media tokens.
 *
 * Tokens are `image_1`, `image_2`, … and are never recomputed: the next token is
 * always `max(existing) + 1`, so deleting `image_2` leaves a gap rather than
 * renumbering `image_3` → `image_2` (which would break already-pushed signatures).
 * Kept separate from media-service so it is testable without a DB/electron context.
 */
export function computeNextToken(existingTokens: (string | null | undefined)[]): string {
    const max = existingTokens.reduce<number>((acc, tok) => {
        const match = /^image_(\d+)$/.exec(tok ?? '');
        return match ? Math.max(acc, Number(match[1])) : acc;
    }, 0);
    return `image_${max + 1}`;
}
