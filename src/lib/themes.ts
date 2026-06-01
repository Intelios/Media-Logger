// Theme definitions for Media Logger

export type GlassStyle = 'default' | 'clear';

export interface ColorTheme {
    id: string;
    name: string;
    primary: string;
    secondary: string;
    // Preview colors for the swatch
    previewGradient: string;
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
    {
        id: 'crimson',
        name: 'Crimson',
        primary: '#DC2626',
        secondary: '#B91C1C',
        previewGradient: 'linear-gradient(135deg, #DC2626, #B91C1C)',
    },
    {
        id: 'amber',
        name: 'Amber',
        primary: '#D97706',
        secondary: '#B45309',
        previewGradient: 'linear-gradient(135deg, #D97706, #B45309)',
    },
    {
        id: 'lavender',
        name: 'Lavender',
        primary: '#A78BFA',
        secondary: '#C084FC',
        previewGradient: 'linear-gradient(135deg, #A78BFA, #C084FC)',
    },
    {
        id: 'aurora',
        name: 'Aurora',
        primary: '#06B6D4',
        secondary: '#10B981',
        previewGradient: 'linear-gradient(135deg, #06B6D4, #10B981)',
    },
    {
        id: 'slate',
        name: 'Slate',
        primary: '#64748B',
        secondary: '#475569',
        previewGradient: 'linear-gradient(135deg, #64748B, #475569)',
    },
    {
        id: 'coral',
        name: 'Coral',
        primary: '#F43F5E',
        secondary: '#FB923C',
        previewGradient: 'linear-gradient(135deg, #F43F5E, #FB923C)',
    },
    {
        id: 'sapphire',
        name: 'Sapphire',
        primary: '#2563EB',
        secondary: '#3B82F6',
        previewGradient: 'linear-gradient(135deg, #2563EB, #3B82F6)',
    },
    {
        id: 'teal',
        name: 'Teal',
        primary: '#0D9488',
        secondary: '#06B6D4',
        previewGradient: 'linear-gradient(135deg, #0D9488, #06B6D4)',
    },
    {
        id: 'forest',
        name: 'Forest',
        primary: '#16A34A',
        secondary: '#15803D',
        previewGradient: 'linear-gradient(135deg, #16A34A, #15803D)',
    },
    {
        id: 'lime',
        name: 'Lime',
        primary: '#65A30D',
        secondary: '#A3E635',
        previewGradient: 'linear-gradient(135deg, #65A30D, #A3E635)',
    },
    {
        id: 'gold',
        name: 'Gold',
        primary: '#EAB308',
        secondary: '#FBBF24',
        previewGradient: 'linear-gradient(135deg, #EAB308, #FBBF24)',
    },
    {
        id: 'mocha',
        name: 'Mocha',
        primary: '#8B5E3C',
        secondary: '#A97155',
        previewGradient: 'linear-gradient(135deg, #8B5E3C, #A97155)',
    },
    {
        id: 'fuchsia',
        name: 'Fuchsia',
        primary: '#D946EF',
        secondary: '#C026D3',
        previewGradient: 'linear-gradient(135deg, #D946EF, #C026D3)',
    },
    {
        id: 'galaxy',
        name: 'Galaxy',
        primary: '#8B5CF6',
        secondary: '#EC4899',
        previewGradient: 'linear-gradient(135deg, #8B5CF6, #EC4899)',
    },
    {
        id: 'ruby',
        name: 'Ruby',
        primary: '#E11D48',
        secondary: '#9F1239',
        previewGradient: 'linear-gradient(135deg, #E11D48, #9F1239)',
    },
    {
        id: 'cyber',
        name: 'Cyber',
        primary: '#22D3EE',
        secondary: '#A855F7',
        previewGradient: 'linear-gradient(135deg, #22D3EE, #A855F7)',
    },
];

// Dark mode colors (used by ThemeContext)
export const DARK_COLORS = {
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
} as const;

// Storage keys
export const STORAGE_KEYS = {
    colorTheme: 'media-logger-color-theme',
    glassStyle: 'media-logger-glass-style',
} as const;

// Get default theme
export function getDefaultColorTheme(): ColorTheme {
    return COLOR_THEMES[0];
}

export function getDefaultGlassStyle(): GlassStyle {
    return 'default';
}

// Find theme by ID
export function getColorThemeById(id: string): ColorTheme {
    return COLOR_THEMES.find(t => t.id === id) || getDefaultColorTheme();
}

// Convert a hex color (#RGB or #RRGGBB) to a comma-separated "r, g, b" string
// for use in rgba(var(--color-primary-rgb), alpha) CSS expressions.
export function hexToRgb(hex: string): string {
    const normalized = hex.replace('#', '');
    const full = normalized.length === 3
        ? normalized.split('').map(c => c + c).join('')
        : normalized;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `${r}, ${g}, ${b}`;
}
