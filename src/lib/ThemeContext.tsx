import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
    ColorTheme,
    ThemeMode,
    COLOR_THEMES,
    MODE_THEMES,
    STORAGE_KEYS,
    getDefaultColorTheme,
    getDefaultThemeMode,
    getColorThemeById,
} from './themes';

interface ThemeContextType {
    colorTheme: ColorTheme;
    themeMode: ThemeMode;
    setColorTheme: (theme: ColorTheme) => void;
    setThemeMode: (mode: ThemeMode) => void;
    colorThemes: ColorTheme[];
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

// Apply theme to CSS variables
function applyTheme(colorTheme: ColorTheme, mode: ThemeMode): void {
    const root = document.documentElement;
    const modeColors = MODE_THEMES[mode].colors;

    // Color theme variables
    root.style.setProperty('--color-primary', colorTheme.primary);
    root.style.setProperty('--color-secondary', colorTheme.secondary);

    // Mode theme variables
    root.style.setProperty('--color-background', modeColors.background);
    root.style.setProperty('--color-background-alt', modeColors.backgroundAlt);
    root.style.setProperty('--color-surface', modeColors.surface);
    root.style.setProperty('--color-surface-hover', modeColors.surfaceHover);
    root.style.setProperty('--color-text', modeColors.text);
    root.style.setProperty('--color-text-muted', modeColors.textMuted);
    root.style.setProperty('--color-text-subtle', modeColors.textSubtle);
    root.style.setProperty('--color-border', modeColors.border);
    root.style.setProperty('--color-border-subtle', modeColors.borderSubtle);
    root.style.setProperty('--color-scrollbar-thumb', modeColors.scrollbarThumb);
    root.style.setProperty('--color-scrollbar-thumb-hover', modeColors.scrollbarThumbHover);

    // Set color scheme for native elements
    root.style.setProperty('color-scheme', mode);
    root.setAttribute('data-theme-mode', mode);

    // Toggle light mode class for any CSS that needs it
    if (mode === 'light') {
        root.classList.add('light-mode');
        root.classList.remove('dark-mode');
    } else {
        root.classList.add('dark-mode');
        root.classList.remove('light-mode');
    }
}

function getSystemThemeMode(): ThemeMode {
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: light)').matches) {
        return 'light';
    }
    return getDefaultThemeMode();
}

// Load persisted theme from localStorage
function loadPersistedTheme(): { colorTheme: ColorTheme; themeMode: ThemeMode } {
    try {
        const savedColorThemeId = localStorage.getItem(STORAGE_KEYS.colorTheme);
        const savedMode = localStorage.getItem(STORAGE_KEYS.themeMode) as ThemeMode | null;

        const colorTheme = savedColorThemeId
            ? getColorThemeById(savedColorThemeId)
            : getDefaultColorTheme();

        const themeMode = savedMode && (savedMode === 'dark' || savedMode === 'light')
            ? savedMode
            : getSystemThemeMode();

        return { colorTheme, themeMode };
    } catch {
        return {
            colorTheme: getDefaultColorTheme(),
            themeMode: getSystemThemeMode(),
        };
    }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [colorTheme, setColorThemeState] = useState<ColorTheme>(() => {
        const { colorTheme } = loadPersistedTheme();
        return colorTheme;
    });

    const [themeMode, setThemeModeState] = useState<ThemeMode>(() => {
        const { themeMode } = loadPersistedTheme();
        return themeMode;
    });

    // Apply theme on mount and whenever it changes
    useEffect(() => {
        applyTheme(colorTheme, themeMode);
    }, [colorTheme, themeMode]);

    const setColorTheme = useCallback((theme: ColorTheme) => {
        setColorThemeState(theme);
        localStorage.setItem(STORAGE_KEYS.colorTheme, theme.id);
    }, []);

    const setThemeMode = useCallback((mode: ThemeMode) => {
        setThemeModeState(mode);
        localStorage.setItem(STORAGE_KEYS.themeMode, mode);
    }, []);

    return (
        <ThemeContext.Provider
            value={{
                colorTheme,
                themeMode,
                setColorTheme,
                setThemeMode,
                colorThemes: COLOR_THEMES,
            }}
        >
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme(): ThemeContextType {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
