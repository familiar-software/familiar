const getReduceTransparencyEnabled = ({
    nativeTheme = {},
    platform = process.platform,
} = {}) => {
    if (platform !== 'darwin') {
        return false;
    }

    return Boolean(nativeTheme?.prefersReducedTransparency);
};

module.exports = {
    getReduceTransparencyEnabled,
};
