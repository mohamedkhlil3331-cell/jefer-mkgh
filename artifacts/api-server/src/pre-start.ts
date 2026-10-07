// Restoring here used to run before development writer coordination. Keep this
// entrypoint harmless: index.ts acquires the writer lock before restoring.
console.log("[pre-start] Standalone restore skipped; the API server restores after acquiring writer ownership.");
