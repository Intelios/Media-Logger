// Theme definitions for Media Logger

export type ThemeMode = 'dark' | 'light';

export interface ColorTheme {
    id: string;
    name: string;
    primary: string;
    secondary: string;
    // Preview colors for the swatch
    previewGradient: string;
}

export interface ModeTheme {
    id: ThemeMode;
    name: string;
    icon: string; // emoji for UI
    colors: {
        background: string;
        backgroundAlt: string;
        surface: string;
        surfaceHover: string;
        text: string;
        textMuted: string;
        textSubtle: string;
        border: string;
        borderSubtle: string;
        scrollbarThumb: string;
        scrollbarThumbHover: string;
    };
}

// Color themes
export const COLOR_THEMES: ColorTheme[] = [
    {
        id: 'default',
        name: 'Purple',
        primary: '#5E35B1',
        secondary: '#1E88E5',
        previewGradient: 'linear-gradient(135deg, #5E35B1, #1E88E5)',
    },
    {
        id: 'ocean',
        name: 'Ocean',
        primary: '#0EA5E9',
        secondary: '#06B6D4',
        previewGradient: 'linear-gradient(135deg, #0EA5E9, #06B6D4)',
    },
    {
        id: 'sunset',
        name: 'Sunset',
        primary: '#F97316',
        secondary: '#EAB308',
        previewGradient: 'linear-gradient(135deg, #F97316, #EAB308)',
    },
    {
        id: 'emerald',
        name: 'Emerald',
        primary: '#10B981',
        secondary: '#14B8A6',
        previewGradient: 'linear-gradient(135deg, #10B981, #14B8A6)',
    },
    {
        id: 'rose',
        name: 'Rose',
        primary: '#EC4899',
        secondary: '#F472B6',
        previewGradient: 'linear-gradient(135deg, #EC4899, #F472B6)',
    },
    {
        id: 'midnight',
        name: 'Midnight',
        primary: '#6366F1',
        secondary: '#8B5CF6',
        previewGradient: 'linear-gradient(135deg, #6366F1, #8B5CF6)',
    },
];

// Mode themes
export const MODE_THEMES: Record<ThemeMode, ModeTheme> = {
    dark: {
        id: 'dark',
        name: 'Dark',
        icon: '🌙',
        colors: {
            background: '#121212',
            backgroundAlt: '#0A0A0A',
            surface: '#1E1E1E',
            surfaceHover: '#2A2A2A',
            text: '#FFFFFF',
            textMuted: '#9CA3AF',
            textSubtle: '#6B7280',
            border: 'rgba(255, 255, 255, 0.1)',
            borderSubtle: 'rgba(255, 255, 255, 0.05)',
            scrollbarThumb: 'rgba(255, 255, 255, 0.15)',
            scrollbarThumbHover: 'rgba(255, 255, 255, 0.25)',
        },
    },
    light: {
        id: 'light',
        name: 'Light',
        icon: '☀️',
        colors: {
            background: '#FFFFFF',
            backgroundAlt: '#F9FAFB',
            surface: '#F3F4F6',
            surfaceHover: '#E5E7EB',
            text: '#111827',
            textMuted: '#6B7280',
            textSubtle: '#9CA3AF',
            border: 'rgba(0, 0, 0, 0.1)',
            borderSubtle: 'rgba(0, 0, 0, 0.05)',
            scrollbarThumb: 'rgba(0, 0, 0, 0.2)',
            scrollbarThumbHover: 'rgba(0, 0, 0, 0.3)',
        },
    },
};

// Storage keys
export const STORAGE_KEYS = {
    colorTheme: 'media-logger-color-theme',
    themeMode: 'media-logger-theme-mode',
} as const;

// Get default theme
export function getDefaultColorTheme(): ColorTheme {
    return COLOR_THEMES[0];
}

export function getDefaultThemeMode(): ThemeMode {
    return 'dark';
}

// Find theme by ID
export function getColorThemeById(id: string): ColorTheme {
    return COLOR_THEMES.find(t => t.id === id) || getDefaultColorTheme();
}
