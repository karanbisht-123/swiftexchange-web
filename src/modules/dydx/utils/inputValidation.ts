export const validateNumberInput = (value: string): string => {
    const sanitized = value.replace(/[^0-9.]/g, '');
    const parts = sanitized.split('.');
    if (parts.length > 2) {
        return `${parts[0]}.${parts.slice(1).join('')}`;
    }
    return sanitized;
};
