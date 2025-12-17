# --- START OF FILE collections_view.py ---

import flet as ft
from datetime import datetime
import os

import database
import config
import utils
from ui_enhanced import EnhancedComponentFactory, AnimationHelpers, ColorThemeManager, GlassmorphismStyles

class CollectionsView:
    """Manages the UI and state for the Collections feature."""

    def __init__(self, app_ui):
        self.app_ui = app_ui
        self.page = app_ui.page
        self.state = {
            "view": "list",  # 'list' or 'detail'
            "selected_collection_id": None,
            "selected_collection_name": None
        }

    def build(self):
        """Builds the current view based on the internal state."""
        if self.state["view"] == "list":
            return self._build_collections_list_view()
        elif self.state["view"] == "detail":
            return self._build_collection_detail_view()
        return ft.Text("Error: Invalid collections view state.")

    def _switch_to_detail_view(self, collection_id, collection_name):
        """Switches the view to show a specific collection's items."""
        self.state["view"] = "detail"
        self.state["selected_collection_id"] = collection_id
        self.state["selected_collection_name"] = collection_name
        self.app_ui.refresh_current_view()

    def _switch_to_list_view(self):
        """Switches back to the main list of all collections."""
        self.state["view"] = "list"
        self.state["selected_collection_id"] = None
        self.state["selected_collection_name"] = None
        self.app_ui.refresh_current_view()

    def _build_collections_list_view(self):
        """Builds the UI that shows all created collections."""
        collections = database.get_all_collections_with_stats_db()

        # Enhanced empty state
        if not collections:
            return ft.Container(
                content=ft.Column([
                    # Gradient icon container
                    ft.Container(
                        content=ft.Icon(ft.Icons.COLLECTIONS_BOOKMARK_OUTLINED, size=56, color=ft.Colors.WHITE),
                        gradient=ft.LinearGradient(
                            colors=[ColorThemeManager.BRAND_COLORS['primary'], ColorThemeManager.BRAND_COLORS['secondary']],
                            begin=ft.alignment.top_left,
                            end=ft.alignment.bottom_right
                        ),
                        width=100,
                        height=100,
                        border_radius=50,
                        alignment=ft.alignment.center,
                        shadow=ft.BoxShadow(
                            spread_radius=0,
                            blur_radius=20,
                            color=ft.Colors.with_opacity(0.3, ColorThemeManager.BRAND_COLORS['primary']),
                            offset=ft.Offset(0, 8)
                        )
                    ),
                    ft.Container(height=16),
                    ft.Text("No Collections Yet", size=24, weight=ft.FontWeight.BOLD),
                    ft.Text(
                        "Create your first collection to group your favorite media.", 
                        color=ft.Colors.ON_SURFACE_VARIANT,
                        text_align=ft.TextAlign.CENTER
                    ),
                    ft.Container(height=24),
                    ft.Container(
                        content=ft.ElevatedButton(
                            "Create First Collection", 
                            icon=ft.Icons.ADD_ROUNDED,
                            on_click=lambda _: self._open_create_edit_collection_dialog(),
                            style=ft.ButtonStyle(
                                bgcolor=ColorThemeManager.BRAND_COLORS['primary'],
                                color=ft.Colors.WHITE,
                                padding=ft.padding.symmetric(horizontal=28, vertical=16),
                                shape=ft.RoundedRectangleBorder(radius=12)
                            )
                        ),
                        shadow=ft.BoxShadow(
                            spread_radius=0,
                            blur_radius=12,
                            color=ft.Colors.with_opacity(0.25, ColorThemeManager.BRAND_COLORS['primary']),
                            offset=ft.Offset(0, 4)
                        ),
                        border_radius=12
                    )
                ], horizontal_alignment=ft.CrossAxisAlignment.CENTER, spacing=8),
                alignment=ft.alignment.center,
                expand=True
            )

        collection_cards = []
        for collection in collections:
            collection_cards.append(self._create_collection_card(collection))

        # Enhanced header with gradient icon background
        header_icon = ft.Container(
            content=ft.Icon(ft.Icons.COLLECTIONS_BOOKMARK, size=22, color=ft.Colors.WHITE),
            gradient=ft.LinearGradient(
                colors=[ColorThemeManager.BRAND_COLORS['primary'], ColorThemeManager.BRAND_COLORS['primary_dark']],
                begin=ft.alignment.top_left,
                end=ft.alignment.bottom_right
            ),
            width=40,
            height=40,
            border_radius=10,
            alignment=ft.alignment.center
        )
        
        header_row = ft.Row([
            header_icon,
            ft.Text("Your Collections", size=26, weight=ft.FontWeight.BOLD),
            ft.Container(expand=True),
            ft.Container(
                content=ft.ElevatedButton(
                    "New Collection", 
                    icon=ft.Icons.ADD_ROUNDED,
                    on_click=lambda _: self._open_create_edit_collection_dialog(),
                    style=ft.ButtonStyle(
                        bgcolor=ColorThemeManager.BRAND_COLORS['primary'],
                        color=ft.Colors.WHITE,
                        padding=ft.padding.symmetric(horizontal=20, vertical=12),
                        shape=ft.RoundedRectangleBorder(radius=10)
                    )
                ),
                shadow=ft.BoxShadow(
                    spread_radius=0,
                    blur_radius=8,
                    color=ft.Colors.with_opacity(0.2, ColorThemeManager.BRAND_COLORS['primary']),
                    offset=ft.Offset(0, 3)
                ),
                border_radius=10
            )
        ], alignment=ft.MainAxisAlignment.START, vertical_alignment=ft.CrossAxisAlignment.CENTER, spacing=16)

        # Gradient divider
        divider = ft.Container(
            height=2,
            gradient=ft.LinearGradient(
                colors=[
                    ft.Colors.with_opacity(0, ft.Colors.PRIMARY),
                    ft.Colors.with_opacity(0.3, ft.Colors.PRIMARY),
                    ft.Colors.with_opacity(0, ft.Colors.PRIMARY)
                ],
                begin=ft.alignment.center_left,
                end=ft.alignment.center_right
            ),
            margin=ft.margin.symmetric(vertical=16)
        )

        # Grid layout for collection cards - 2 per row for wider magazine-style cards
        cards_grid = ft.ResponsiveRow(
            controls=[
                ft.Container(
                    content=card,
                    col={"sm": 12, "md": 6, "lg": 6, "xl": 6}
                ) for card in collection_cards
            ],
            spacing=24,
            run_spacing=24
        )

        return ft.Container(
            content=ft.Column(
                scroll=ft.ScrollMode.ADAPTIVE,
                controls=[header_row, divider, cards_grid],
                spacing=0
            ),
            padding=ft.padding.all(24),
            expand=True
        )

    def _create_collection_card(self, collection):
        """Creates a 'Magazine Shelf' style card for a single collection with fanned cover images."""
        def on_delete_confirm(e):
            database.delete_collection_db(collection['id'])
            self.app_ui.show_snackbar(f"Collection '{collection['name']}' deleted.", color=ft.Colors.GREEN_700)
            self.app_ui.refresh_current_view()
        
        def confirm_delete(e):
            self.app_ui.show_confirmation_dialog(
                title="Delete Collection?",
                content=f"Are you sure you want to permanently delete the collection '{collection['name']}'? This cannot be undone.",
                on_confirm=on_delete_confirm
            )
        
        # Get items for cover stack preview
        items = database.get_collection_items_db(collection['id'])
        item_count = collection['item_count']
        description = collection.get('description') or ''
        
        # Card dimensions
        CARD_HEIGHT = 180
        COVER_STACK_WIDTH = 160
        COVER_WIDTH = 85
        COVER_HEIGHT = 120
        ACCENT_BAR_WIDTH = 6
        
        # Create fanned cover stack - overlapping covers at slight angles
        cover_stack_controls = []
        rotation_angles = [-8, -4, 0, 4]  # Degrees for each cover
        offsets = [(0, 8), (12, 4), (24, 0), (36, 4)]  # (left_offset, top_offset)
        
        # Use first 4 items for the stack, or create placeholders
        for i in range(4):
            if i < len(items):
                img_url = items[i].get('image_url', '')
                cover_content = ft.Image(
                    src=img_url,
                    fit=ft.ImageFit.COVER,
                    width=COVER_WIDTH,
                    height=COVER_HEIGHT,
                    error_content=ft.Container(
                        width=COVER_WIDTH,
                        height=COVER_HEIGHT,
                        bgcolor=ft.Colors.with_opacity(0.15, ft.Colors.PRIMARY),
                        content=ft.Icon(ft.Icons.PHOTO_LIBRARY_ROUNDED, size=24, color=ft.Colors.with_opacity(0.5, ft.Colors.PRIMARY)),
                        alignment=ft.alignment.center
                    )
                ) if img_url else ft.Container(
                    width=COVER_WIDTH,
                    height=COVER_HEIGHT,
                    bgcolor=ft.Colors.with_opacity(0.1, ft.Colors.ON_SURFACE),
                    content=ft.Icon(ft.Icons.PHOTO_LIBRARY_ROUNDED, size=24, color=ft.Colors.ON_SURFACE_VARIANT),
                    alignment=ft.alignment.center
                )
            else:
                # Placeholder for empty slots
                cover_content = ft.Container(
                    width=COVER_WIDTH,
                    height=COVER_HEIGHT,
                    bgcolor=ft.Colors.with_opacity(0.05, ft.Colors.ON_SURFACE),
                    border=ft.border.all(1, ft.Colors.with_opacity(0.1, ft.Colors.ON_SURFACE))
                )
            
            cover_container = ft.Container(
                content=cover_content,
                width=COVER_WIDTH,
                height=COVER_HEIGHT,
                border_radius=8,
                clip_behavior=ft.ClipBehavior.ANTI_ALIAS,
                shadow=ft.BoxShadow(
                    spread_radius=0,
                    blur_radius=8,
                    color=ft.Colors.with_opacity(0.2, ft.Colors.BLACK),
                    offset=ft.Offset(2, 3)
                ),
                border=ft.border.all(1, ft.Colors.with_opacity(0.1, ft.Colors.WHITE)),
                rotate=ft.Rotate(rotation_angles[i] * 3.14159 / 180),  # Convert to radians
                left=offsets[i][0],
                top=offsets[i][1],
                animate_rotation=ft.Animation(300, ft.AnimationCurve.EASE_OUT),
                animate_offset=ft.Animation(300, ft.AnimationCurve.EASE_OUT)
            )
            cover_stack_controls.append(cover_container)
        
        # Reverse so the last one (front) is drawn on top
        cover_stack_controls.reverse()
        
        # Floating item count badge with glassmorphism effect
        item_count_badge = ft.Container(
            content=ft.Row([
                ft.Icon(ft.Icons.LAYERS_ROUNDED, size=14, color=ft.Colors.WHITE),
                ft.Text(f"{item_count}", size=14, weight=ft.FontWeight.BOLD, color=ft.Colors.WHITE)
            ], spacing=5, tight=True),
            bgcolor=ft.Colors.with_opacity(0.85, ColorThemeManager.BRAND_COLORS['primary']),
            padding=ft.padding.symmetric(horizontal=12, vertical=6),
            border_radius=20,
            border=ft.border.all(1.5, ft.Colors.with_opacity(0.3, ft.Colors.WHITE)),
            shadow=ft.BoxShadow(
                spread_radius=0,
                blur_radius=10,
                color=ft.Colors.with_opacity(0.3, ColorThemeManager.BRAND_COLORS['primary']),
                offset=ft.Offset(0, 3)
            ),
            right=8,
            bottom=8
        )
        
        # Cover stack container with floating badge
        cover_stack = ft.Container(
            content=ft.Stack(
                controls=cover_stack_controls + [item_count_badge],
                width=COVER_STACK_WIDTH,
                height=COVER_HEIGHT + 30
            ),
            width=COVER_STACK_WIDTH,
            height=COVER_HEIGHT + 30,
            padding=ft.padding.only(left=10, top=15)
        )
        
        # Gradient accent bar (book spine effect)
        accent_bar = ft.Container(
            width=ACCENT_BAR_WIDTH,
            gradient=ft.LinearGradient(
                colors=[
                    ColorThemeManager.BRAND_COLORS['primary'],
                    ColorThemeManager.BRAND_COLORS['secondary'],
                    ColorThemeManager.BRAND_COLORS['primary_dark']
                ],
                begin=ft.alignment.top_center,
                end=ft.alignment.bottom_center
            ),
            border_radius=ft.border_radius.only(top_left=16, bottom_left=16),
            animate=ft.Animation(300, ft.AnimationCurve.EASE_OUT)
        )
        
        # Options menu
        options_button = ft.PopupMenuButton(
            icon=ft.Icons.MORE_HORIZ_ROUNDED,
            icon_color=ft.Colors.ON_SURFACE_VARIANT,
            icon_size=20,
            items=[
                ft.PopupMenuItem(text="Edit", icon=ft.Icons.EDIT_OUTLINED, on_click=lambda _, c=collection: self._open_create_edit_collection_dialog(c)),
                ft.PopupMenuItem(),
                ft.PopupMenuItem(text="Delete", icon=ft.Icons.DELETE_OUTLINE, on_click=confirm_delete)
            ],
            tooltip="Collection options"
        )
        
        # Content section
        content_section = ft.Container(
            content=ft.Column([
                ft.Row([
                    ft.Container(expand=True),
                    options_button
                ]),
                ft.Container(height=4),
                ft.Text(
                    collection['name'], 
                    size=20, 
                    weight=ft.FontWeight.BOLD, 
                    max_lines=2, 
                    overflow=ft.TextOverflow.ELLIPSIS,
                    style=ft.TextStyle(letter_spacing=0.3)
                ),
                ft.Container(height=6),
                ft.Text(
                    description if description else "No description",
                    size=13,
                    color=ft.Colors.ON_SURFACE_VARIANT,
                    max_lines=2,
                    overflow=ft.TextOverflow.ELLIPSIS,
                    italic=not description
                ),
                ft.Container(expand=True),
                # Decorative bottom row with arrow hint
                ft.Row([
                    ft.Container(
                        content=ft.Row([
                            ft.Text("View collection", size=12, color=ft.Colors.PRIMARY, weight=ft.FontWeight.W_500),
                            ft.Icon(ft.Icons.ARROW_FORWARD_ROUNDED, size=14, color=ft.Colors.PRIMARY)
                        ], spacing=4, tight=True),
                        opacity=0.7
                    )
                ])
            ], spacing=0),
            expand=True,
            padding=ft.padding.only(top=8, right=16, bottom=12)
        )
        
        # Main card layout
        card_inner = ft.Row([
            accent_bar,
            cover_stack,
            content_section
        ], spacing=0, expand=True)
        
        # Card container with enhanced styling
        card_content = ft.Container(
            content=card_inner,
            height=CARD_HEIGHT,
            border_radius=16,
            bgcolor=ft.Colors.SURFACE,
            border=ft.border.all(1, ft.Colors.with_opacity(0.1, ft.Colors.ON_SURFACE)),
            clip_behavior=ft.ClipBehavior.ANTI_ALIAS,
            ink=True,
            on_click=lambda _: self._switch_to_detail_view(collection['id'], collection['name']),
            shadow=ft.BoxShadow(
                spread_radius=0,
                blur_radius=12,
                color=ft.Colors.with_opacity(0.1, ft.Colors.BLACK),
                offset=ft.Offset(0, 4)
            ),
            animate=ft.Animation(duration=250, curve=ft.AnimationCurve.EASE_OUT),
            animate_scale=ft.Animation(duration=250, curve=ft.AnimationCurve.EASE_OUT)
        )
        
        # Store references for hover animation
        card_content.data = {
            'cover_stack': cover_stack_controls,
            'accent_bar': accent_bar,
            'original_rotations': rotation_angles.copy()
        }
        
        # Enhanced hover animation with parallax effect on covers
        def on_hover(e):
            is_hovering = e.data == "true"
            
            if is_hovering:
                # Card effects
                card_content.shadow = ft.BoxShadow(
                    spread_radius=0,
                    blur_radius=24,
                    color=ft.Colors.with_opacity(0.2, ColorThemeManager.BRAND_COLORS['primary']),
                    offset=ft.Offset(0, 8)
                )
                card_content.scale = 1.02
                card_content.border = ft.border.all(1.5, ft.Colors.with_opacity(0.3, ColorThemeManager.BRAND_COLORS['primary']))
                
                # Spread out the covers slightly (parallax effect)
                spread_offsets = [(0, 6), (16, 2), (32, -2), (48, 2)]
                for i, cover in enumerate(reversed(card_content.data['cover_stack'])):
                    cover.left = spread_offsets[i][0]
                    cover.top = spread_offsets[i][1]
                    cover.update()
                
                # Brighten accent bar
                accent_bar.gradient = ft.LinearGradient(
                    colors=[
                        ColorThemeManager.BRAND_COLORS['secondary'],
                        ColorThemeManager.BRAND_COLORS['primary'],
                        ColorThemeManager.BRAND_COLORS['secondary']
                    ],
                    begin=ft.alignment.top_center,
                    end=ft.alignment.bottom_center
                )
                accent_bar.width = 8
                accent_bar.update()
            else:
                # Reset card effects
                card_content.shadow = ft.BoxShadow(
                    spread_radius=0,
                    blur_radius=12,
                    color=ft.Colors.with_opacity(0.1, ft.Colors.BLACK),
                    offset=ft.Offset(0, 4)
                )
                card_content.scale = 1.0
                card_content.border = ft.border.all(1, ft.Colors.with_opacity(0.1, ft.Colors.ON_SURFACE))
                
                # Reset cover positions
                reset_offsets = [(0, 8), (12, 4), (24, 0), (36, 4)]
                for i, cover in enumerate(reversed(card_content.data['cover_stack'])):
                    cover.left = reset_offsets[i][0]
                    cover.top = reset_offsets[i][1]
                    cover.update()
                
                # Reset accent bar
                accent_bar.gradient = ft.LinearGradient(
                    colors=[
                        ColorThemeManager.BRAND_COLORS['primary'],
                        ColorThemeManager.BRAND_COLORS['secondary'],
                        ColorThemeManager.BRAND_COLORS['primary_dark']
                    ],
                    begin=ft.alignment.top_center,
                    end=ft.alignment.bottom_center
                )
                accent_bar.width = ACCENT_BAR_WIDTH
                accent_bar.update()
            
            card_content.update()
        
        card_content.on_hover = on_hover
        
        return card_content

    def _create_collection_item_card(self, item, index, delete_callback, edit_callback, remove_callback):
        """Creates a horizontal 'showcase' style card for items within a collection."""
        from ui import get_entry_type_icon_name
        
        name = item.get('name', 'Unknown Title')
        db_image_value = item.get('image_url')
        image_src = config.DEFAULT_IMAGE_URL
        
        if db_image_value:
            if db_image_value.lower().startswith("http://") or db_image_value.lower().startswith("https://"):
                image_src = db_image_value
            else:
                full_local_path = os.path.join(config.ASSETS_DIR, db_image_value)
                if os.path.exists(full_local_path):
                    image_src = db_image_value
        
        entry_type_str = item.get('entry_type', 'Media')
        score = item.get('review_score')
        genres_str = item.get('genre', '')
        parsed_genres = utils.parse_genres(genres_str)[:3]  # Limit to 3 genres
        
        # Card dimensions
        CARD_HEIGHT = 140
        IMAGE_WIDTH = 100
        
        # Order number badge (floating on image)
        order_badge = ft.Container(
            content=ft.Text(f"#{index + 1}", size=11, weight=ft.FontWeight.BOLD, color=ft.Colors.WHITE),
            bgcolor=ft.Colors.with_opacity(0.85, ft.Colors.BLACK),
            padding=ft.padding.symmetric(horizontal=8, vertical=4),
            border_radius=12,
            left=6,
            top=6
        )
        
        # Image section with order badge overlay
        image_section = ft.Container(
            content=ft.Stack([
                ft.Container(
                    content=ft.Image(
                        src=image_src,
                        fit=ft.ImageFit.COVER,
                        width=IMAGE_WIDTH,
                        height=CARD_HEIGHT,
                        error_content=ft.Container(
                            width=IMAGE_WIDTH,
                            height=CARD_HEIGHT,
                            bgcolor=ft.Colors.with_opacity(0.1, ft.Colors.ON_SURFACE),
                            content=ft.Icon(ft.Icons.IMAGE_OUTLINED, size=32, color=ft.Colors.ON_SURFACE_VARIANT),
                            alignment=ft.alignment.center
                        )
                    ),
                    width=IMAGE_WIDTH,
                    height=CARD_HEIGHT,
                    clip_behavior=ft.ClipBehavior.ANTI_ALIAS,
                    border_radius=ft.border_radius.only(top_left=14, bottom_left=14)
                ),
                order_badge
            ]),
            width=IMAGE_WIDTH,
            height=CARD_HEIGHT
        )
        
        # Entry type badge (pill style)
        entry_type_gradient = ColorThemeManager.get_entry_type_gradient(entry_type_str)
        entry_type_badge = ft.Container(
            content=ft.Row([
                ft.Icon(get_entry_type_icon_name(entry_type_str), size=12, color=ft.Colors.WHITE),
                ft.Text(entry_type_str, size=10, color=ft.Colors.WHITE, weight=ft.FontWeight.W_600)
            ], spacing=4, tight=True),
            gradient=entry_type_gradient,
            padding=ft.padding.symmetric(horizontal=10, vertical=5),
            border_radius=14
        )
        
        # Score badge (if exists)
        score_badge = ft.Container()
        if score is not None:
            color_scheme = ColorThemeManager.get_rating_color_scheme(score)
            score_badge = ft.Container(
                content=ft.Row([
                    ft.Icon(ft.Icons.STAR_ROUNDED, size=12, color=color_scheme['primary']),
                    ft.Text(f"{score:.1f}", size=11, weight=ft.FontWeight.BOLD, color=color_scheme['primary'])
                ], spacing=3, tight=True),
                bgcolor=color_scheme['bg'],
                padding=ft.padding.symmetric(horizontal=8, vertical=4),
                border_radius=12,
                border=ft.border.all(1, ft.Colors.with_opacity(0.3, color_scheme['primary']))
            )
        
        # Genre tags (compact)
        genre_tags = ft.Row([
            ft.Container(
                content=ft.Text(genre, size=9, color=ft.Colors.ON_SURFACE_VARIANT),
                bgcolor=ft.Colors.with_opacity(0.08, ft.Colors.ON_SURFACE),
                padding=ft.padding.symmetric(horizontal=8, vertical=3),
                border_radius=10
            ) for genre in parsed_genres
        ], spacing=4, wrap=True) if parsed_genres else ft.Container()
        
        # Options menu
        options_button = ft.PopupMenuButton(
            icon=ft.Icons.MORE_VERT_ROUNDED,
            icon_color=ft.Colors.ON_SURFACE_VARIANT,
            icon_size=18,
            items=[
                ft.PopupMenuItem(text="Edit", icon=ft.Icons.EDIT_OUTLINED, on_click=lambda _, i=item: edit_callback(i)),
                ft.PopupMenuItem(text="Remove from Collection", icon=ft.Icons.REMOVE_CIRCLE_OUTLINE, on_click=lambda _, i=item: remove_callback(i['id'], i['name'])),
                ft.PopupMenuItem(),
                ft.PopupMenuItem(text="Delete Entry", icon=ft.Icons.DELETE_OUTLINE, on_click=lambda _, i=item: delete_callback(i['id'], i['name']))
            ],
            tooltip="Options"
        )
        
        # Content section
        content_section = ft.Container(
            content=ft.Column([
                ft.Row([
                    ft.Text(name, size=15, weight=ft.FontWeight.BOLD, max_lines=1, overflow=ft.TextOverflow.ELLIPSIS, expand=True),
                    options_button
                ], vertical_alignment=ft.CrossAxisAlignment.START),
                ft.Container(height=4),
                ft.Row([entry_type_badge, score_badge], spacing=8),
                ft.Container(height=6),
                genre_tags,
                ft.Container(expand=True)
            ], spacing=0, tight=True),
            expand=True,
            padding=ft.padding.only(left=14, right=8, top=12, bottom=12)
        )
        
        # Main card layout
        card_inner = ft.Row([
            image_section,
            content_section
        ], spacing=0, expand=True, vertical_alignment=ft.CrossAxisAlignment.START)
        
        # Card container
        card = ft.Container(
            content=card_inner,
            height=CARD_HEIGHT,
            border_radius=14,
            bgcolor=ft.Colors.SURFACE,
            border=ft.border.all(1, ft.Colors.with_opacity(0.1, ft.Colors.ON_SURFACE)),
            clip_behavior=ft.ClipBehavior.ANTI_ALIAS,
            shadow=ft.BoxShadow(
                spread_radius=0,
                blur_radius=8,
                color=ft.Colors.with_opacity(0.08, ft.Colors.BLACK),
                offset=ft.Offset(0, 2)
            ),
            animate=ft.Animation(duration=200, curve=ft.AnimationCurve.EASE_OUT),
            animate_scale=ft.Animation(duration=200, curve=ft.AnimationCurve.EASE_OUT)
        )
        
        def on_hover(e):
            if e.data == "true":
                card.shadow = ft.BoxShadow(
                    spread_radius=0,
                    blur_radius=16,
                    color=ft.Colors.with_opacity(0.15, ColorThemeManager.BRAND_COLORS['primary']),
                    offset=ft.Offset(0, 4)
                )
                card.scale = 1.01
                card.border = ft.border.all(1.5, ft.Colors.with_opacity(0.25, ColorThemeManager.BRAND_COLORS['primary']))
            else:
                card.shadow = ft.BoxShadow(
                    spread_radius=0,
                    blur_radius=8,
                    color=ft.Colors.with_opacity(0.08, ft.Colors.BLACK),
                    offset=ft.Offset(0, 2)
                )
                card.scale = 1.0
                card.border = ft.border.all(1, ft.Colors.with_opacity(0.1, ft.Colors.ON_SURFACE))
            card.update()
        
        card.on_hover = on_hover
        
        return card

    def _build_collection_detail_view(self):
        """Builds the UI that shows the items within a single collection using horizontal showcase cards."""
        collection_id = self.state["selected_collection_id"]
        collection_name = self.state["selected_collection_name"]
        items = database.get_collection_items_db(collection_id)

        def remove_item_from_this_collection(media_id, media_name):
            database.remove_item_from_collection_by_media_id_db(collection_id, media_id)
            self.app_ui.show_snackbar(f"Removed '{media_name}' from collection.", color=ft.Colors.GREEN_700)
            self.app_ui.refresh_current_view()

        def open_edit_dialog_wrapper(item_data):
            self.app_ui.open_edit_jav_dialog(item_data, self.app_ui.refresh_current_view)

        def delete_item_wrapper(media_id, media_name):
            self.app_ui.delete_jav_action_with_callback(media_id, media_name, self.app_ui.refresh_current_view)

        # Create horizontal showcase cards
        item_cards = [
            self._create_collection_item_card(
                item, 
                i,
                delete_item_wrapper,
                open_edit_dialog_wrapper, 
                remove_item_from_this_collection
            ) for i, item in enumerate(items)
        ]

        # Responsive row layout (2 columns on large screens)
        cards_grid = ft.ResponsiveRow(
            controls=[
                ft.Container(
                    content=card,
                    col={"sm": 12, "md": 6, "lg": 6, "xl": 4}
                ) for card in item_cards
            ],
            spacing=16,
            run_spacing=16
        ) if items else ft.Container()

        # Enhanced empty state for detail view
        if not items:
            cards_grid = ft.Container(
                content=ft.Column([
                    # Gradient icon container
                    ft.Container(
                        content=ft.Icon(ft.Icons.LIBRARY_ADD_OUTLINED, size=48, color=ft.Colors.WHITE),
                        gradient=ft.LinearGradient(
                            colors=[ColorThemeManager.BRAND_COLORS['primary'], ColorThemeManager.BRAND_COLORS['secondary']],
                            begin=ft.alignment.top_left,
                            end=ft.alignment.bottom_right
                        ),
                        width=88,
                        height=88,
                        border_radius=44,
                        alignment=ft.alignment.center,
                        shadow=ft.BoxShadow(
                            spread_radius=0,
                            blur_radius=16,
                            color=ft.Colors.with_opacity(0.25, ColorThemeManager.BRAND_COLORS['primary']),
                            offset=ft.Offset(0, 6)
                        )
                    ),
                    ft.Container(height=16),
                    ft.Text("This Collection is Empty", size=22, weight=ft.FontWeight.BOLD),
                    ft.Text("Add items to build your collection.", color=ft.Colors.ON_SURFACE_VARIANT),
                    ft.Container(height=20),
                    ft.Container(
                        content=ft.ElevatedButton(
                            "Add Items",
                            icon=ft.Icons.ADD_ROUNDED,
                            on_click=lambda _: self._open_add_items_dialog(),
                            style=ft.ButtonStyle(
                                bgcolor=ColorThemeManager.BRAND_COLORS['primary'],
                                color=ft.Colors.WHITE,
                                padding=ft.padding.symmetric(horizontal=24, vertical=14),
                                shape=ft.RoundedRectangleBorder(radius=10)
                            )
                        ),
                        shadow=ft.BoxShadow(
                            spread_radius=0,
                            blur_radius=10,
                            color=ft.Colors.with_opacity(0.2, ColorThemeManager.BRAND_COLORS['primary']),
                            offset=ft.Offset(0, 4)
                        ),
                        border_radius=10
                    )
                ], horizontal_alignment=ft.CrossAxisAlignment.CENTER, spacing=6),
                alignment=ft.alignment.center,
                expand=True
            )

        # Enhanced back button
        back_button = ft.Container(
            content=ft.IconButton(
                icon=ft.Icons.ARROW_BACK_ROUNDED, 
                on_click=lambda _: self._switch_to_list_view(), 
                tooltip="Back to Collections",
                icon_color=ft.Colors.ON_SURFACE
            ),
            bgcolor=ft.Colors.with_opacity(0.08, ft.Colors.ON_SURFACE),
            border_radius=12,
            width=44,
            height=44,
            alignment=ft.alignment.center
        )
        
        # Item count badge
        item_count_badge = ft.Container(
            content=ft.Row([
                ft.Icon(ft.Icons.PHOTO_LIBRARY_OUTLINED, size=14, color=ft.Colors.PRIMARY),
                ft.Text(f"{len(items)} items", size=13, weight=ft.FontWeight.W_600, color=ft.Colors.PRIMARY)
            ], spacing=6, tight=True),
            bgcolor=ft.Colors.with_opacity(0.1, ft.Colors.PRIMARY),
            padding=ft.padding.symmetric(horizontal=12, vertical=6),
            border_radius=14,
            border=ft.border.all(1, ft.Colors.with_opacity(0.2, ft.Colors.PRIMARY))
        )
        
        # Styled action buttons
        reorder_button = ft.OutlinedButton(
            "Reorder", 
            icon=ft.Icons.SWAP_VERT_ROUNDED, 
            on_click=lambda _: self._open_reorder_dialog(), 
            disabled=len(items) < 2,
            style=ft.ButtonStyle(
                padding=ft.padding.symmetric(horizontal=16, vertical=10),
                shape=ft.RoundedRectangleBorder(radius=10)
            )
        )
        
        add_items_button = ft.Container(
            content=ft.ElevatedButton(
                "Add Items", 
                icon=ft.Icons.ADD_ROUNDED, 
                on_click=lambda _: self._open_add_items_dialog(),
                style=ft.ButtonStyle(
                    bgcolor=ColorThemeManager.BRAND_COLORS['primary'],
                    color=ft.Colors.WHITE,
                    padding=ft.padding.symmetric(horizontal=16, vertical=10),
                    shape=ft.RoundedRectangleBorder(radius=10)
                )
            ),
            shadow=ft.BoxShadow(
                spread_radius=0,
                blur_radius=6,
                color=ft.Colors.with_opacity(0.15, ColorThemeManager.BRAND_COLORS['primary']),
                offset=ft.Offset(0, 2)
            ),
            border_radius=10
        )
        
        header_row = ft.Row([
            back_button,
            ft.Container(width=12),
            ft.Text(collection_name, size=24, weight=ft.FontWeight.BOLD),
            ft.Container(width=12),
            item_count_badge,
            ft.Container(expand=True),
            reorder_button,
            ft.Container(width=8),
            add_items_button
        ], alignment=ft.MainAxisAlignment.START, vertical_alignment=ft.CrossAxisAlignment.CENTER)

        # Gradient divider
        divider = ft.Container(
            height=2,
            gradient=ft.LinearGradient(
                colors=[
                    ft.Colors.with_opacity(0, ft.Colors.PRIMARY),
                    ft.Colors.with_opacity(0.3, ft.Colors.PRIMARY),
                    ft.Colors.with_opacity(0, ft.Colors.PRIMARY)
                ],
                begin=ft.alignment.center_left,
                end=ft.alignment.center_right
            ),
            margin=ft.margin.symmetric(vertical=16)
        )

        return ft.Container(
            content=ft.Column(
                controls=[header_row, divider, cards_grid],
                scroll=ft.ScrollMode.ADAPTIVE,
            ),
            padding=ft.padding.all(24),
            expand=True
        )
        
    def _open_create_edit_collection_dialog(self, collection=None):
        """Builds the content for a create/edit dialog and asks AppUI to show it."""
        is_edit = collection is not None
        title = "Edit Collection" if is_edit else "Create New Collection"
        
        name_value = collection['name'] if is_edit else ""
        desc_value = collection.get('description', '') if is_edit else ""

        name_field = ft.TextField(label="Collection Name", value=name_value, autofocus=True)
        desc_field = ft.TextField(label="Description (Optional)", value=desc_value or "")

        def save_logic() -> bool:
            name = name_field.value.strip()
            if not name:
                self.app_ui.show_snackbar("Collection name cannot be empty.", color=ft.Colors.ERROR)
                return False

            description = desc_field.value.strip()
            
            try:
                if is_edit:
                    database.update_collection_db(collection['id'], name, description)
                    self.app_ui.show_snackbar(f"Collection '{name}' updated.", color=ft.Colors.GREEN_700)
                else:
                    database.create_collection_db(name, description)
                    self.app_ui.show_snackbar(f"Collection '{name}' created.", color=ft.Colors.GREEN_700)
                
                self.app_ui.refresh_current_view()
                return True
            except Exception as e:
                self.app_ui.show_snackbar(f"Error: {e}", color=ft.Colors.ERROR)
                return False

        self.app_ui.show_form_dialog(
            title=title,
            content_controls=[name_field, desc_field],
            on_save_callback=save_logic
        )

    # --- ENHANCED SELECTION CARD ---
    def _build_media_selection_card(self, media_item, checkbox_ref, is_disabled=False):
        """Creates an enhanced visual card for selecting media."""
        
        # This checkbox is invisible but holds the selection state
        checkbox = ft.Checkbox(ref=checkbox_ref, visible=False, value=False, data=media_item['id'])

        # Enhanced selected state with gradient overlay
        selected_overlay = ft.Container(
            gradient=ft.LinearGradient(
                colors=[
                    ft.Colors.with_opacity(0.7, ColorThemeManager.BRAND_COLORS['primary']),
                    ft.Colors.with_opacity(0.5, ColorThemeManager.BRAND_COLORS['secondary'])
                ],
                begin=ft.alignment.top_left,
                end=ft.alignment.bottom_right
            ),
            border_radius=14,
            content=ft.Column([
                ft.Container(
                    content=ft.Icon(ft.Icons.CHECK_CIRCLE_ROUNDED, color=ft.Colors.WHITE, size=36),
                    bgcolor=ft.Colors.with_opacity(0.3, ft.Colors.WHITE),
                    border_radius=30,
                    padding=8
                ),
                ft.Text("Selected", color=ft.Colors.WHITE, size=11, weight=ft.FontWeight.W_600)
            ], horizontal_alignment=ft.CrossAxisAlignment.CENTER, alignment=ft.MainAxisAlignment.CENTER, spacing=6),
            alignment=ft.alignment.center,
            visible=checkbox.value
        )

        # Enhanced disabled state (already in collection)
        disabled_overlay = ft.Container(
            bgcolor=ft.Colors.with_opacity(0.8, ft.Colors.BLACK),
            border_radius=14,
            content=ft.Column([
                ft.Container(
                    content=ft.Icon(ft.Icons.CHECK_ROUNDED, color=ft.Colors.GREEN_400, size=20),
                    bgcolor=ft.Colors.with_opacity(0.2, ft.Colors.GREEN_400),
                    border_radius=20,
                    padding=8
                ),
                ft.Text("In Collection", color=ft.Colors.WHITE70, size=10, weight=ft.FontWeight.W_500)
            ], horizontal_alignment=ft.CrossAxisAlignment.CENTER, alignment=ft.MainAxisAlignment.CENTER, spacing=4),
            alignment=ft.alignment.center,
            visible=is_disabled
        )

        def toggle_selection(e):
            if not is_disabled:
                checkbox.value = not checkbox.value
                selected_overlay.visible = checkbox.value
                if checkbox.value:
                    e.control.border = ft.border.all(3, ColorThemeManager.BRAND_COLORS['primary'])
                    e.control.shadow = ft.BoxShadow(
                        spread_radius=0,
                        blur_radius=12,
                        color=ft.Colors.with_opacity(0.3, ColorThemeManager.BRAND_COLORS['primary']),
                        offset=ft.Offset(0, 4)
                    )
                else:
                    e.control.border = ft.border.all(1, ft.Colors.with_opacity(0.15, ft.Colors.ON_SURFACE))
                    e.control.shadow = ft.BoxShadow(
                        spread_radius=0,
                        blur_radius=4,
                        color=ft.Colors.with_opacity(0.05, ft.Colors.BLACK),
                        offset=ft.Offset(0, 2)
                    )
                e.control.update()
                selected_overlay.update()

        card_content = ft.Stack([
            ft.Column([
                ft.Container(
                    content=ft.Image(
                        src=media_item.get('image_url', ''),
                        error_content=ft.Container(
                            content=ft.Icon(ft.Icons.IMAGE_OUTLINED, color=ft.Colors.ON_SURFACE_VARIANT, size=28),
                            alignment=ft.alignment.center,
                            bgcolor=ft.Colors.with_opacity(0.05, ft.Colors.ON_SURFACE)
                        ),
                        height=100,
                        fit=ft.ImageFit.COVER
                    ),
                    clip_behavior=ft.ClipBehavior.ANTI_ALIAS,
                    border_radius=ft.border_radius.only(top_left=14, top_right=14)
                ),
                ft.Container(
                    content=ft.Text(
                        media_item['name'], 
                        max_lines=2, 
                        overflow=ft.TextOverflow.ELLIPSIS, 
                        size=12,
                        weight=ft.FontWeight.W_500
                    ),
                    padding=ft.padding.symmetric(horizontal=10, vertical=8)
                )
            ], spacing=0),
            selected_overlay,
            disabled_overlay
        ])

        return ft.Container(
            content=card_content,
            width=160,
            height=150,
            border_radius=14,
            border=ft.border.all(1, ft.Colors.with_opacity(0.15, ft.Colors.ON_SURFACE)),
            bgcolor=ft.Colors.SURFACE,
            clip_behavior=ft.ClipBehavior.ANTI_ALIAS,
            on_click=toggle_selection,
            data=media_item['name'].lower(),
            shadow=ft.BoxShadow(
                spread_radius=0,
                blur_radius=4,
                color=ft.Colors.with_opacity(0.05, ft.Colors.BLACK),
                offset=ft.Offset(0, 2)
            )
        )

    # --- REBUILT DIALOG USING THE NEW CARD ---
    def _open_add_items_dialog(self):
        """Opens a dialog with a visual grid to add media items to the current collection."""
        collection_id = self.state["selected_collection_id"]
        all_media = database.get_all_javs_db()
        existing_media_ids = {item['id'] for item in database.get_collection_items_db(collection_id)}
        
        dialog_ref = ft.Ref[ft.AlertDialog]()
        search_field = ft.Ref[ft.TextField]()
        items_grid = ft.Ref[ft.Row]()

        # Store references to checkboxes and their parent containers for filtering/saving
        checkbox_refs = []
        card_containers = []

        for media in all_media:
            is_disabled = media['id'] in existing_media_ids
            cb_ref = ft.Ref[ft.Checkbox]()
            checkbox_refs.append(cb_ref)
            
            card = self._build_media_selection_card(media, cb_ref, is_disabled)
            card_containers.append(card)

        def close_dialog(e=None):
            dialog = dialog_ref.current
            if dialog:
                dialog.open = False
                self.page.update()  # Update first to hide dialog
                if dialog in self.page.overlay:
                    self.page.overlay.remove(dialog)
                    self.page.update()  # Update again after removal

        def filter_items(e):
            search_term = e.control.value.lower()
            if items_grid.current:
                for card in items_grid.current.controls:
                    card.visible = search_term in card.data
                items_grid.current.update()

        def save_selection(e):
            selected_ids = [
                ref.current.data for ref in checkbox_refs 
                if ref.current and ref.current.value
            ]
            if selected_ids:
                database.add_items_to_collection_db(collection_id, selected_ids)
                # Close dialog first completely
                dialog = dialog_ref.current
                if dialog:
                    dialog.open = False
                    self.page.update()
                    if dialog in self.page.overlay:
                        self.page.overlay.remove(dialog)
                # Then refresh the view
                self.app_ui.refresh_current_view()
                self.app_ui.show_snackbar(f"Added {len(selected_ids)} items.", color=ft.Colors.GREEN_700)
            else:
                close_dialog()

        dialog = ft.AlertDialog(
            ref=dialog_ref,
            modal=True,
            title=ft.Row([
                ft.Container(
                    content=ft.Icon(ft.Icons.ADD_CIRCLE_OUTLINE_ROUNDED, size=18, color=ft.Colors.WHITE),
                    gradient=ft.LinearGradient(
                        colors=[ColorThemeManager.BRAND_COLORS['primary'], ColorThemeManager.BRAND_COLORS['primary_dark']],
                        begin=ft.alignment.top_left,
                        end=ft.alignment.bottom_right
                    ),
                    width=32,
                    height=32,
                    border_radius=8,
                    alignment=ft.alignment.center
                ),
                ft.Container(width=12),
                ft.Column([
                    ft.Text("Add Items", size=18, weight=ft.FontWeight.BOLD),
                    ft.Text(f"to {self.state['selected_collection_name']}", size=12, color=ft.Colors.ON_SURFACE_VARIANT)
                ], spacing=0)
            ], spacing=0),
            content=ft.Column([
                ft.TextField(
                    ref=search_field, 
                    label="Search media...", 
                    on_change=filter_items, 
                    prefix_icon=ft.Icons.SEARCH_ROUNDED,
                    border_radius=10,
                    content_padding=ft.padding.symmetric(horizontal=16, vertical=12)
                ),
                ft.Container(height=8),
                ft.Container(
                    content=ft.Row(ref=items_grid, controls=card_containers, wrap=True, scroll=ft.ScrollMode.ADAPTIVE, spacing=12, run_spacing=12),
                    height=400,
                    width=820,
                    border=ft.border.all(1, ft.Colors.with_opacity(0.1, ft.Colors.ON_SURFACE)),
                    border_radius=12,
                    padding=12
                )
            ], tight=True, spacing=8),
            actions=[
                ft.TextButton("Cancel", on_click=close_dialog),
                ft.Container(
                    content=ft.ElevatedButton(
                        "Add Selected", 
                        on_click=save_selection,
                        style=ft.ButtonStyle(
                            bgcolor=ColorThemeManager.BRAND_COLORS['primary'],
                            color=ft.Colors.WHITE,
                            padding=ft.padding.symmetric(horizontal=20, vertical=10),
                            shape=ft.RoundedRectangleBorder(radius=8)
                        )
                    ),
                    shadow=ft.BoxShadow(
                        spread_radius=0,
                        blur_radius=6,
                        color=ft.Colors.with_opacity(0.15, ColorThemeManager.BRAND_COLORS['primary']),
                        offset=ft.Offset(0, 2)
                    ),
                    border_radius=8
                )
            ]
        )
        self.page.overlay.append(dialog)
        dialog.open = True
        self.page.update()
        
    def _open_reorder_dialog(self):
        """Opens a dialog with a ReorderableListView to change item order."""
        collection_id = self.state["selected_collection_id"]
        items = database.get_collection_items_db(collection_id)
        
        dialog_ref = ft.Ref[ft.AlertDialog]()

        def close_dialog(e=None):
            dialog = dialog_ref.current
            if dialog:
                dialog.open = False
                self.page.update()  # Update first to hide dialog
                if dialog in self.page.overlay:
                    self.page.overlay.remove(dialog)
                    self.page.update()  # Update again after removal

        def handle_reorder(e):
            item_to_move = items.pop(e.old_index)
            items.insert(e.new_index, item_to_move)

        def save_new_order(e):
            ordered_media_ids = [item['id'] for item in items]
            database.update_collection_item_order_db(collection_id, ordered_media_ids)
            # Close dialog first completely
            dialog = dialog_ref.current
            if dialog:
                dialog.open = False
                self.page.update()
                if dialog in self.page.overlay:
                    self.page.overlay.remove(dialog)
            # Then refresh the view
            self.app_ui.refresh_current_view()
            self.app_ui.show_snackbar("Item order saved.", color=ft.Colors.GREEN_700)
        
        # Enhanced reorder list with thumbnails
        def create_reorder_item(item):
            img_url = item.get('image_url', '')
            return ft.Container(
                key=str(item['id']),
                content=ft.Row([
                    ft.Container(
                        content=ft.Icon(ft.Icons.DRAG_HANDLE_ROUNDED, color=ft.Colors.ON_SURFACE_VARIANT, size=20),
                        padding=ft.padding.only(right=12)
                    ),
                    ft.Container(
                        content=ft.Image(
                            src=img_url,
                            fit=ft.ImageFit.COVER,
                            error_content=ft.Container(
                                content=ft.Icon(ft.Icons.IMAGE_OUTLINED, size=16, color=ft.Colors.ON_SURFACE_VARIANT),
                                alignment=ft.alignment.center,
                                bgcolor=ft.Colors.with_opacity(0.05, ft.Colors.ON_SURFACE)
                            )
                        ) if img_url else ft.Container(
                            content=ft.Icon(ft.Icons.IMAGE_OUTLINED, size=16, color=ft.Colors.ON_SURFACE_VARIANT),
                            alignment=ft.alignment.center,
                            bgcolor=ft.Colors.with_opacity(0.05, ft.Colors.ON_SURFACE)
                        ),
                        width=40,
                        height=40,
                        border_radius=8,
                        clip_behavior=ft.ClipBehavior.ANTI_ALIAS
                    ),
                    ft.Container(width=12),
                    ft.Text(item['name'], size=14, weight=ft.FontWeight.W_500, max_lines=1, overflow=ft.TextOverflow.ELLIPSIS, expand=True)
                ], vertical_alignment=ft.CrossAxisAlignment.CENTER),
                padding=ft.padding.symmetric(horizontal=12, vertical=10),
                border_radius=10,
                bgcolor=ft.Colors.SURFACE,
                border=ft.border.all(1, ft.Colors.with_opacity(0.1, ft.Colors.ON_SURFACE)),
                margin=ft.margin.only(bottom=8)
            )
        
        reorder_list = ft.ReorderableListView(
            on_reorder=handle_reorder,
            controls=[create_reorder_item(item) for item in items]
        )

        dialog = ft.AlertDialog(
            ref=dialog_ref,
            modal=True,
            title=ft.Row([
                ft.Container(
                    content=ft.Icon(ft.Icons.SWAP_VERT_ROUNDED, size=18, color=ft.Colors.WHITE),
                    gradient=ft.LinearGradient(
                        colors=[ColorThemeManager.BRAND_COLORS['primary'], ColorThemeManager.BRAND_COLORS['primary_dark']],
                        begin=ft.alignment.top_left,
                        end=ft.alignment.bottom_right
                    ),
                    width=32,
                    height=32,
                    border_radius=8,
                    alignment=ft.alignment.center
                ),
                ft.Container(width=12),
                ft.Text("Reorder Items", size=18, weight=ft.FontWeight.BOLD)
            ], spacing=0),
            content=ft.Container(
                content=reorder_list, 
                height=400, 
                width=450,
                padding=ft.padding.only(top=8)
            ),
            actions=[
                ft.TextButton("Cancel", on_click=close_dialog),
                ft.Container(
                    content=ft.ElevatedButton(
                        "Save Order", 
                        on_click=save_new_order,
                        style=ft.ButtonStyle(
                            bgcolor=ColorThemeManager.BRAND_COLORS['primary'],
                            color=ft.Colors.WHITE,
                            padding=ft.padding.symmetric(horizontal=20, vertical=10),
                            shape=ft.RoundedRectangleBorder(radius=8)
                        )
                    ),
                    shadow=ft.BoxShadow(
                        spread_radius=0,
                        blur_radius=6,
                        color=ft.Colors.with_opacity(0.15, ColorThemeManager.BRAND_COLORS['primary']),
                        offset=ft.Offset(0, 2)
                    ),
                    border_radius=8
                )
            ]
        )
        self.page.overlay.append(dialog)
        dialog.open = True
        self.page.update()