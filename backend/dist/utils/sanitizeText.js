/**
 * Sanitizes a text string for use in Drive folder names.
 * Steps: lowercase → strip accents → remove special chars → collapse spaces → hyphens.
 */
export function sanitizeText(text) {
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove combining diacritics
        .replace(/[^a-z0-9\s-]/g, '') // Remove non-alphanumeric (keep spaces and hyphens)
        .trim()
        .replace(/\s+/g, '-') // Spaces → hyphens
        .replace(/-+/g, '-'); // Collapse consecutive hyphens
}
//# sourceMappingURL=sanitizeText.js.map