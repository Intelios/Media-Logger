"""
Enhanced UI Components Foundation for Dashboard UI Upgrade
Provides modern card designs, color theming utilities, and animation helpers
"""

import flet as ft
from typing import Optional, Dict, Any, List
# Removed unused import 'math'

# ============================================================================
# GLASSMORPHISM AND MODERN CARD DESIGN UTILITIES
# ============================================================================

class GlassmorphismStyles:
    """Glassmorphism design patterns and utilities"""
    
    @staticmethod
    def create_glass_container(
        content: ft.Control,
        blur_intensity: float = 10.0,
        opacity: float = 0.1,
        border_opacity: float = 0.2,
        border_radius: float = 16.0,
        padding: Optional[ft.Padding] = None,
        margin: Optional[ft.Margin] = None,
        shadow_blur: float = 20.0,
        shadow_opacity: float = 0.1
    ) -> ft.Container:
        """Create a glassmorphism-style container with blur and transparency effects"""
        
        if padding is None:
            padding = ft.padding.all(20)
            
        return ft.Container(
            content=content,
            bgcolor=ft.colors.with_opacity(opacity, ft.colors.WHITE),
            border=ft.border.all(
                1, 
                ft.colors.with_opacity(border_opacity, ft.colors.WHITE)
            ),
            border_radius=ft.border_radius.all(border_radius),
            padding=padding,
            margin=margin,
            shadow=ft.BoxShadow(
                spread_radius=0,
                blur_radius=shadow_blur,
                color=ft.colors.with_opacity(shadow_opacity, ft.colors.BLACK),
                offset=ft.Offset(0, 4)
            ),
            # Note: Flet doesn't support backdrop-filter blur directly,
            # so we simulate with layered transparency and shadows
        )
    
    @staticmethod
    def create_glass_card(
        content: ft.Control,
        elevation: float = 4.0,
        blur_intensity: float = 10.0,
        glass_opacity: float = 0.1,
        border_radius: float = 16.0,
        padding: Optional[ft.Padding] = None
    ) -> ft.Card:
        """Create a modern glassmorphism card"""
        
        if padding is None:
            padding = ft.padding.all(20)
            
        glass_content = GlassmorphismStyles.create_glass_container(
            content=content,
            blur_intensity=blur_intensity,
            opacity=glass_opacity,
            border_radius=border_radius,
            padding=padding
        )
        
        return ft.Card(
            content=glass_content,
            elevation=elevation,
            shape=ft.RoundedRectangleBorder(radius=border_radius),
            surface_tint_color=ft.colors.SURFACE_TINT,
            margin=ft.margin.all(8)
        )

class ModernCardStyles:
    """Deprecated; kept for backward compatibility. Prefer GlassmorphismStyles or EnhancedComponentFactory."""
    pass

# ============================================================================
# COLOR THEMING UTILITIES
# ============================================================================

class ColorThemeManager:
    """Centralized color theming system for consistent visual styling"""
    
    # Primary color palettes
    BRAND_COLORS = {
        'primary': ft.colors.BLUE_600,
        'primary_light': ft.colors.BLUE_400,
        'primary_dark': ft.colors.BLUE_800,
        'secondary': ft.colors.PURPLE_600,
        'secondary_light': ft.colors.PURPLE_400,
        'secondary_dark': ft.colors.PURPLE_800,
        'accent': ft.colors.AMBER_600,
        'accent_light': ft.colors.AMBER_400,
        'accent_dark': ft.colors.AMBER_800
    }
    
    # Semantic colors
    SEMANTIC_COLORS = {
        'success': ft.colors.GREEN_600,
        'success_light': ft.colors.GREEN_400,
        'success_dark': ft.colors.GREEN_800,
        'warning': ft.colors.ORANGE_600,
        'warning_light': ft.colors.ORANGE_400,
        'warning_dark': ft.colors.ORANGE_800,
        'error': ft.colors.RED_600,
        'error_light': ft.colors.RED_400,
        'error_dark': ft.colors.RED_800,
        'info': ft.colors.CYAN_600,
        'info_light': ft.colors.CYAN_400,
        'info_dark': ft.colors.CYAN_800
    }
    
    # Entry type specific colors
    ENTRY_TYPE_COLORS = {
        'Game': {'primary': ft.colors.BLUE_600, 'light': ft.colors.BLUE_400, 'dark': ft.colors.BLUE_800},
        'Movie': {'primary': ft.colors.RED_600, 'light': ft.colors.RED_400, 'dark': ft.colors.RED_800},
        'Show': {'primary': ft.colors.PURPLE_600, 'light': ft.colors.PURPLE_400, 'dark': ft.colors.PURPLE_800},
        'K-Drama': {'primary': ft.colors.GREEN_600, 'light': ft.colors.GREEN_400, 'dark': ft.colors.GREEN_800},
        'Anime': {'primary': ft.colors.PINK_600, 'light': ft.colors.PINK_400, 'dark': ft.colors.PINK_800},
        'Book': {'primary': ft.colors.BROWN_600, 'light': ft.colors.BROWN_400, 'dark': ft.colors.BROWN_800},
        'Album': {'primary': ft.colors.CYAN_600, 'light': ft.colors.CYAN_400, 'dark': ft.colors.CYAN_800},
        'Hentai': {'primary': ft.colors.DEEP_PURPLE_600, 'light': ft.colors.DEEP_PURPLE_400, 'dark': ft.colors.DEEP_PURPLE_800},
        'JAV': {'primary': ft.colors.INDIGO_600, 'light': ft.colors.INDIGO_400, 'dark': ft.colors.INDIGO_800},
        'Adult Visual Novel': {'primary': ft.colors.DEEP_ORANGE_600, 'light': ft.colors.DEEP_ORANGE_400, 'dark': ft.colors.DEEP_ORANGE_800},
        'Other': {'primary': ft.colors.BLUE_GREY_600, 'light': ft.colors.BLUE_GREY_400, 'dark': ft.colors.BLUE_GREY_800}
    }
    
    @classmethod
    def get_entry_type_color(cls, entry_type: str, variant: str = 'primary') -> str:
        """Get color for specific entry type"""
        return cls.ENTRY_TYPE_COLORS.get(entry_type, cls.ENTRY_TYPE_COLORS['Other']).get(variant, ft.colors.BLUE_GREY_600)
    
    @classmethod
    def get_entry_type_gradient(cls, entry_type: str) -> ft.LinearGradient:
        """Get gradient for specific entry type"""
        colors = cls.ENTRY_TYPE_COLORS.get(entry_type, cls.ENTRY_TYPE_COLORS['Other'])
        return ft.LinearGradient(
            colors=[colors['primary'], colors['dark']],
            begin=ft.alignment.top_left,
            end=ft.alignment.bottom_right
        )
    
    @classmethod
    def get_rating_color_scheme(cls, score: Optional[float]) -> Dict[str, str]:
        """Get color scheme based on rating score"""
        if score is None:
            return {'primary': ft.colors.GREY_600, 'light': ft.colors.GREY_400, 'bg': ft.colors.with_opacity(0.1, ft.colors.GREY_600)}
        
        if score >= 9:
            return {'primary': ft.colors.GREEN_600, 'light': ft.colors.GREEN_400, 'bg': ft.colors.with_opacity(0.1, ft.colors.GREEN_600)}
        elif score >= 7:
            return {'primary': ft.colors.BLUE_600, 'light': ft.colors.BLUE_400, 'bg': ft.colors.with_opacity(0.1, ft.colors.BLUE_600)}
        elif score >= 5:
            return {'primary': ft.colors.ORANGE_600, 'light': ft.colors.ORANGE_400, 'bg': ft.colors.with_opacity(0.1, ft.colors.ORANGE_600)}
        else:
            return {'primary': ft.colors.RED_600, 'light': ft.colors.RED_400, 'bg': ft.colors.with_opacity(0.1, ft.colors.RED_600)}
    
    @classmethod
    def create_themed_gradient(cls, color_key: str, opacity: float = 1.0) -> ft.LinearGradient:
        """Create a themed gradient from color key"""
        if color_key in cls.BRAND_COLORS:
            base_color = cls.BRAND_COLORS[color_key]
            light_key = f"{color_key}_light"
            dark_key = f"{color_key}_dark"
            light_color = cls.BRAND_COLORS.get(light_key, base_color)
            dark_color = cls.BRAND_COLORS.get(dark_key, base_color)
        elif color_key in cls.SEMANTIC_COLORS:
            base_color = cls.SEMANTIC_COLORS[color_key]
            light_key = f"{color_key}_light"
            dark_key = f"{color_key}_dark"
            light_color = cls.SEMANTIC_COLORS.get(light_key, base_color)
            dark_color = cls.SEMANTIC_COLORS.get(dark_key, base_color)
        else:
            base_color = light_color = dark_color = ft.colors.BLUE_600
        
        if opacity < 1.0:
            light_color = ft.colors.with_opacity(opacity, light_color)
            dark_color = ft.colors.with_opacity(opacity, dark_color)
        
        return ft.LinearGradient(
            colors=[light_color, dark_color],
            begin=ft.alignment.top_left,
            end=ft.alignment.bottom_right
        )

# ============================================================================
# ANIMATION HELPER FUNCTIONS
# ============================================================================

class AnimationHelpers:
    """Animation utilities for smooth transitions and micro-interactions"""
    
    # Animation duration constants
    DURATION_FAST = 150
    DURATION_NORMAL = 300
    DURATION_SLOW = 500
    
    # Easing curves
    EASE_IN_OUT = ft.AnimationCurve.EASE_IN_OUT
    EASE_OUT = ft.AnimationCurve.EASE_OUT
    EASE_IN = ft.AnimationCurve.EASE_IN
    BOUNCE_OUT = ft.AnimationCurve.BOUNCE_OUT
    
    @staticmethod
    def create_hover_animation_container(
        content: ft.Control,
        hover_elevation: float = 8.0,
        normal_elevation: float = 4.0,
        hover_scale: float = 1.02,
        animation_duration: int = 200,
        border_radius: float = 16.0,
        padding: Optional[ft.Padding] = None
    ) -> ft.Container:
        """Create a container with hover animation effects"""
        
        if padding is None:
            padding = ft.padding.all(16)
        
        # Create animated container with hover effects
        container = ft.Container(
            content=content,
            padding=padding,
            border_radius=ft.border_radius.all(border_radius),
            animate=ft.animation.Animation(
                duration=animation_duration,
                curve=AnimationHelpers.EASE_OUT
            ),
            animate_scale=ft.animation.Animation(
                duration=animation_duration,
                curve=AnimationHelpers.EASE_OUT
            ),
            shadow=ft.BoxShadow(
                spread_radius=0,
                blur_radius=normal_elevation * 2,
                color=ft.colors.with_opacity(0.15, ft.colors.BLACK),
                offset=ft.Offset(0, normal_elevation / 2)
            )
        )
        
        def on_hover(e):
            if e.data == "true":  # Mouse enter
                container.shadow = ft.BoxShadow(
                    spread_radius=0,
                    blur_radius=hover_elevation * 2,
                    color=ft.colors.with_opacity(0.25, ft.colors.BLACK),
                    offset=ft.Offset(0, hover_elevation / 2)
                )
                container.scale = hover_scale
            else:  # Mouse leave
                container.shadow = ft.BoxShadow(
                    spread_radius=0,
                    blur_radius=normal_elevation * 2,
                    color=ft.colors.with_opacity(0.15, ft.colors.BLACK),
                    offset=ft.Offset(0, normal_elevation / 2)
                )
                container.scale = 1.0
            container.update()
        
        container.on_hover = on_hover
        return container
    
    @staticmethod
    def create_fade_in_animation(
        content: ft.Control,
        duration: int = 300,
        delay: int = 0
    ) -> ft.AnimatedSwitcher:
        """Create a fade-in animation for content"""
        
        return ft.AnimatedSwitcher(
            content=content,
            transition=ft.AnimatedSwitcherTransition.FADE,
            duration=duration,
            reverse_duration=duration,
            switch_in_curve=AnimationHelpers.EASE_OUT,
            switch_out_curve=AnimationHelpers.EASE_IN
        )
    
    @staticmethod
    def create_slide_transition(
        content: ft.Control,
        direction: str = "up",  # "up", "down", "left", "right"
        duration: int = 300
    ) -> ft.AnimatedSwitcher:
        """Create a slide transition animation"""
        
        transition_map = {
            "up": ft.AnimatedSwitcherTransition.SLIDE_UP,
            "down": ft.AnimatedSwitcherTransition.SLIDE_DOWN,
            "left": ft.AnimatedSwitcherTransition.SLIDE_LEFT,
            "right": ft.AnimatedSwitcherTransition.SLIDE_RIGHT
        }
        
        return ft.AnimatedSwitcher(
            content=content,
            transition=transition_map.get(direction, ft.AnimatedSwitcherTransition.SLIDE_UP),
            duration=duration,
            reverse_duration=duration,
            switch_in_curve=AnimationHelpers.EASE_OUT,
            switch_out_curve=AnimationHelpers.EASE_IN
        )
    
    @staticmethod
    def create_loading_animation() -> ft.ProgressRing:
        """Create an elegant loading animation"""
        
        return ft.ProgressRing(
            width=40,
            height=40,
            stroke_width=3,
            color=ColorThemeManager.BRAND_COLORS['primary']
        )
    
    @staticmethod
    def create_skeleton_loader(
        width: Optional[float] = None,
        height: float = 20,
        border_radius: float = 8
    ) -> ft.Container:
        """Create a skeleton loading placeholder"""
        
        return ft.Container(
            width=width,
            height=height,
            border_radius=ft.border_radius.all(border_radius),
            bgcolor=ft.colors.with_opacity(0.1, ft.colors.ON_SURFACE),
            animate=ft.animation.Animation(
                duration=1000,
                curve=ft.AnimationCurve.EASE_IN_OUT
            )
        )
    
    @staticmethod
    def create_pulse_animation_container(
        content: ft.Control,
        pulse_color: str = ft.colors.PRIMARY,
        pulse_opacity: float = 0.3,
        duration: int = 1000
    ) -> ft.Container:
        """Create a container with pulse animation effect"""
        
        container = ft.Container(
            content=content,
            animate=ft.animation.Animation(
                duration=duration,
                curve=ft.AnimationCurve.EASE_IN_OUT
            )
        )
        
        # Note: Pulse effect would need to be implemented with opacity changes
        # This is a basic structure that can be enhanced with state management
        
        return container

# ============================================================================
# MICRO-INTERACTION UTILITIES
# ============================================================================

class MicroInteractions:
    """Utilities for creating smooth micro-interactions and feedback"""
    
    @staticmethod
    def create_ripple_button(
        text: str,
        on_click: callable,
        icon: Optional[str] = None,
        style: str = "elevated",  # "elevated", "filled", "outlined", "text"
        color: Optional[str] = None
    ) -> ft.ElevatedButton:
        """Create a button with ripple effect and smooth interactions"""
        
        button_style = ft.ButtonStyle(
            animation_duration=200,
            padding=ft.padding.symmetric(horizontal=24, vertical=12),
            shape=ft.RoundedRectangleBorder(radius=12)
        )
        
        if color:
            button_style.bgcolor = color
        
        if style == "elevated":
            return ft.ElevatedButton(
                text=text,
                icon=icon,
                on_click=on_click,
                style=button_style
            )
        elif style == "filled":
            return ft.FilledButton(
                text=text,
                icon=icon,
                on_click=on_click,
                style=button_style
            )
        elif style == "outlined":
            return ft.OutlinedButton(
                text=text,
                icon=icon,
                on_click=on_click,
                style=button_style
            )
        else:  # text
            return ft.TextButton(
                text=text,
                icon=icon,
                on_click=on_click,
                style=button_style
            )
    
    @staticmethod
    def create_interactive_icon_button(
        icon: str,
        on_click: callable,
        tooltip: str = "",
        size: float = 24,
        color: Optional[str] = None,
        hover_color: Optional[str] = None
    ) -> ft.IconButton:
        """Create an interactive icon button with hover effects"""
        
        if color is None:
            color = ft.colors.ON_SURFACE_VARIANT
        if hover_color is None:
            hover_color = ColorThemeManager.BRAND_COLORS['primary']
        
        return ft.IconButton(
            icon=icon,
            icon_size=size,
            icon_color=color,
            on_click=on_click,
            tooltip=tooltip,
            style=ft.ButtonStyle(
                animation_duration=200,
                shape=ft.CircleBorder(),
                padding=ft.padding.all(8)
            )
        )
    
    @staticmethod
    def create_smooth_progress_bar(
        value: float,
        color: Optional[str] = None,
        background_color: Optional[str] = None,
        height: float = 8,
        border_radius: float = 4
    ) -> ft.ProgressBar:
        """Create a smooth animated progress bar"""
        
        if color is None:
            color = ColorThemeManager.BRAND_COLORS['primary']
        if background_color is None:
            background_color = ft.colors.with_opacity(0.1, ft.colors.ON_SURFACE)
        
        return ft.ProgressBar(
            value=value,
            color=color,
            bgcolor=background_color,
            height=height,
            border_radius=ft.border_radius.all(border_radius)
        )

# ============================================================================
# ENHANCED COMPONENT FACTORY
# ============================================================================

class EnhancedComponentFactory:
    """Factory class for creating enhanced UI components with modern styling"""
    
    @staticmethod
    def create_modern_stat_card(
        title: str,
        value: str,
        subtitle: Optional[str] = None,
        icon: Optional[str] = None,
        color_scheme: str = "primary",
        show_trend: bool = False,
        trend_value: Optional[float] = None,
        trend_positive: bool = True
    ) -> ft.Card:
        """Create a modern statistics card with glassmorphism effects"""
        
        # Create content elements
        content_elements = []
        
        # Header with icon and title
        if icon:
            header = ft.Row([
                ft.Icon(icon, size=24, color=ColorThemeManager.BRAND_COLORS[color_scheme]),
                ft.Text(title, size=14, weight=ft.FontWeight.W_500, color=ft.colors.ON_SURFACE_VARIANT)
            ], spacing=8, vertical_alignment=ft.CrossAxisAlignment.CENTER)
        else:
            header = ft.Text(title, size=14, weight=ft.FontWeight.W_500, color=ft.colors.ON_SURFACE_VARIANT)
        
        content_elements.append(header)
        
        # Main value
        value_text = ft.Text(
            value,
            size=32,
            weight=ft.FontWeight.BOLD,
            color=ft.colors.ON_SURFACE
        )
        content_elements.append(value_text)
        
        # Subtitle and trend
        bottom_row_elements = []
        if subtitle:
            bottom_row_elements.append(
                ft.Text(subtitle, size=12, color=ft.colors.ON_SURFACE_VARIANT)
            )
        
        if show_trend and trend_value is not None:
            trend_color = ColorThemeManager.SEMANTIC_COLORS['success'] if trend_positive else ColorThemeManager.SEMANTIC_COLORS['error']
            trend_icon = ft.icons.TRENDING_UP if trend_positive else ft.icons.TRENDING_DOWN
            trend_text = f"+{trend_value:.1f}%" if trend_positive else f"{trend_value:.1f}%"
            
            trend_chip = ft.Container(
                content=ft.Row([
                    ft.Icon(trend_icon, size=14, color=trend_color),
                    ft.Text(trend_text, size=12, color=trend_color, weight=ft.FontWeight.W_600)
                ], spacing=4, tight=True),
                bgcolor=ft.colors.with_opacity(0.1, trend_color),
                padding=ft.padding.symmetric(horizontal=8, vertical=4),
                border_radius=ft.border_radius.all(12)
            )
            bottom_row_elements.append(trend_chip)
        
        if bottom_row_elements:
            content_elements.append(
                ft.Row(
                    bottom_row_elements,
                    alignment=ft.MainAxisAlignment.SPACE_BETWEEN,
                    vertical_alignment=ft.CrossAxisAlignment.CENTER
                )
            )
        
        # Create card content
        card_content = ft.Column(
            content_elements,
            spacing=12,
            tight=True
        )
        
        # Create glassmorphism card
        return GlassmorphismStyles.create_glass_card(
            content=card_content,
            elevation=4.0,
            border_radius=16.0,
            padding=ft.padding.all(20)
        )
    
    @staticmethod
    def create_enhanced_welcome_header(
        greeting_text: str,
        subtitle: Optional[str] = None,
        show_time_based_greeting: bool = True
    ) -> ft.Container:
        """Create an enhanced welcome header with gradient background"""
        
        # Time-based greeting logic
        if show_time_based_greeting:
            from datetime import datetime
            current_hour = datetime.now().hour
            if 5 <= current_hour < 12:
                time_greeting = "Good Morning"
            elif 12 <= current_hour < 17:
                time_greeting = "Good Afternoon"
            elif 17 <= current_hour < 21:
                time_greeting = "Good Evening"
            else:
                time_greeting = "Good Night"
            
            full_greeting = f"{time_greeting}, {greeting_text}"
        else:
            full_greeting = greeting_text
        
        # Create content
        content_elements = [
            ft.Text(
                full_greeting,
                size=28,
                weight=ft.FontWeight.BOLD,
                color=ft.colors.WHITE
            )
        ]
        
        if subtitle:
            content_elements.append(
                ft.Text(
                    subtitle,
                    size=16,
                    color=ft.colors.with_opacity(0.9, ft.colors.WHITE)
                )
            )
        
        header_content = ft.Column(
            content_elements,
            spacing=8,
            horizontal_alignment=ft.CrossAxisAlignment.START
        )
        
        # Create gradient container
        return ft.Container(
            content=header_content,
            gradient=ft.LinearGradient(
                colors=[
                    ColorThemeManager.BRAND_COLORS['primary'],
                    ColorThemeManager.BRAND_COLORS['secondary']
                ],
                begin=ft.alignment.top_left,
                end=ft.alignment.bottom_right
            ),
            padding=ft.padding.all(24),
            border_radius=ft.border_radius.all(16),
            margin=ft.margin.only(bottom=24)
        )
# ============================================================================
# RESPONSIVE LAYOUT UTILITIES
# ============================================================================

class ResponsiveLayoutManager:
    """Enhanced responsive layout utilities for adaptive grid systems with improved spacing and organization"""
    
    # Responsive breakpoints for different screen sizes
    BREAKPOINTS = {
        'xs': 0,      # Extra small devices (phones)
        'sm': 576,    # Small devices (landscape phones)
        'md': 768,    # Medium devices (tablets)
        'lg': 992,    # Large devices (desktops)
        'xl': 1200,   # Extra large devices (large desktops)
        'xxl': 1400   # Extra extra large devices
    }
    
    # Grid column configurations for different content types
    GRID_CONFIGS = {
        'stats_cards': {
            'xs': 12,  # 1 column on mobile
            'sm': 6,   # 2 columns on small screens
            'md': 6,   # 2 columns on medium screens
            'lg': 3,   # 4 columns on large screens
            'xl': 3    # 4 columns on extra large screens
        },
        'media_cards': {
            'xs': 12,  # 1 column on mobile
            'sm': 6,   # 2 columns on small screens
            'md': 4,   # 3 columns on medium screens
            'lg': 3,   # 4 columns on large screens
            'xl': 2    # 6 columns on extra large screens
        },
        'feature_cards': {
            'xs': 12,  # Full width on mobile
            'sm': 12,  # Full width on small screens
            'md': 6,   # Half width on medium screens
            'lg': 4,   # Third width on large screens
            'xl': 3    # Quarter width on extra large screens
        },
        'navigation_buttons': {
            'xs': 12,  # Full width on mobile
            'sm': 6,   # Half width on small screens
            'md': 4,   # Third width on medium screens
            'lg': 4,   # Third width on large screens
            'xl': 4    # Third width on extra large screens
        }
    }
    
    @staticmethod
    def create_responsive_grid(
        items: List[ft.Control],
        grid_type: str = 'media_cards',
        spacing: float = 20,
        run_spacing: float = 20,
        min_item_width: Optional[float] = None,
        max_columns: Optional[int] = None
    ) -> ft.ResponsiveRow:
        """Create an enhanced responsive grid that adapts to screen size with improved spacing"""
        
        # Get grid configuration for the specified type
        grid_config = ResponsiveLayoutManager.GRID_CONFIGS.get(
            grid_type, 
            ResponsiveLayoutManager.GRID_CONFIGS['media_cards']
        )
        
        # Create responsive items with proper column configurations
        responsive_items = []
        
        for item in items:
            # Wrap each item in a responsive column with enhanced styling
            responsive_item = ft.Column(
                col=grid_config,
                controls=[
                    ft.Container(
                        content=item,
                        padding=ft.padding.all(4),  # Small padding for visual separation
                        expand=True
                    )
                ],
                horizontal_alignment=ft.CrossAxisAlignment.STRETCH
            )
            responsive_items.append(responsive_item)
        
        return ft.ResponsiveRow(
            controls=responsive_items,
            spacing=spacing,
            run_spacing=run_spacing,
            vertical_alignment=ft.CrossAxisAlignment.START
        )
    
    @staticmethod
    def create_dashboard_section(
        title: str,
        content: ft.Control,
        icon: Optional[str] = None,
        spacing: float = 16,
        padding: Optional[ft.Padding] = None,
        section_type: str = 'default',
        collapsible: bool = False
    ) -> ft.Container:
        """Create a well-organized dashboard section with enhanced styling and logical grouping"""
        
        if padding is None:
            padding = ft.padding.symmetric(horizontal=2, vertical=4)
        
        # Create enhanced section header with better visual hierarchy
        header_elements = []
        
        if icon:
            # Enhanced icon with themed background
            icon_container = ft.Container(
                content=ft.Icon(icon, size=18, color=ft.colors.PRIMARY),
                bgcolor=ft.colors.with_opacity(0.1, ft.colors.PRIMARY),
                padding=ft.padding.all(6),
                border_radius=ft.border_radius.all(6)
            )
            header_elements.append(icon_container)
        
        # Enhanced title with better typography
        title_text = ft.Text(
            title,
            size=18,
            weight=ft.FontWeight.W_600,
            color=ft.colors.ON_SURFACE
        )
        header_elements.append(title_text)
        
        # Add collapse/expand button if collapsible
        if collapsible:
            collapse_button = ft.IconButton(
                icon=ft.icons.EXPAND_LESS,
                icon_size=18,
                tooltip="Collapse section"
            )
            header_elements.append(collapse_button)
        
        section_header = ft.Row(
            header_elements,
            spacing=10,
            vertical_alignment=ft.CrossAxisAlignment.CENTER,
            alignment=ft.MainAxisAlignment.START
        )
        
        # Create section content with optimized spacing
        section_content = ft.Column([
            section_header,
            ft.Container(height=spacing * 0.6),  # Reduced proportional spacing
            content
        ], spacing=0, tight=True)
        
        # Apply section-specific styling
        container_style = ResponsiveLayoutManager._get_section_style(section_type)
        
        return ft.Container(
            content=section_content,
            padding=padding,
            margin=container_style.get('margin', ft.margin.only(bottom=24)),
            bgcolor=container_style.get('bgcolor'),
            border=container_style.get('border'),
            border_radius=container_style.get('border_radius'),
            shadow=container_style.get('shadow')
        )
    
    @staticmethod
    def _get_section_style(section_type: str) -> Dict[str, Any]:
        """Get styling configuration for different section types"""
        
        styles = {
            'default': {
                'margin': ft.margin.only(bottom=20),
                'bgcolor': None,
                'border': None,
                'border_radius': None,
                'shadow': None
            },
            'highlighted': {
                'margin': ft.margin.only(bottom=20),
                'bgcolor': ft.colors.with_opacity(0.02, ft.colors.PRIMARY),
                'border': ft.border.all(1, ft.colors.with_opacity(0.08, ft.colors.PRIMARY)),
                'border_radius': ft.border_radius.all(8),
                'shadow': ft.BoxShadow(
                    spread_radius=0,
                    blur_radius=6,
                    color=ft.colors.with_opacity(0.03, ft.colors.BLACK),
                    offset=ft.Offset(0, 1)
                )
            },
            'card': {
                'margin': ft.margin.only(bottom=20),
                'bgcolor': ft.colors.with_opacity(0.02, ft.colors.SURFACE_VARIANT),
                'border': None,
                'border_radius': ft.border_radius.all(12),
                'shadow': ft.BoxShadow(
                    spread_radius=0,
                    blur_radius=8,
                    color=ft.colors.with_opacity(0.05, ft.colors.BLACK),
                    offset=ft.Offset(0, 2)
                )
            }
        }
        
        return styles.get(section_type, styles['default'])
    
    @staticmethod
    def create_adaptive_layout(
        sections: List[Dict[str, Any]],
        main_spacing: float = 40,
        section_spacing: float = 24,
        max_width: Optional[float] = None,
        center_content: bool = True
    ) -> ft.Column:
        """Create an enhanced adaptive layout with improved content organization and logical grouping"""
        
        layout_sections = []
        
        for i, section_config in enumerate(sections):
            section_title = section_config.get('title', '')
            section_content = section_config.get('content')
            section_icon = section_config.get('icon')
            section_full_width = section_config.get('full_width', False)
            section_type = section_config.get('type', 'default')
            section_collapsible = section_config.get('collapsible', False)
            section_priority = section_config.get('priority', 'normal')  # 'high', 'normal', 'low'
            
            if section_content:
                if section_full_width:
                    # Full-width sections (like welcome header) with enhanced styling
                    enhanced_content = ft.Container(
                        content=section_content,
                        margin=ft.margin.only(bottom=main_spacing * 0.75)
                    )
                    layout_sections.append(enhanced_content)
                else:
                    # Regular sections with enhanced headers and organization
                    section = ResponsiveLayoutManager.create_dashboard_section(
                        title=section_title,
                        content=section_content,
                        icon=section_icon,
                        spacing=section_spacing,
                        section_type=section_type,
                        collapsible=section_collapsible
                    )
                    layout_sections.append(section)
                
                # Add priority-based spacing
                if section_priority == 'high' and i < len(sections) - 1:
                    layout_sections.append(ft.Container(height=main_spacing * 0.5))
        
        # Create the main layout column with enhanced properties
        main_column = ft.Column(
            controls=layout_sections,
            spacing=main_spacing,
            scroll=ft.ScrollMode.ADAPTIVE,
            horizontal_alignment=ft.CrossAxisAlignment.STRETCH if not center_content else ft.CrossAxisAlignment.CENTER
        )
        
        # Wrap in container with max width if specified
        if max_width:
            return ft.Container(
                content=main_column,
                width=max_width,
                alignment=ft.alignment.top_center
            )
        
        return main_column
    
    @staticmethod
    def create_two_column_layout(
        left_content: ft.Control,
        right_content: ft.Control,
        left_flex: int = 2,
        right_flex: int = 1,
        spacing: float = 24,
        responsive_breakpoint: str = 'md'
    ) -> ft.ResponsiveRow:
        """Create a responsive two-column layout that stacks on smaller screens"""
        
        # Define responsive behavior based on breakpoint
        if responsive_breakpoint == 'lg':
            left_col = {"xs": 12, "sm": 12, "md": 12, "lg": 8, "xl": 8}
            right_col = {"xs": 12, "sm": 12, "md": 12, "lg": 4, "xl": 4}
        elif responsive_breakpoint == 'md':
            left_col = {"xs": 12, "sm": 12, "md": 8, "lg": 8, "xl": 8}
            right_col = {"xs": 12, "sm": 12, "md": 4, "lg": 4, "xl": 4}
        else:  # sm
            left_col = {"xs": 12, "sm": 8, "md": 8, "lg": 8, "xl": 8}
            right_col = {"xs": 12, "sm": 4, "md": 4, "lg": 4, "xl": 4}
        
        return ft.ResponsiveRow([
            ft.Column(
                col=left_col,
                controls=[
                    ft.Container(
                        content=left_content,
                        padding=ft.padding.only(right=spacing/2)
                    )
                ]
            ),
            ft.Column(
                col=right_col,
                controls=[
                    ft.Container(
                        content=right_content,
                        padding=ft.padding.only(left=spacing/2)
                    )
                ]
            )
        ], spacing=spacing)
    
    @staticmethod
    def create_masonry_layout(
        items: List[ft.Control],
        columns: int = 3,
        spacing: float = 16
    ) -> ft.Row:
        """Create a masonry-style layout for items of varying heights"""
        
        # Initialize columns
        column_controls = [[] for _ in range(columns)]
        column_heights = [0] * columns
        
        # Distribute items to columns (simplified masonry algorithm)
        for item in items:
            # Find column with minimum height
            min_height_index = column_heights.index(min(column_heights))
            
            # Add item to that column
            column_controls[min_height_index].append(
                ft.Container(
                    content=item,
                    margin=ft.margin.only(bottom=spacing)
                )
            )
            
            # Estimate height increase (simplified)
            column_heights[min_height_index] += 200  # Estimated item height
        
        # Create column widgets
        columns_widgets = []
        for column_items in column_controls:
            column_widget = ft.Column(
                controls=column_items,
                spacing=0,
                expand=True
            )
            columns_widgets.append(column_widget)
        
        return ft.Row(
            controls=columns_widgets,
            spacing=spacing,
            vertical_alignment=ft.CrossAxisAlignment.START,
            expand=True
        )
    
    @staticmethod
    def create_content_container(
        content: ft.Control,
        max_width: float = 1200,
        padding: Optional[ft.Padding] = None,
        center: bool = True
    ) -> ft.Container:
        """Create a content container with consistent max-width and centering"""
        
        if padding is None:
            padding = ft.padding.symmetric(horizontal=24, vertical=20)
        
        return ft.Container(
            content=content,
            width=max_width,
            padding=padding,
            alignment=ft.alignment.top_center if center else None,
            expand=True
        )

# ============================================================================
# DASHBOARD-SPECIFIC ENHANCED UTILITIES
# ============================================================================

class DashboardEnhancedUtils:
    """Dashboard-specific enhanced utilities for modern UI components"""
    
    @staticmethod
    def create_enhanced_stat_card_with_glassmorphism(
        icon: str,
        value: str,
        title: str,
        subtitle: Optional[str] = None,
        color: str = "primary",
        trend_data: Optional[Dict[str, Any]] = None,
        animate_value: bool = True
    ) -> ft.Container:
        """Create an enhanced statistics card with glassmorphism effects for dashboard"""
        
        # Get color scheme
        if color in ColorThemeManager.BRAND_COLORS:
            primary_color = ColorThemeManager.BRAND_COLORS[color]
        elif color in ColorThemeManager.SEMANTIC_COLORS:
            primary_color = ColorThemeManager.SEMANTIC_COLORS[color]
        else:
            primary_color = ColorThemeManager.BRAND_COLORS['primary']
        
        # Create card content
        content_elements = []
        
        # Header with icon and title
        header_row = ft.Row([
            ft.Container(
                content=ft.Icon(icon, size=20, color=primary_color),
                bgcolor=ft.colors.with_opacity(0.1, primary_color),
                padding=ft.padding.all(8),
                border_radius=ft.border_radius.all(8)
            ),
            ft.Text(
                title,
                size=14,
                weight=ft.FontWeight.W_500,
                color=ft.colors.ON_SURFACE_VARIANT,
                expand=True
            )
        ], spacing=12, vertical_alignment=ft.CrossAxisAlignment.CENTER)
        
        content_elements.append(header_row)
        
        # Main value with animation container
        value_container = ft.Container(
            content=ft.Text(
                value,
                size=28,
                weight=ft.FontWeight.BOLD,
                color=ft.colors.ON_SURFACE
            ),
            animate=ft.animation.Animation(
                duration=500,
                curve=ft.AnimationCurve.EASE_OUT
            ) if animate_value else None
        )
        content_elements.append(value_container)
        
        # Subtitle and trend information
        if subtitle or trend_data:
            bottom_elements = []
            
            if subtitle:
                bottom_elements.append(
                    ft.Text(
                        subtitle,
                        size=12,
                        color=ft.colors.ON_SURFACE_VARIANT
                    )
                )
            
            if trend_data:
                trend_value = trend_data.get('value', 0)
                trend_positive = trend_data.get('positive', True)
                trend_color = ColorThemeManager.SEMANTIC_COLORS['success'] if trend_positive else ColorThemeManager.SEMANTIC_COLORS['error']
                trend_icon = ft.icons.TRENDING_UP if trend_positive else ft.icons.TRENDING_DOWN
                
                trend_chip = ft.Container(
                    content=ft.Row([
                        ft.Icon(trend_icon, size=12, color=trend_color),
                        ft.Text(
                            f"{'+' if trend_positive else ''}{trend_value:.1f}%",
                            size=11,
                            color=trend_color,
                            weight=ft.FontWeight.W_600
                        )
                    ], spacing=4, tight=True),
                    bgcolor=ft.colors.with_opacity(0.1, trend_color),
                    padding=ft.padding.symmetric(horizontal=8, vertical=4),
                    border_radius=ft.border_radius.all(10),
                    border=ft.border.all(1, ft.colors.with_opacity(0.2, trend_color))
                )
                bottom_elements.append(trend_chip)
            
            if bottom_elements:
                content_elements.append(
                    ft.Row(
                        bottom_elements,
                        alignment=ft.MainAxisAlignment.SPACE_BETWEEN,
                        vertical_alignment=ft.CrossAxisAlignment.CENTER
                    )
                )
        
        # Create main content column
        card_content = ft.Column(
            content_elements,
            spacing=16,
            tight=True
        )
        
        # Create glassmorphism container with hover effects
        glass_container = GlassmorphismStyles.create_glass_container(
            content=card_content,
            blur_intensity=15.0,
            opacity=0.08,
            border_opacity=0.15,
            border_radius=16.0,
            padding=ft.padding.all(20),
            shadow_blur=24.0,
            shadow_opacity=0.12
        )
        
        # Wrap in hover animation container
        return AnimationHelpers.create_hover_animation_container(
            content=glass_container,
            hover_elevation=8.0,
            normal_elevation=4.0,
            hover_scale=1.02,
            animation_duration=200,
            border_radius=16.0,
            padding=ft.padding.all(0)  # No additional padding since glass_container has it
        )
    
    @staticmethod
    def create_enhanced_progress_ring(
        value: float,
        size: float = 60,
        stroke_width: float = 6,
        color: Optional[str] = None,
        background_color: Optional[str] = None,
        show_percentage: bool = True
    ) -> ft.Stack:
        """Create an enhanced progress ring with percentage display"""
        
        if color is None:
            color = ColorThemeManager.BRAND_COLORS['primary']
        if background_color is None:
            background_color = ft.colors.with_opacity(0.1, ft.colors.ON_SURFACE)
        
        # Create progress ring
        progress_ring = ft.ProgressRing(
            value=value / 100 if value > 1 else value,
            width=size,
            height=size,
            stroke_width=stroke_width,
            color=color,
            bgcolor=background_color
        )
        
        # Create percentage text if requested
        if show_percentage:
            percentage_text = ft.Text(
                f"{int(value)}%",
                size=size * 0.2,
                weight=ft.FontWeight.BOLD,
                color=ft.colors.ON_SURFACE,
                text_align=ft.TextAlign.CENTER
            )
            
            return ft.Stack([
                progress_ring,
                ft.Container(
                    content=percentage_text,
                    alignment=ft.alignment.center,
                    width=size,
                    height=size
                )
            ])
        else:
            return ft.Stack([progress_ring])
    
    @staticmethod
    def create_enhanced_chip(
        text: str,
        icon: Optional[str] = None,
        color: str = "primary",
        variant: str = "filled",  # "filled", "outlined", "soft"
        size: str = "medium"  # "small", "medium", "large"
    ) -> ft.Container:
        """Create an enhanced chip with modern styling"""
        
        # Get color
        if color in ColorThemeManager.BRAND_COLORS:
            primary_color = ColorThemeManager.BRAND_COLORS[color]
        elif color in ColorThemeManager.SEMANTIC_COLORS:
            primary_color = ColorThemeManager.SEMANTIC_COLORS[color]
        else:
            primary_color = ColorThemeManager.BRAND_COLORS['primary']
        
        # Size configurations
        size_configs = {
            "small": {"padding": ft.padding.symmetric(horizontal=8, vertical=4), "text_size": 11, "icon_size": 12, "radius": 10},
            "medium": {"padding": ft.padding.symmetric(horizontal=12, vertical=6), "text_size": 12, "icon_size": 14, "radius": 12},
            "large": {"padding": ft.padding.symmetric(horizontal=16, vertical=8), "text_size": 14, "icon_size": 16, "radius": 14}
        }
        
        config = size_configs.get(size, size_configs["medium"])
        
        # Create content
        content_elements = []
        if icon:
            content_elements.append(ft.Icon(icon, size=config["icon_size"]))
        content_elements.append(ft.Text(text, size=config["text_size"], weight=ft.FontWeight.W_500))
        
        chip_content = ft.Row(
            content_elements,
            spacing=6,
            tight=True,
            vertical_alignment=ft.CrossAxisAlignment.CENTER
        )
        
        # Style based on variant
        if variant == "filled":
            return ft.Container(
                content=chip_content,
                bgcolor=primary_color,
                padding=config["padding"],
                border_radius=ft.border_radius.all(config["radius"])
            )
        elif variant == "outlined":
            return ft.Container(
                content=chip_content,
                bgcolor=ft.colors.TRANSPARENT,
                padding=config["padding"],
                border_radius=ft.border_radius.all(config["radius"]),
                border=ft.border.all(1, primary_color)
            )
        else:  # soft
            return ft.Container(
                content=chip_content,
                bgcolor=ft.colors.with_opacity(0.1, primary_color),
                padding=config["padding"],
                border_radius=ft.border_radius.all(config["radius"]),
                border=ft.border.all(1, ft.colors.with_opacity(0.2, primary_color))
            )
    
    @staticmethod
    def create_enhanced_icon_badge(
        icon: str,
        tooltip: str,
        color: str = "primary",
        size: float = 16,
        background_opacity: float = 0.1
    ) -> ft.Container:
        """Create an enhanced icon badge with modern styling"""
        
        # Get color
        if color in ColorThemeManager.BRAND_COLORS:
            primary_color = ColorThemeManager.BRAND_COLORS[color]
        elif color in ColorThemeManager.SEMANTIC_COLORS:
            primary_color = ColorThemeManager.SEMANTIC_COLORS[color]
        else:
            primary_color = ColorThemeManager.BRAND_COLORS['primary']
        
        return ft.Container(
            content=ft.Icon(icon, size=size, color=primary_color),
            bgcolor=ft.colors.with_opacity(background_opacity, primary_color),
            padding=ft.padding.all(8),
            border_radius=ft.border_radius.all(20),
            tooltip=tooltip,
            border=ft.border.all(1, ft.colors.with_opacity(0.2, primary_color))
        )

# ============================================================================
# ENHANCED LAYOUT UTILITIES
# ============================================================================

class EnhancedLayoutUtils:
    """Deprecated; prefer ResponsiveLayoutManager for layout utilities."""
    pass