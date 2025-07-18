"""
Enhanced UI Components Foundation for Dashboard UI Upgrade
Provides modern card designs, color theming utilities, and animation helpers
"""

import flet as ft
from typing import Optional, Dict, Any, List, Union
import math

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
    """Modern card design utilities with enhanced visual effects"""
    
    @staticmethod
    def create_elevated_card(
        content: ft.Control,
        elevation: float = 6.0,
        border_radius: float = 16.0,
        padding: Optional[ft.Padding] = None,
        margin: Optional[ft.Margin] = None,
        gradient: Optional[ft.LinearGradient] = None,
        shadow_color: Optional[str] = None,
        border: Optional[ft.Border] = None
    ) -> ft.Card:
        """Create a modern elevated card with enhanced styling"""
        
        if padding is None:
            padding = ft.padding.all(20)
        if margin is None:
            margin = ft.margin.all(8)
        if shadow_color is None:
            shadow_color = ft.colors.with_opacity(0.15, ft.colors.BLACK)
            
        card_container = ft.Container(
            content=content,
            padding=padding,
            gradient=gradient,
            border=border,
            border_radius=ft.border_radius.all(border_radius)
        )
        
        return ft.Card(
            content=card_container,
            elevation=elevation,
            margin=margin,
            shape=ft.RoundedRectangleBorder(radius=border_radius),
            shadow_color=shadow_color,
            surface_tint_color=ft.colors.SURFACE_TINT
        )
    
    @staticmethod
    def create_gradient_card(
        content: ft.Control,
        gradient_colors: List[str],
        gradient_begin: ft.Alignment = ft.alignment.top_left,
        gradient_end: ft.Alignment = ft.alignment.bottom_right,
        border_radius: float = 16.0,
        padding: Optional[ft.Padding] = None,
        elevation: float = 4.0
    ) -> ft.Card:
        """Create a card with gradient background"""
        
        gradient = ft.LinearGradient(
            colors=gradient_colors,
            begin=gradient_begin,
            end=gradient_end
        )
        
        return ModernCardStyles.create_elevated_card(
            content=content,
            gradient=gradient,
            border_radius=border_radius,
            padding=padding,
            elevation=elevation
        )

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
    """Enhanced layout utilities for modern dashboard design"""
    
    @staticmethod
    def create_responsive_grid(
        items: List[ft.Control],
        min_item_width: float = 300,
        spacing: float = 16,
        run_spacing: float = 16
    ) -> ft.Row:
        """Create a responsive grid layout that adapts to screen size"""
        
        return ft.Row(
            controls=items,
            wrap=True,
            spacing=spacing,
            run_spacing=run_spacing,
            alignment=ft.MainAxisAlignment.START,
            vertical_alignment=ft.CrossAxisAlignment.START
        )
    
    @staticmethod
    def create_section_header(
        title: str,
        subtitle: Optional[str] = None,
        action_button: Optional[ft.Control] = None,
        icon: Optional[str] = None
    ) -> ft.Container:
        """Create a modern section header with optional action button"""
        
        # Create title row
        title_elements = []
        
        if icon:
            title_elements.append(
                ft.Icon(icon, size=24, color=ColorThemeManager.BRAND_COLORS['primary'])
            )
        
        title_column = [
            ft.Text(
                title,
                size=20,
                weight=ft.FontWeight.BOLD,
                color=ft.colors.ON_SURFACE
            )
        ]
        
        if subtitle:
            title_column.append(
                ft.Text(
                    subtitle,
                    size=14,
                    color=ft.colors.ON_SURFACE_VARIANT
                )
            )
        
        title_elements.append(
            ft.Column(title_column, spacing=4, tight=True, expand=True)
        )
        
        if action_button:
            title_elements.append(action_button)
        
        header_row = ft.Row(
            title_elements,
            spacing=12,
            vertical_alignment=ft.CrossAxisAlignment.CENTER,
            alignment=ft.MainAxisAlignment.SPACE_BETWEEN
        )
        
        return ft.Container(
            content=header_row,
            padding=ft.padding.only(bottom=16),
            margin=ft.margin.only(bottom=8)
        )
    
    @staticmethod
    def create_enhanced_divider(
        height: float = 1,
        color: Optional[str] = None,
        margin: Optional[ft.Margin] = None
    ) -> ft.Container:
        """Create an enhanced divider with modern styling"""
        
        if color is None:
            color = ft.colors.with_opacity(0.08, ft.colors.ON_SURFACE)
        if margin is None:
            margin = ft.margin.symmetric(vertical=16)
        
        return ft.Container(
            height=height,
            bgcolor=color,
            margin=margin,
            border_radius=ft.border_radius.all(height / 2)
        )