import Papa from 'papaparse';

export interface ParseResult {
    data: Record<string, string>[];
    errors: string[];
    meta: Papa.ParseMeta;
}

export const parseUserCsv = (file: File): Promise<ParseResult> => {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: 'greedy',
            complete: (results: Papa.ParseResult<any>) => {
                const errors: string[] = [];
                const data: Record<string, string>[] = [];

                results.data.forEach((row: any) => {
                    // Normalize keys: lowercase + trim
                    const normalized: Record<string, string> = {};
                    let hasValue = false;

                    for (const [key, value] of Object.entries(row)) {
                        const normalizedKey = key.trim().toLowerCase();
                        const normalizedValue = typeof value === 'string' ? value.trim() : '';
                        normalized[normalizedKey] = normalizedValue;
                        if (normalizedValue) hasValue = true;
                    }

                    if (hasValue) {
                        data.push(normalized);
                    }
                });

                // Add PapaParse errors if any, filtering out benign warnings
                results.errors.forEach(err => {
                    if (err.code === 'UndetectableDelimiter') return;

                    const lineInfo = err.row !== undefined ? `Line ${err.row + 2}: ` : '';
                    errors.push(`${lineInfo}${err.message}`);
                });

                resolve({
                    data,
                    errors,
                    meta: results.meta
                });
            },
            error: (error: Error) => {
                reject(error);
            }
        });
    });
};
