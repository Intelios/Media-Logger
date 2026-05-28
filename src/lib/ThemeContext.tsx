import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import {
    ColorTheme,
    GlassStyle,
    COLOR_THEMES,
    DARK_COLORS,
    STORAGE_KEYS,
    getDefaultColorTheme,
    getDefaultGlassStyle,
    getColorThemeById,
} from './themes';

interface ThemeContextType {
    colorTheme: ColorTheme;
    glassStyle: GlassStyle;
    setColorTheme: (theme: ColorTheme) => void;
    setGlassStyle: (style: GlassStyle) => void;
    colorThemes: ColorTheme[];
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

function getGlassColors(glassStyle: GlassStyle) {
    const base = DARK_COLORS;
    if (glassStyle === 'default') return base;

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
        await invoke('apply_glass_style', { style, mode: 'dark' });
    } catch (error) {
        console.error('Failed to apply native window backdrop:', error);
    }
}

function applyTheme(colorTheme: ColorTheme, glassStyle: GlassStyle): void {
    const root = document.documentElement;
    const modeColors = getGlassColors(glassStyle);

    root.style.setProperty('--color-primary', colorTheme.primary);
    root.style.setProperty('--color-secondary', colorTheme.secondary);

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

    root.style.setProperty('color-scheme', 'dark');
    root.setAttribute('data-theme-mode', 'dark');
    root.setAttribute('data-glass-style', glassStyle);

    root.classList.add('dark-mode');
    root.classList.remove('light-mode');
}

function loadPersistedTheme(): { colorTheme: ColorTheme; glassStyle: GlassStyle } {
    try {
        const savedColorThemeId = localStorage.getItem(STORAGE_KEYS.colorTheme);
        const savedGlassStyle = localStorage.getItem(STORAGE_KEYS.glassStyle) as GlassStyle | null;

        const colorTheme = savedColorThemeId
            ? getColorThemeById(savedColorThemeId)
            : getDefaultColorTheme();

        const glassStyle = savedGlassStyle === 'clear' ? 'clear' : getDefaultGlassStyle();

        return { colorTheme, glassStyle };
    } catch {
        return {
            colorTheme: getDefaultColorTheme(),
            glassStyle: getDefaultGlassStyle(),
        };
    }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [colorTheme, setColorThemeState] = useState<ColorTheme>(() => {
        const { colorTheme } = loadPersistedTheme();
        return colorTheme;
    });

    const [glassStyle, setGlassStyleState] = useState<GlassStyle>(() => {
        const { glassStyle } = loadPersistedTheme();
        return glassStyle;
    });

    useEffect(() => {
        applyTheme(colorTheme, glassStyle);
    }, [colorTheme, glassStyle]);

    useEffect(() => {
        void applyNativeGlassStyle(glassStyle);
    }, [glassStyle]);

    const setColorTheme = useCallback((theme: ColorTheme) => {
        setColorThemeState(theme);
        localStorage.setItem(STORAGE_KEYS.colorTheme, theme.id);
    }, []);

    const setGlassStyle = useCallback((style: GlassStyle) => {
        setGlassStyleState(style);
        localStorage.setItem(STORAGE_KEYS.glassStyle, style);
    }, []);

    return (
        <ThemeContext.Provider
            value={{
                colorTheme,
                glassStyle,
                setColorTheme,
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