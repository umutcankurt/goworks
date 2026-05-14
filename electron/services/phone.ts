export function formatPhoneNumber(raw: string): string {
    let digits = raw.replace(/\D/g, '');
    if (digits.startsWith('0')) {
        digits = '90' + digits.slice(1);
    } else if (digits.length > 0 && !digits.startsWith('9')) {
        digits = '90' + digits;
    }
    digits = digits.slice(0, 12);
    let formatted = '';
    if (digits.length > 0) formatted += digits.slice(0, 2);
    if (digits.length > 2) formatted += ' ' + digits.slice(2, 5);
    if (digits.length > 5) formatted += ' ' + digits.slice(5, 8);
    if (digits.length > 8) formatted += ' ' + digits.slice(8, 10);
    if (digits.length > 10) formatted += ' ' + digits.slice(10, 12);
    return formatted;
}

export function formatPhoneForSignature(raw: string): string {
    if (!raw) return '';
    let digits = raw.replace(/\D/g, '');
    if (digits.startsWith('0')) {
        digits = '90' + digits.slice(1);
    } else if (digits.length > 0 && !digits.startsWith('9')) {
        digits = '90' + digits;
    }
    digits = digits.slice(0, 12);
    if (digits.length < 4) return digits;
    const domestic = '0' + digits.slice(2);
    let formatted = domestic.slice(0, 4);
    if (domestic.length > 4) formatted += ' ' + domestic.slice(4, 7);
    if (domestic.length > 7) formatted += ' ' + domestic.slice(7, 9);
    if (domestic.length > 9) formatted += ' ' + domestic.slice(9, 11);
    return formatted;
}
