// Source configuration - Easy switching between modes
export const SOURCE_CONFIG = {
    // EINTHUSAN ONLY MODE - For testing Einthusan bypass
    EINTHUSAN_ONLY: {
        einthusan: true,
        einthusan_enhanced: false,
        yts: false,
        piratebay: false,
        movierulz: false,
        ytstv: false,
        cataz: false,
        fmovies: false,
        flixer: false,
        mkvcinemas: false,
        cineby: false,
        description: "Einthusan only - for bypass testing"
    },
    
    // ALL SOURCES MODE - For production use
    ALL_SOURCES: {
        einthusan: true,
        einthusan_enhanced: true,
        yts: true,
        piratebay: true,
        movierulz: true,
        ytstv: true,
        cataz: true,
        fmovies: true,
        flixer: true,
        mkvcinemas: true,
        cineby: true,
        description: "All sources enabled - production mode"
    },
    
    // YTS ONLY MODE - Search exclusively on YTS
    YTS_ONLY: {
        einthusan: false,
        einthusan_enhanced: false,
        yts: true,
        piratebay: false,
        movierulz: false,
        ytstv: false,
        cataz: false,
        fmovies: false,
        flixer: false,
        mkvcinemas: false,
        cineby: false,
        description: "YTS only - other sources disabled"
    },
    
    // WORKING SOURCES ONLY - When Einthusan is blocked
    WORKING_SOURCES: {
        einthusan: false,
        einthusan_enhanced: false,
        yts: true,
        piratebay: true,
        movierulz: true,
        ytstv: true,
        cataz: true,
        fmovies: true,
        flixer: true,
        mkvcinemas: true,
        cineby: true,
        description: "Working sources only - Einthusan blocked"
    },
    
    // NEW SOURCES ONLY - Test newly added sources
    NEW_SOURCES_ONLY: {
        einthusan: false,
        einthusan_enhanced: true,
        yts: false,
        piratebay: false,
        movierulz: false,
        ytstv: false,
        cataz: true,
        fmovies: true,
        flixer: true,
        mkvcinemas: true,
        cineby: true,
        description: "New sources only - testing enhanced einthusan and cataz"
    },
    
    // TESTING MODE - All sources disabled for individual testing
    TESTING_MODE: {
        einthusan: false,
        einthusan_enhanced: false,
        yts: false,
        piratebay: false,
        movierulz: false,
        ytstv: false,
        cataz: false,
        fmovies: false,
        flixer: false,
        mkvcinemas: false,
        cineby: false,
        description: "Testing mode - all sources disabled for individual testing"
    }
};

// Current mode - Change this to switch between modes
export const CURRENT_MODE = 'TESTING_MODE'; // Options: EINTHUSAN_ONLY, ALL_SOURCES, WORKING_SOURCES, YTS_ONLY, NEW_SOURCES_ONLY, TESTING_MODE

// Get current source configuration
export function getCurrentSourceConfig() {
    return SOURCE_CONFIG[CURRENT_MODE];
}

// Check if a source is enabled
export function isSourceEnabled(sourceName) {
    const config = getCurrentSourceConfig();
    return config[sourceName] === true;
}

// Get enabled sources list
export function getEnabledSources() {
    const config = getCurrentSourceConfig();
    return Object.entries(config)
        .filter(([key, value]) => key !== 'description' && value === true)
        .map(([key]) => key);
}

// Log current configuration
export function logSourceConfig() {
    const config = getCurrentSourceConfig();
    const enabled = getEnabledSources();
    
    console.log(`[SourceConfig] Current mode: ${CURRENT_MODE}`);
    console.log(`[SourceConfig] Description: ${config.description}`);
    console.log(`[SourceConfig] Enabled sources: ${enabled.join(', ')}`);
    console.log(`[SourceConfig] Disabled sources: ${Object.keys(config).filter(key => key !== 'description' && !config[key]).join(', ')}`);
}

// Healthcheck sources configuration
export const healthcheckSources = {
    yts: 'https://yts.mx',
    piratebay: 'https://pirate-proxy.app',
    movierulz: 'https://www.5movierulz.gripe',
    einthusan: 'https://einthusan.tv',
    ytstv: 'https://yts.rs',
    cataz: 'https://cataz.to',
    fmovies: 'https://www.fmovies.gd',
    flixer: 'https://flixer.sh',
    mkvcinemas: 'https://mkvcinemas.haus',
    cineby: 'https://www.cineby.app'
};