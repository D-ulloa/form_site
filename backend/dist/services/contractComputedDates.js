const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;
function parseIsoDateParts(value) {
    if (!ISO_DATE_PATTERN.test(value))
        return null;
    const year = Number(value.slice(0, 4));
    const month = Number(value.slice(5, 7));
    const day = Number(value.slice(8, 10));
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year ||
        date.getUTCMonth() !== month - 1 ||
        date.getUTCDate() !== day) {
        return null;
    }
    return { year, month, day };
}
function toIsoDate(date) {
    return date.toISOString().slice(0, 10);
}
export function computeContractFormattedStart(startDate) {
    const parts = parseIsoDateParts(startDate);
    if (!parts)
        return null;
    return toIsoDate(new Date(Date.UTC(parts.year, parts.month - 1, 0)));
}
export function computeContractFormattedUpdate(formattedStart, updateMonths) {
    const parts = parseIsoDateParts(formattedStart);
    if (!parts || updateMonths === null || updateMonths === undefined)
        return null;
    if (!Number.isSafeInteger(updateMonths) || updateMonths < 0)
        return null;
    return toIsoDate(new Date(Date.UTC(parts.year, parts.month - 1 + updateMonths + 1, 0)));
}
//# sourceMappingURL=contractComputedDates.js.map