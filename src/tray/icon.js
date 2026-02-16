const getTrayIconPathForMenuBar = ({
    platform,
    shouldUseDarkColors,
    reduceTransparencyEnabled = true,
    defaultIconPath,
    reduceTransparencyIconPath,
}) => {
    if (platform !== 'darwin') {
        return defaultIconPath;
    }

    const isDarkTheme = shouldUseDarkColors === true;
    const isReduceTransparencyEnabled = reduceTransparencyEnabled === true;
    const shouldUseReduceTransparencyIcon = !isDarkTheme && isReduceTransparencyEnabled;

    return shouldUseReduceTransparencyIcon ? reduceTransparencyIconPath : defaultIconPath;
};

module.exports = {
    getTrayIconPathForMenuBar,
};
