const getTrayIconPathForMenuBar = ({
    platform,
    shouldUseDarkColors,
    defaultIconPath,
    whiteModeIconPath,
}) => {
    if (platform === 'darwin' && shouldUseDarkColors === false) {
        return whiteModeIconPath;
    }

    return defaultIconPath;
};

module.exports = {
    getTrayIconPathForMenuBar,
};
