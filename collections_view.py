# --- START OF FILE collections_view.py ---

import flet as ft
from datetime import datetime

import database
from ui_enhanced import EnhancedComponentFactory, AnimationHelpers

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

        if not collections:
            return ft.Container(
                content=ft.Column([
                    ft.Icon(ft.icons.COLLECTIONS_BOOKMARK_OUTLINED, size=64, color=ft.colors.ON_SURFACE_VARIANT),
                    ft.Text("No Collections Yet", style=ft.TextThemeStyle.HEADLINE_SMALL),
                    ft.Text("Create your first collection to group your favorite media.", color=ft.colors.ON_SURFACE_VARIANT),
                    ft.Container(height=20),
                    ft.ElevatedButton("Create First Collection", icon=ft.icons.ADD, on_click=lambda _: self._open_create_edit_collection_dialog())
                ], horizontal_alignment=ft.CrossAxisAlignment.CENTER, spacing=10),
                alignment=ft.alignment.center,
                expand=True
            )

        collection_cards = []
        for collection in collections:
            collection_cards.append(self._create_collection_card(collection))

        return ft.Container(
            content=ft.Column(
                scroll=ft.ScrollMode.ADAPTIVE,
                controls=[
                    ft.Row([
                        ft.Text("Your Collections", style=ft.TextThemeStyle.HEADLINE_MEDIUM, weight=ft.FontWeight.BOLD),
                        ft.Container(expand=True),
                        ft.ElevatedButton("New Collection", icon=ft.icons.ADD, on_click=lambda _: self._open_create_edit_collection_dialog())
                    ], alignment=ft.MainAxisAlignment.SPACE_BETWEEN),
                    ft.Divider(height=20),
                    ft.Column(controls=collection_cards, spacing=15)
                ],
                spacing=10
            ),
            padding=ft.padding.all(24),
            expand=True
        )

    def _create_collection_card(self, collection):
        """Creates a UI card for a single collection."""
        def on_delete_confirm(e):
            database.delete_collection_db(collection['id'])
            self.app_ui.show_snackbar(f"Collection '{collection['name']}' deleted.", color=ft.colors.GREEN_700)
            self.app_ui.refresh_current_view()
        
        def confirm_delete(e):
            self.app_ui.show_confirmation_dialog(
                title="Delete Collection?",
                content=f"Are you sure you want to permanently delete the collection '{collection['name']}'? This cannot be undone.",
                on_confirm=on_delete_confirm
            )
            
        return ft.Card(
            content=ft.Container(
                content=ft.ListTile(
                    leading=ft.Icon(ft.icons.COLLECTIONS_BOOKMARK, color=ft.colors.PRIMARY),
                    title=ft.Text(collection['name'], weight=ft.FontWeight.BOLD),
                    subtitle=ft.Text(f"{collection['item_count']} items | {collection.get('description') or 'No description'}"),
                    on_click=lambda _: self._switch_to_detail_view(collection['id'], collection['name']),
                    trailing=ft.PopupMenuButton(items=[
                        ft.PopupMenuItem(text="Edit", icon=ft.icons.EDIT, on_click=lambda _, c=collection: self._open_create_edit_collection_dialog(c)),
                        ft.PopupMenuItem(),
                        ft.PopupMenuItem(text="Delete", icon=ft.icons.DELETE_FOREVER, on_click=confirm_delete)
                    ])
                ),
                padding=ft.padding.symmetric(vertical=8)
            )
        )

    def _build_collection_detail_view(self):
        """Builds the UI that shows the items within a single collection."""
        from ui import create_gallery_card # Local import to avoid circular dependency issues at startup
        collection_id = self.state["selected_collection_id"]
        collection_name = self.state["selected_collection_name"]
        items = database.get_collection_items_db(collection_id)

        def remove_item_from_this_collection(media_id, media_name):
            database.remove_item_from_collection_by_media_id_db(collection_id, media_id)
            self.app_ui.show_snackbar(f"Removed '{media_name}' from collection.", color=ft.colors.GREEN_700)
            self.app_ui.refresh_current_view()

        def open_edit_dialog_wrapper(item_data):
            self.app_ui.open_edit_jav_dialog(item_data, self.app_ui.refresh_current_view)

        item_cards = [
            create_gallery_card(
                self.page, 
                item, 
                lambda mid, mname: self.app_ui.delete_jav_action_with_callback(mid, mname, self.app_ui.refresh_current_view),
                open_edit_dialog_wrapper, 
                self.app_ui.show_description_dialog,
                remove_from_collection_callback=remove_item_from_this_collection
            ) for item in items
        ]

        grid_view = ft.GridView(
            controls=item_cards,
            expand=True,
            runs_count=5,
            max_extent=270,
            child_aspect_ratio=0.55,
            spacing=10,
            run_spacing=10,
            padding=10
        )

        if not items:
            grid_view = ft.Container(
                content=ft.Column([
                    ft.Icon(ft.icons.LIBRARY_ADD_CHECK_OUTLINED, size=64, color=ft.colors.ON_SURFACE_VARIANT),
                    ft.Text("This Collection is Empty", style=ft.TextThemeStyle.HEADLINE_SMALL),
                    ft.Text("Click 'Add Items' to build your collection.", color=ft.colors.ON_SURFACE_VARIANT),
                ], horizontal_alignment=ft.CrossAxisAlignment.CENTER, spacing=10),
                alignment=ft.alignment.center,
                expand=True
            )

        return ft.Container(
            content=ft.Column(
                controls=[
                    ft.Row([
                        ft.IconButton(icon=ft.icons.ARROW_BACK, on_click=lambda _: self._switch_to_list_view(), tooltip="Back to Collections"),
                        ft.Text(collection_name, style=ft.TextThemeStyle.HEADLINE_MEDIUM, weight=ft.FontWeight.BOLD),
                        ft.Container(expand=True),
                        ft.OutlinedButton("Reorder Items", icon=ft.icons.SWAP_VERT, on_click=lambda _: self._open_reorder_dialog(), disabled=len(items) < 2),
                        ft.ElevatedButton("Add Items", icon=ft.icons.ADD, on_click=lambda _: self._open_add_items_dialog())
                    ], alignment=ft.MainAxisAlignment.SPACE_BETWEEN),
                    ft.Divider(height=20),
                    grid_view
                ],
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
                self.app_ui.show_snackbar("Collection name cannot be empty.", color=ft.colors.ERROR)
                return False

            description = desc_field.value.strip()
            
            try:
                if is_edit:
                    database.update_collection_db(collection['id'], name, description)
                    self.app_ui.show_snackbar(f"Collection '{name}' updated.", color=ft.colors.GREEN_700)
                else:
                    database.create_collection_db(name, description)
                    self.app_ui.show_snackbar(f"Collection '{name}' created.", color=ft.colors.GREEN_700)
                
                self.app_ui.refresh_current_view()
                return True
            except Exception as e:
                self.app_ui.show_snackbar(f"Error: {e}", color=ft.colors.ERROR)
                return False

        self.app_ui.show_form_dialog(
            title=title,
            content_controls=[name_field, desc_field],
            on_save_callback=save_logic
        )

    # --- NEW HELPER METHOD FOR THE SELECTION CARD ---
    def _build_media_selection_card(self, media_item, checkbox_ref, is_disabled=False):
        """Creates a visual card for selecting media, similar to the awards picker."""
        
        # This checkbox is invisible but holds the selection state
        checkbox = ft.Checkbox(ref=checkbox_ref, visible=False, value=False, data=media_item['id'])

        # Visuals for selected state
        selected_overlay = ft.Container(
            bgcolor=ft.colors.with_opacity(0.6, ft.colors.PRIMARY),
            border_radius=12,
            content=ft.Icon(ft.icons.CHECK_CIRCLE, color=ft.colors.WHITE, size=32),
            alignment=ft.alignment.center,
            visible=checkbox.value # Bind visibility to checkbox state
        )

        # Visuals for disabled state (already in collection)
        disabled_overlay = ft.Container(
            bgcolor=ft.colors.with_opacity(0.7, ft.colors.BLACK),
            border_radius=12,
            content=ft.Column([
                ft.Icon(ft.icons.LIBRARY_ADD_CHECK, color=ft.colors.WHITE70, size=24),
                ft.Text("Already in Collection", color=ft.colors.WHITE70, size=10, text_align=ft.TextAlign.CENTER)
            ], horizontal_alignment=ft.CrossAxisAlignment.CENTER, alignment=ft.MainAxisAlignment.CENTER),
            alignment=ft.alignment.center,
            visible=is_disabled
        )

        def toggle_selection(e):
            if not is_disabled:
                checkbox.value = not checkbox.value
                selected_overlay.visible = checkbox.value
                e.control.border = ft.border.all(3, ft.colors.PRIMARY) if checkbox.value else ft.border.all(1, ft.colors.OUTLINE_VARIANT)
                e.control.update()
                selected_overlay.update()

        card_content = ft.Stack([
            ft.Column([
                ft.Image(
                    src=media_item.get('image_url', ''),
                    error_content=ft.Container(content=ft.Icon(ft.icons.BROKEN_IMAGE), alignment=ft.alignment.center),
                    height=100,
                    fit=ft.ImageFit.COVER
                ),
                ft.Container(
                    ft.Text(media_item['name'], max_lines=2, overflow=ft.TextOverflow.ELLIPSIS, size=12),
                    padding=8
                )
            ]),
            selected_overlay,
            disabled_overlay
        ])

        return ft.Container(
            content=card_content,
            width=180,
            height=160,
            border_radius=12,
            border=ft.border.all(1, ft.colors.OUTLINE_VARIANT),
            clip_behavior=ft.ClipBehavior.HARD_EDGE,
            on_click=toggle_selection,
            data=media_item['name'].lower() # For searching
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
                if dialog in self.page.overlay: self.page.overlay.remove(dialog)
                self.page.update()

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
                self.app_ui.show_snackbar(f"Added {len(selected_ids)} items.", color=ft.colors.GREEN_700)
                self.app_ui.refresh_current_view()
            
            close_dialog()

        dialog = ft.AlertDialog(
            ref=dialog_ref,
            modal=True,
            title=ft.Text(f"Add Items to '{self.state['selected_collection_name']}'"),
            content=ft.Column([
                ft.TextField(ref=search_field, label="Search...", on_change=filter_items, prefix_icon=ft.icons.SEARCH),
                ft.Container(
                    content=ft.Row(ref=items_grid, controls=card_containers, wrap=True, scroll=ft.ScrollMode.ADAPTIVE),
                    height=400,
                    width=800,
                )
            ], tight=True),
            actions=[
                ft.TextButton("Cancel", on_click=close_dialog),
                ft.ElevatedButton("Add Selected", on_click=save_selection)
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
                if dialog in self.page.overlay: self.page.overlay.remove(dialog)
                self.page.update()

        def handle_reorder(e):
            item_to_move = items.pop(e.old_index)
            items.insert(e.new_index, item_to_move)

        def save_new_order(e):
            ordered_media_ids = [item['id'] for item in items]
            database.update_collection_item_order_db(collection_id, ordered_media_ids)
            self.app_ui.show_snackbar("Item order saved.", color=ft.colors.GREEN_700)
            close_dialog()
            self.app_ui.refresh_current_view()
        
        reorder_list = ft.ReorderableListView(
            on_reorder=handle_reorder,
            controls=[
                ft.ListTile(
                    key=str(item['id']),
                    title=ft.Text(item['name']),
                    leading=ft.Icon(ft.icons.DRAG_HANDLE)
                ) for item in items
            ]
        )

        dialog = ft.AlertDialog(
            ref=dialog_ref,
            modal=True,
            title=ft.Text("Reorder Items"),
            content=ft.Container(content=reorder_list, height=400, width=400),
            actions=[
                ft.TextButton("Cancel", on_click=close_dialog),
                ft.ElevatedButton("Save Order", on_click=save_new_order)
            ]
        )
        self.page.overlay.append(dialog)
        dialog.open = True
        self.page.update()