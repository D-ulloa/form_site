export declare function normalizeSearchText(value: string): string;
/** Empty after trim means "no filter". Throws ZodError for invalid input. */
export declare function parseSearch(raw: unknown): string | null;
/** needle must already be normalizeSearchText output. */
export declare function searchMatches(haystack: string | null | undefined, needle: string): boolean;
//# sourceMappingURL=searchText.d.ts.map