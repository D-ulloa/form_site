export function isValidContractGoogleFormLink(value) {
    try {
        const url = new URL(value);
        return url.protocol === 'http:' || url.protocol === 'https:';
    }
    catch {
        return false;
    }
}
export function isValidContractSpreadsheetId(value) {
    return /^[A-Za-z0-9_-]{10,200}$/u.test(value);
}
export function isValidContractSheetName(value) {
    return value.length > 0 &&
        value.length <= 100 &&
        !/[\u0000-\u001F\u007F]/u.test(value);
}
//# sourceMappingURL=contractEnvironmentValidation.js.map