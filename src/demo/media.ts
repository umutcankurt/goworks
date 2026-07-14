// Inline assets for demo mode.
//
// Everything here is a `data:` URI. The prototype must render identically with
// no network: a remote logo or Drive-hosted signature image would show up as a
// broken-image icon in every screenshot.

function svgDataUri(markup: string): string {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup.replace(/\s+/g, ' ').trim())}`;
}

/** Rounded-square brand mark carrying the tenant abbreviation. Sidebar logo. */
export function logoDataUri(abbr: string, from = '#6366f1', to = '#0ea5e9'): string {
    const size = abbr.length > 3 ? 15 : 19;
    return svgDataUri(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
            <defs>
                <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0" stop-color="${from}"/>
                    <stop offset="1" stop-color="${to}"/>
                </linearGradient>
            </defs>
            <rect x="0" y="0" width="64" height="64" rx="16" fill="url(#g)"/>
            <text x="32" y="32" fill="#ffffff" font-family="Inter, Helvetica, Arial, sans-serif"
                  font-size="${size}" font-weight="700" letter-spacing="0.5"
                  text-anchor="middle" dominant-baseline="central">${abbr}</text>
        </svg>
    `);
}

/** Initials avatar for the signed-in demo admin (Header, top right). */
export function avatarDataUri(initials: string): string {
    return svgDataUri(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
            <rect width="64" height="64" rx="32" fill="#334155"/>
            <text x="32" y="33" fill="#e2e8f0" font-family="Inter, Helvetica, Arial, sans-serif"
                  font-size="24" font-weight="600" text-anchor="middle" dominant-baseline="central">${initials}</text>
        </svg>
    `);
}

/** Wordmark used inside the signature templates ({{image_1}}). */
export function signatureWordmarkDataUri(companyName: string, accent = '#6366f1'): string {
    return svgDataUri(`
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 220 48" width="220" height="48">
            <rect x="0" y="8" width="32" height="32" rx="8" fill="${accent}"/>
            <circle cx="16" cy="24" r="7" fill="#ffffff" opacity="0.9"/>
            <text x="44" y="25" fill="#1e293b" font-family="Inter, Helvetica, Arial, sans-serif"
                  font-size="17" font-weight="700" dominant-baseline="central">${companyName}</text>
        </svg>
    `);
}

/** Small social badge ({{image_2}}). */
export const socialBadgeDataUri = svgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
        <rect width="24" height="24" rx="4" fill="#0a66c2"/>
        <text x="12" y="13" fill="#ffffff" font-family="Inter, Helvetica, Arial, sans-serif"
              font-size="11" font-weight="700" text-anchor="middle" dominant-baseline="central">in</text>
    </svg>
`);

/** Thin separator bar ({{image_3}}). */
export const dividerDataUri = svgDataUri(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 3" width="320" height="3">
        <rect width="320" height="3" rx="1.5" fill="#6366f1" opacity="0.35"/>
    </svg>
`);
