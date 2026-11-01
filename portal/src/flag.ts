// What a flag looks like: FLAG{ + 10 hex characters + }. The stage apps and the
// Function both produce exactly this (see appwrite/functions/ctf/src/flags.js).
// A test pins this pattern to the real generator.
export const FLAG_PATTERN = /^FLAG\{[0-9a-f]{10}\}$/i

// Pasted flags often carry spaces or a newline; the Function ignores them too.
export const sanitizeFlag = (raw: string): string => raw.replace(/\s+/g, '')

export const isFlagShape = (raw: string): boolean => FLAG_PATTERN.test(sanitizeFlag(raw))
