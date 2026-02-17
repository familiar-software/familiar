function toStringArray(value) {
    if (Array.isArray(value)) {
        return value.filter((entry) => typeof entry === 'string');
    }
    if (typeof value === 'string') {
        return [value];
    }
    return [];
}

function normalizeStringArray(value, options = {}) {
    const trim = options.trim !== false;
    const lowerCase = options.lowerCase === true;
    const dedupe = options.dedupe !== false;

    const entries = toStringArray(value)
        .map((entry) => (trim ? entry.trim() : entry))
        .filter((entry) => entry.length > 0)
        .map((entry) => (lowerCase ? entry.toLowerCase() : entry));

    return dedupe ? Array.from(new Set(entries)) : entries;
}

module.exports = {
    toStringArray,
    normalizeStringArray,
};
