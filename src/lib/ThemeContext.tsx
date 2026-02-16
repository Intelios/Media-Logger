import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
    ColorTheme,
    GlassStyle,
    ThemeMode,
    COLOR_THEMES,
    MODE_THEMES,
    STORAGE_KEYS,
    getDefaultColorTheme,
    getDefaultGlassStyle,
    getDefaultThemeMode,
    getColorThemeById,
} from './themes';

interface ThemeContextType {
    colorTheme: ColorTheme;
    themeMode: ThemeMode;
    glassStyle: GlassStyle;
    setColorTheme: (theme: ColorTheme) => void;
    setThemeMode: (mode: ThemeMode) => void;
    setGlassStyle: (style: GlassStyle) => void;
    colorThemes: ColorTheme[];
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getGlassColors(mode: ThemeMode, glassStyle: GlassStyle) {
    const base = MODE_THEMES[mode].colors;
    if (glassStyle === 'default') return base;

    if (mode === 'light') {
        return {
            ...base,
            background: 'rgba(255, 255, 255, 0.58)',
            backgroundAlt: 'rgba(248, 250, 252, 0.5)',
            surface: 'rgba(255, 255, 255, 0.28)',
            surfaceHover: 'rgba(255, 255, 255, 0.38)',
            border: 'rgba(255, 255, 255, 0.38)',
            borderSubtle: 'rgba(255, 255, 255, 0.22)',
            scrollbarThumb: 'rgba(0, 0, 0, 0.22)',
            scrollbarThumbHover: 'rgba(0, 0, 0, 0.35)',
        };
    }

    return {
        ...base,
        background: 'rgba(10, 10, 10, 0.56)',
        backgroundAlt: 'rgba(18, 18, 18, 0.48)',
        surface: 'rgba(30, 30, 30, 0.34)',
        surfaceHover: 'rgba(42, 42, 42, 0.5)',
        border: 'rgba(255, 255, 255, 0.2)',
        borderSubtle: 'rgba(255, 255, 255, 0.12)',
        scrollbarThumb: 'rgba(255, 255, 255, 0.25)',
        scrollbarThumbHover: 'rgba(255, 255, 255, 0.36)',
    };
}

async function applyNativeGlassStyle(style: GlassStyle): Promise<void> {
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
        return;
    }

    try {
        await invoke('apply_glass_style', { style });
    } catch (error) {
        console.error('Failed to apply native glass style:', error);
    }
}

// Apply theme to CSS variables
function applyTheme(colorTheme: ColorTheme, mode: ThemeMode, glassStyle: GlassStyle): void {
    const root = document.documentElement;
    const modeColors = getGlassColors(mode, glassStyle);

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
    root.setAttribute('data-glass-style', glassStyle);

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
function loadPersistedTheme(): { colorTheme: ColorTheme; themeMode: ThemeMode; glassStyle: GlassStyle } {
    try {
        const savedColorThemeId = localStorage.getItem(STORAGE_KEYS.colorTheme);
        const savedMode = localStorage.getItem(STORAGE_KEYS.themeMode) as ThemeMode | null;
        const savedGlassStyle = localStorage.getItem(STORAGE_KEYS.glassStyle) as GlassStyle | null;

        const colorTheme = savedColorThemeId
            ? getColorThemeById(savedColorThemeId)
            : getDefaultColorTheme();

        const themeMode = savedMode && (savedMode === 'dark' || savedMode === 'light')
            ? savedMode
            : getSystemThemeMode();

        const glassStyle = savedGlassStyle === 'clear' ? 'clear' : getDefaultGlassStyle();

        return { colorTheme, themeMode, glassStyle };
    } catch {
        return {
            colorTheme: getDefaultColorTheme(),
            themeMode: getSystemThemeMode(),
            glassStyle: getDefaultGlassStyle(),
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

    const [glassStyle, setGlassStyleState] = useState<GlassStyle>(() => {
        const { glassStyle } = loadPersistedTheme();
        return glassStyle;
    });

    // Apply theme on mount and whenever it changes
    useEffect(() => {
        applyTheme(colorTheme, themeMode, glassStyle);
    }, [colorTheme, themeMode, glassStyle]);

    // Keep native macOS glass variant in sync with appearance setting.
    useEffect(() => {
        void applyNativeGlassStyle(glassStyle);
    }, [glassStyle]);

    const setColorTheme = useCallback((theme: ColorTheme) => {
        setColorThemeState(theme);
        localStorage.setItem(STORAGE_KEYS.colorTheme, theme.id);
    }, []);

    const setThemeMode = useCallback((mode: ThemeMode) => {
        setThemeModeState(mode);
        localStorage.setItem(STORAGE_KEYS.themeMode, mode);
    }, []);

    const setGlassStyle = useCallback((style: GlassStyle) => {
        setGlassStyleState(style);
        localStorage.setItem(STORAGE_KEYS.glassStyle, style);
    }, []);

    return (
        <ThemeContext.Provider
            value={{
                colorTheme,
                themeMode,
                glassStyle,
                setColorTheme,
                setThemeMode,
                setGlassStyle,
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
