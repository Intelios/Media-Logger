import flet as ft
import os
import uuid
import shutil
from typing import TYPE_CHECKING

# Import project modules
import database
import config
import utils
from ui_enhanced import (
    ResponsiveLayoutManager, 
    GlassmorphismStyles, 
    AnimationHelpers, 
    ColorThemeManager,
    MicroInteractions
)

# Use a forward reference for type hinting to avoid circular imports
if TYPE_CHECKING:
    from ui import AppUI, create_gallery_card

class ProfilesView:
    """
    Manages the UI and state for the Profiles section of the application.
    """
    def __init__(self, app_ui: 'AppUI'):
        self.app_ui = app_ui
        self.page = app_ui.page
        
        # State management
        self.view_mode = "list"  # "list" or "detail"
        self.current_profile = None
        self.profiles_summary = []
        self.profile_entries = []

        # File picker for profile images
        self.profile_image_picker = ft.FilePicker(on_result=self._handle_profile_image_pick)
        if self.profile_image_picker not in self.page.overlay:
            self.page.overlay.append(self.profile_image_picker)

        # UI element references
        self.main_container = ft.Ref[ft.Container]()
        self.profile_detail_image = ft.Ref[ft.Image]()

    def build(self) -> ft.Container:
        """
        Builds the main container for the Profiles view.
        This is the entry point called by the main UI.
        """
        initial_content = self._build_list_view()
        return ft.Container(
            ref=self.main_container,
            content=initial_content,
            expand=True,
            animate=ft.Animation(300, ft.AnimationCurve.EASE_OUT)
        )

    def _update_view(self):
        """Switches the content between the list view and the detail view with an animation."""
        if not self.main_container.current:
            return

        new_content = self._build_list_view() if self.view_mode == "list" else self._build_detail_view()
        
        # Use AnimatedSwitcher for a smooth transition
        self.main_container.current.content = ft.AnimatedSwitcher(
            content=new_content,
            transition=ft.AnimatedSwitcherTransition.FADE,
            duration=300,
        )
        self.main_container.current.update()

    # --- List View ---

    def _build_list_view(self) -> ft.Column:
        """Builds the UI that displays a grid of all automatically generated profiles."""
        self.profiles_summary = database.get_all_profiles_summary_db()

        header = ft.Row([
            ft.Icon(ft.Icons.PEOPLE_OUTLINE_ROUNDED, size=36, color=ft.Colors.PRIMARY),
            ft.Column([
                ft.Text("Profiles", style=ft.TextThemeStyle.HEADLINE_MEDIUM, weight=ft.FontWeight.W_600),
                ft.Text("Discover your most frequent artists, studios, platforms, and more.", size=14, color=ft.Colors.ON_SURFACE_VARIANT)
            ], spacing=4, expand=True),
        ], spacing=16)

        if not self.profiles_summary:
            return self._build_empty_state()

        profile_cards = [self._build_profile_card(p) for p in self.profiles_summary]
        
        profiles_grid = ResponsiveLayoutManager.create_responsive_grid(
            items=profile_cards,
            grid_type='feature_cards', # Uses a good responsive configuration
            spacing=15,
            run_spacing=15
        )

        return ft.Container(
            content=ft.Column(
                controls=[header, ft.Container(height=20), profiles_grid],
                scroll=ft.ScrollMode.ADAPTIVE,
                spacing=20,
            ),
            padding=ft.padding.symmetric(horizontal=28, vertical=20),
            expand=True
        )
    
    def _build_empty_state(self) -> ft.Column:
        """Builds the UI shown when no profiles meet the criteria to be displayed."""
        return ft.Column([
            ft.Container(
                content=ft.Column([
                    ft.Icon(ft.Icons.GROUP_ADD_OUTLINED, size=80, color=ft.Colors.ON_SURFACE_VARIANT),
                    ft.Text("No Profiles Yet", style=ft.TextThemeStyle.HEADLINE_SMALL),
                    ft.Text(
                        "Profiles are automatically created for artists, studios, etc., that appear in 3 or more entries.",
                        text_align=ft.TextAlign.CENTER,
                        color=ft.Colors.ON_SURFACE_VARIANT
                    ),
                    ft.Text(
                        "Keep logging your media to unlock this feature!",
                        text_align=ft.TextAlign.CENTER,
                        weight=ft.FontWeight.W_500
                    )
                ],
                horizontal_alignment=ft.CrossAxisAlignment.CENTER,
                spacing=15),
                alignment=ft.alignment.center,
                expand=True
            )
        ], expand=True)

    def _build_profile_card(self, profile: dict) -> ft.Container:
        """Creates a single, modern card for a profile in the list view."""
        profile_type = profile['type']
        profile_type_label = profile_type.replace('_', ' ').capitalize()
        profile_name = profile['name']
        
        # Get profile-specific data (custom image)
        profile_db_data = database.get_profile_db(profile_type, profile_name)
        image_src = config.DEFAULT_IMAGE_URL
        if profile_db_data and profile_db_data.get('image_url'):
            full_path = os.path.join(config.ASSETS_DIR, profile_db_data['image_url'])
            if os.path.exists(full_path):
                image_src = profile_db_data['image_url']
        
        # Default icon if no image
        default_icon = {
            "actress": ft.Icons.WOMAN_2_OUTLINED,
            "director": ft.Icons.BUSINESS_OUTLINED,
            "artist": ft.Icons.HEADSET_OUTLINED,
            "author": ft.Icons.PERSON_OUTLINE,
            "platform": ft.Icons.VIDEOGAME_ASSET_OUTLINED
        }.get(profile_type, ft.Icons.PERSON)

        image_content = ft.Image(src=image_src, fit=ft.ImageFit.COVER, width=80, height=80) if image_src != config.DEFAULT_IMAGE_URL else ft.Icon(default_icon, size=40, color=ft.Colors.PRIMARY)

        avg_score = profile['average_score']
        score_display = ft.Container()
        if avg_score is not None:
            color_scheme = ColorThemeManager.get_rating_color_scheme(avg_score)
            score_display = ft.Row([
                ft.Icon(ft.Icons.STAR_ROUNDED, size=16, color=color_scheme['primary']),
                ft.Text(f"{avg_score:.1f}", weight=ft.FontWeight.BOLD, color=color_scheme['primary'])
            ], spacing=5)

        card_content = ft.Column([
            ft.Row([
                ft.Container(
                    content=image_content,
                    width=80, height=80,
                    bgcolor=ft.Colors.with_opacity(0.05, ft.Colors.PRIMARY) if image_src == config.DEFAULT_IMAGE_URL else None,
                    border_radius=ft.border_radius.all(40),
                    alignment=ft.alignment.center,
                    clip_behavior=ft.ClipBehavior.ANTI_ALIAS
                ),
                ft.Column([
                    ft.Text(profile_name, weight=ft.FontWeight.BOLD, size=18, max_lines=2, overflow=ft.TextOverflow.ELLIPSIS),
                    ft.Text(profile_type_label, color=ft.Colors.ON_SURFACE_VARIANT, size=12),
                ], spacing=2, expand=True)
            ], spacing=15),
            ft.Divider(height=10),
            ft.Row([
                ft.Row([
                    ft.Icon(ft.Icons.VIDEO_LIBRARY_OUTLINED, size=16, color=ft.Colors.ON_SURFACE_VARIANT),
                    ft.Text(f"{profile['entry_count']} Entries", weight=ft.FontWeight.W_500),
                ], spacing=5),
                score_display
            ], alignment=ft.MainAxisAlignment.SPACE_BETWEEN)
        ], spacing=10)
        
        # Create a themed gradient for a more interesting glass effect
        profile_color_light = ColorThemeManager.get_profile_type_color(profile_type, 'light')
        profile_color_dark = ColorThemeManager.get_profile_type_color(profile_type, 'dark')
        card_gradient = ft.LinearGradient(
            begin=ft.alignment.top_left,
            end=ft.alignment.bottom_right,
            colors=[
                ft.Colors.with_opacity(0.15, profile_color_light),
                ft.Colors.with_opacity(0.05, profile_color_dark)
            ]
        )

        glass_card = GlassmorphismStyles.create_glass_card(
            content=card_content,
            elevation=4.0,
            padding=ft.padding.all(20),
            gradient=card_gradient
        )
        
        # Wrap in a hover animation container that also handles the click
        hover_card = AnimationHelpers.create_hover_animation_container(
            content=glass_card,
            hover_elevation=12.0,
            normal_elevation=4.0,
            hover_scale=1.03,
            animation_duration=250,
            border_radius=16,
            padding=ft.padding.all(0) # The glass card already has padding
        )
        hover_card.on_click=lambda e, p=profile: self._handle_profile_click(p)
        
        return hover_card
    
    def _handle_profile_click(self, profile_data: dict):
        """Sets the state to detail view and fetches the necessary data."""
        self.current_profile = profile_data
        self.profile_entries = database.get_entries_for_profile_db(profile_data['type'], profile_data['name'])
        self.view_mode = "detail"
        self._update_view()

    # --- Detail View ---

    def _build_detail_view(self) -> ft.Column:
        """Builds the detailed view for a single profile."""
        if not self.current_profile:
            return ft.Column([ft.Text("Error: No profile selected.")])

        # Get profile image
        profile_db_data = database.get_profile_db(self.current_profile['type'], self.current_profile['name'])
        image_src = config.DEFAULT_IMAGE_URL
        if profile_db_data and profile_db_data.get('image_url'):
            full_path = os.path.join(config.ASSETS_DIR, profile_db_data['image_url'])
            if os.path.exists(full_path):
                image_src = profile_db_data['image_url']

        # Header section
        image_container = ft.Container(
            content=ft.Image(ref=self.profile_detail_image, src=image_src, fit=ft.ImageFit.COVER, width=150, height=150) if image_src != config.DEFAULT_IMAGE_URL else ft.Icon(ft.Icons.PERSON, size=80),
            width=150, height=150,
            border_radius=ft.border_radius.all(75),
            alignment=ft.alignment.center,
            clip_behavior=ft.ClipBehavior.ANTI_ALIAS,
            bgcolor=ft.Colors.SURFACE,
            on_click=lambda e, src=image_src: self._show_enlarged_image(src),
            tooltip="View larger image" if image_src != config.DEFAULT_IMAGE_URL else ""
        )

        header = ft.Container(
            content=ft.Row([
                ft.Stack([
                    image_container,
                    ft.Container(
                        content=ft.IconButton(
                            icon=ft.Icons.EDIT, icon_size=18,
                            on_click=self._open_image_picker,
                            bgcolor=ft.Colors.with_opacity(0.7, ft.Colors.BLACK),
                            icon_color=ft.Colors.WHITE
                        ),
                        bottom=5, right=5
                    )
                ]),
                ft.Column([
                    ft.Text(self.current_profile['name'], style=ft.TextThemeStyle.HEADLINE_LARGE, weight=ft.FontWeight.BOLD),
                    ft.Text(self.current_profile['type'].capitalize(), style=ft.TextThemeStyle.TITLE_MEDIUM, color=ft.Colors.ON_SURFACE_VARIANT),
                    ft.Divider(height=15),
                    ft.Row([
                        self._create_detail_stat("Entries", self.current_profile['entry_count'], ft.Icons.VIDEO_LIBRARY_OUTLINED),
                        self._create_detail_stat("Avg. Score", f"{self.current_profile['average_score']:.1f}", ft.Icons.STAR_ROUNDED),
                    ], spacing=30)
                ], spacing=5, expand=True)
            ], spacing=30, vertical_alignment=ft.CrossAxisAlignment.CENTER),
            padding=ft.padding.all(30),
            border_radius=16,
            bgcolor=ft.Colors.SURFACE
        )

        # Gallery of associated entries
        # Need to import create_gallery_card from ui module
        from ui import create_gallery_card
        
        def refresh_profile_view():
            """Callback to refresh data after an edit/delete action."""
            self._handle_profile_click(self.current_profile)

        gallery_cards = [
            create_gallery_card(
                self.page, 
                entry, 
                self.app_ui.delete_jav_action_with_callback, # Use a wrapper in AppUI
                lambda item, cb=refresh_profile_view: self.app_ui.open_edit_jav_dialog(item, cb),
                self.app_ui.show_description_dialog,
                self.app_ui.show_image_dialog
            ) for entry in self.profile_entries
        ]
        
        gallery_grid = ResponsiveLayoutManager.create_responsive_grid(
            items=gallery_cards,
            grid_type='media_cards',
            spacing=10,
            run_spacing=10
        ) if gallery_cards else ft.Container(
            content=ft.Text("No entries found for this profile.", text_align=ft.TextAlign.CENTER),
            padding=50, alignment=ft.alignment.center
        )

        return ft.Container(
            content=ft.Column(
                controls=[
                    ft.Row([
                        ft.IconButton(icon=ft.Icons.ARROW_BACK_ROUNDED, on_click=lambda e: self._handle_back_to_list(), tooltip="Back to Profiles"),
                        ft.Container(expand=True)
                    ]),
                    header,
                    ft.Container(height=10),
                    ft.Text(f"Associated Entries ({len(self.profile_entries)})", style=ft.TextThemeStyle.TITLE_LARGE),
                    ft.Container(content=gallery_grid, expand=True)
                ],
                scroll=ft.ScrollMode.ADAPTIVE,
                spacing=15,
                expand=True
            ),
            padding=ft.padding.symmetric(horizontal=28, vertical=20),
            expand=True
        )
    
    def _create_detail_stat(self, label, value, icon):
        """Helper to create a stat display for the profile detail header."""
        return ft.Row([
            ft.Icon(icon, color=ft.Colors.PRIMARY, size=24),
            ft.Column([
                ft.Text(str(value), style=ft.TextThemeStyle.HEADLINE_SMALL, weight=ft.FontWeight.BOLD),
                ft.Text(label, color=ft.Colors.ON_SURFACE_VARIANT, weight=ft.FontWeight.W_500, size=12, offset=ft.Offset(0, -0.2))
            ], spacing=0)
        ], spacing=12)

    def _handle_back_to_list(self, e=None):
        """Resets state to show the main profile list."""
        self.current_profile = None
        self.view_mode = "list"
        self._update_view()

    def _show_enlarged_image(self, image_src: str):
        """Displays the profile image in a larger view within a dialog."""
        if not image_src or image_src == config.DEFAULT_IMAGE_URL:
            # Don't show dialog for default/missing images
            return

        def close_dialog(e):
            dialog.open = False
            self.page.update()

        dialog = ft.AlertDialog(
            modal=True,
            content=ft.Container(
                content=ft.Image(
                    src=image_src,
                    fit=ft.ImageFit.CONTAIN,
                    border_radius=ft.border_radius.all(12)
                ),
                padding=0, # Image will fill the content area
                clip_behavior=ft.ClipBehavior.ANTI_ALIAS
            ),
            actions=[
                ft.TextButton("Close", on_click=close_dialog)
            ],
            actions_alignment=ft.MainAxisAlignment.END,
            content_padding=ft.padding.all(24),
            shape=ft.RoundedRectangleBorder(radius=16)
        )

        self.page.dialog = dialog
        dialog.open = True
        self.page.update()

    # --- Image Handling ---

    def _open_image_picker(self, e):
        """Opens the file picker to choose a new profile image."""
        self.profile_image_picker.pick_files(
            dialog_title="Select Profile Image",
            allow_multiple=False,
            allowed_extensions=["jpg", "jpeg", "png", "gif", "bmp", "webp"]
        )
    
    def _handle_profile_image_pick(self, e: ft.FilePickerResultEvent):
        if not e.files or not self.current_profile:
            return
        
        source_path = e.files[0].path
        try:
            # Copy image to assets/images directory
            if not os.path.exists(config.IMAGES_DIR):
                os.makedirs(config.IMAGES_DIR)
            
            _, extension = os.path.splitext(source_path)
            unique_filename = f"profile_{uuid.uuid4()}{extension}"
            destination_path = os.path.join(config.IMAGES_DIR, unique_filename)
            shutil.copy2(source_path, destination_path)
            
            # Relative path for DB
            db_path = os.path.join("images", unique_filename).replace("\\", "/")
            
            # Save to DB
            database.set_profile_image_db(self.current_profile['type'], self.current_profile['name'], db_path)
            
            # Update UI
            if self.profile_detail_image.current:
                self.profile_detail_image.current.src = db_path
                self.profile_detail_image.current.update()
            
            self.app_ui.show_snackbar("Profile image updated successfully.", color=ft.Colors.GREEN_700)

        except Exception as ex:
            print(f"Error updating profile image: {ex}")
            self.app_ui.show_snackbar(f"Error updating image: {ex}", color=ft.Colors.ERROR_CONTAINER)