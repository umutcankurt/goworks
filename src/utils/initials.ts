/**
 * Generate uppercase initials from a name (Turkish-aware).
 *
 * "Acme Eğitim" → "AE", "GoWorks" → "G", "  acme  eğitim  " → "AE"
 * Returns "" for empty/whitespace-only input.
 * Caps result at `max` characters (default 3).
 */
export function initialsFrom(name: string | null | undefined, max = 3): string {
    if (!name) return '';
    const words = name
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    if (words.length === 0) return '';
    return words
        .slice(0, max)
        .map((w) => w.charAt(0).toLocaleUpperCase('tr-TR'))
        .join('');
}
