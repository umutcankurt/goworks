// Build-time constants. The placeholder strings below are replaced with the
// real package.json version and the build timestamp by the `goworks-build-info`
// Vite plugin (see vite.config.ts), in both dev and build — so version + date
// update automatically on every build with no manual edits. Consumers import
// these constants instead of relying on globals or import.meta.env.
export const APP_VERSION = '__GOWORKS_APP_VERSION__';
export const BUILD_DATE = '__GOWORKS_BUILD_DATE__';
