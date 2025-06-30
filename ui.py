import flet as ft
import csv
from datetime import datetime
import os
import traceback
import shutil
import uuid
import asyncio

# Import our new, separated modules
import config
import database
import utils

# --- UI Helper Functions (These are general and don't need to be in the class) ---

def create_rating_badge(score):
    score_text = "N/A"
    bgcolor = ft.colors.with_opacity(0.5, ft.colors.ON_SURFACE_VARIANT)
    text_color = ft.colors.WHITE
    if score is not None:
        try:
            score_val = int(score)
            score_text = str(score_val)
            if 0 <= score_val <= 10:
                if score_val == 10:
                    bgcolor = ft.colors.LIGHT_GREEN_ACCENT_400
                    text_color = ft.colors.BLACK
                elif score_val >= 7:
                    bgcolor = ft.colors.GREEN_600
                    text_color = ft.colors.WHITE
                elif score_val >= 5:
                    bgcolor = ft.colors.YELLOW_700
                    text_color = ft.colors.BLACK
                elif score_val >= 2:
                    bgcolor = ft.colors.RED_700
                    text_color = ft.colors.WHITE
                else:
                    bgcolor = ft.colors.RED_500
                    text_color = ft.colors.WHITE
        except (ValueError, TypeError):
            pass
    return ft.Container(
        content=ft.Text(score_text, size=12, weight=ft.FontWeight.BOLD, color=text_color, text_align=ft.TextAlign.CENTER),
        width=30, height=30, shape=ft.BoxShape.CIRCLE, bgcolor=bgcolor, alignment=ft.alignment.center,
        tooltip=f"Score: {score_text}" if score is not None else "Score: Not Rated"
    )

def get_entry_type_icon_name(entry_type_str: str) -> str:
    entry_type_str_lower = (entry_type_str or "media").lower()
    if "movie" in entry_type_str_lower: return ft.icons.MOVIE_OUTLINED
    if "show" in entry_type_str_lower: return ft.icons.TV_OUTLINED
    if "anime" in entry_type_str_lower: return ft.icons.ANIMATION_OUTLINED
    if "book" in entry_type_str_lower: return ft.icons.BOOK_OUTLINED
    if "k-drama" in entry_type_str_lower: return ft.icons.LIVE_TV_OUTLINED
    if "jav" in entry_type_str_lower: return ft.icons.VIDEO_CAMERA_BACK_OUTLINED
    if "hentai" in entry_type_str_lower: return ft.icons.FILTER_FRAMES_OUTLINED
    if "game" in entry_type_str_lower: return ft.icons.SPORTS_ESPORTS_OUTLINED
    if "adult visual novel" in entry_type_str_lower: return ft.icons.MENU_BOOK_OUTLINED
    return ft.icons.LABEL_OUTLINED

def get_genre_icon_name(genre_str: str) -> str:
    genre_str_lower = (genre_str or "").lower()
    if "action" in genre_str_lower: return ft.icons.BOLT_OUTLINED
    if "drama" in genre_str_lower: return ft.icons.THEATER_COMEDY_OUTLINED
    if "sci-fi" in genre_str_lower or "science fiction" in genre_str_lower : return ft.icons.ROCKET_LAUNCH_OUTLINED
    if "war" in genre_str_lower: return ft.icons.SHIELD_OUTLINED
    if "mystery" in genre_str_lower: return ft.icons.QUESTION_MARK_OUTLINED
    if "thriller" in genre_str_lower: return ft.icons.FLASHLIGHT_ON_OUTLINED
    if "horror" in genre_str_lower: return ft.icons.SICK_OUTLINED
    if "comedy" in genre_str_lower: return ft.icons.SENTIMENT_VERY_SATISFIED_OUTLINED
    if "romance" in genre_str_lower: return ft.icons.FAVORITE_BORDER_OUTLINED
    if "fantasy" in genre_str_lower: return ft.icons.AUTO_FIX_HIGH_OUTLINED
    if "adventure" in genre_str_lower: return ft.icons.EXPLORE_OUTLINED
    if "slice of life" in genre_str_lower: return ft.icons.CAKE_OUTLINED
    if "supernatural" in genre_str_lower: return ft.icons.AUTO_STORIES_OUTLINED
    if "sports" in genre_str_lower: return ft.icons.SPORTS_VOLLEYBALL_OUTLINED
    if "music" in genre_str_lower: return ft.icons.MUSIC_NOTE_OUTLINED
    if "historical" in genre_str_lower: return ft.icons.ACCOUNT_BALANCE_OUTLINED
    if "school" in genre_str_lower: return ft.icons.SCHOOL_OUTLINED
    return ft.icons.LOCAL_OFFER_OUTLINED

def create_gallery_card(page, jav_item, delete_callback, edit_callback, show_desc_callback):
    name = jav_item.get('name', 'Unknown Title')
    db_image_value = jav_item.get('image_url')
    image_src_for_flet = config.DEFAULT_IMAGE_URL

    if db_image_value:
        if db_image_value.lower().startswith("http://") or db_image_value.lower().startswith("https://"):
            image_src_for_flet = db_image_value
        else:
            full_local_path_check = os.path.join(config.ASSETS_DIR, db_image_value)
            if os.path.exists(full_local_path_check):
                image_src_for_flet = db_image_value

    entry_type_str = jav_item.get('entry_type', 'Media')
    genres_str = jav_item.get('genre', '')

    completion_date_str_db = jav_item.get('completion_date', 'N/A')
    display_completion_date = 'N/A'

    if completion_date_str_db and completion_date_str_db != 'N/A':
        try:
            date_obj = datetime.strptime(completion_date_str_db, '%Y-%m-%d')
            day = date_obj.day
            if 4 <= day <= 20 or 24 <= day <= 30:
                suffix = "th"
            else:
                suffix = ["st", "nd", "rd"][day % 10 - 1]

            if os.name == 'nt':
                day_format_char = '#'
            else:
                day_format_char = '-'
            display_completion_date = date_obj.strftime(f'%{day_format_char}d{suffix} %B %Y')

        except ValueError:
            display_completion_date = completion_date_str_db
            print(f"Warning: Could not parse date '{completion_date_str_db}' for display in gallery card for '{name}'.")

    score = jav_item.get('review_score')
    description_value = jav_item.get('description')
    has_description = bool(description_value and description_value.strip())

    is_rewatch = jav_item.get('is_rewatch') == 1
    owns_local_copy = jav_item.get('own_local_copy') == 1

    parsed_genres = utils.parse_genres(genres_str)

    CARD_RADIUS = 16
    IMAGE_HEIGHT = 160
    CONTENT_PADDING = ft.padding.symmetric(horizontal=20, vertical=16)
    MAIN_SPACING = 14
    TITLE_SIZE = 17
    TAG_SIZE = 11
    DATE_SIZE = 12

    def get_entry_type_styling(entry_type):
        styles = {
            'Game': {'bg': ft.colors.BLUE_600, 'fg': ft.colors.WHITE, 'gradient': ft.LinearGradient(colors=[ft.colors.BLUE_600, ft.colors.BLUE_700], begin=ft.alignment.top_left, end=ft.alignment.bottom_right)},
            'Movie': {'bg': ft.colors.RED_600, 'fg': ft.colors.WHITE, 'gradient': ft.LinearGradient(colors=[ft.colors.RED_600, ft.colors.RED_700], begin=ft.alignment.top_left, end=ft.alignment.bottom_right)},
            'Show': {'bg': ft.colors.PURPLE_600, 'fg': ft.colors.WHITE, 'gradient': ft.LinearGradient(colors=[ft.colors.PURPLE_600, ft.colors.PURPLE_700], begin=ft.alignment.top_left, end=ft.alignment.bottom_right)},
            'K-Drama': {'bg': ft.colors.GREEN_600, 'fg': ft.colors.WHITE, 'gradient': ft.LinearGradient(colors=[ft.colors.GREEN_600, ft.colors.GREEN_700], begin=ft.alignment.top_left, end=ft.alignment.bottom_right)},
            'Anime': {'bg': ft.colors.PINK_600, 'fg': ft.colors.WHITE, 'gradient': ft.LinearGradient(colors=[ft.colors.PINK_600, ft.colors.PINK_700], begin=ft.alignment.top_left, end=ft.alignment.bottom_right)},
            'Book': {'bg': ft.colors.BROWN_600, 'fg': ft.colors.WHITE, 'gradient': ft.LinearGradient(colors=[ft.colors.BROWN_600, ft.colors.BROWN_700], begin=ft.alignment.top_left, end=ft.alignment.bottom_right)},
            'Hentai': {'bg': ft.colors.DEEP_PURPLE_600, 'fg': ft.colors.WHITE, 'gradient': ft.LinearGradient(colors=[ft.colors.DEEP_PURPLE_600, ft.colors.DEEP_PURPLE_700], begin=ft.alignment.top_left, end=ft.alignment.bottom_right)},
            'JAV': {'bg': ft.colors.INDIGO_600, 'fg': ft.colors.WHITE, 'gradient': ft.LinearGradient(colors=[ft.colors.INDIGO_600, ft.colors.INDIGO_700], begin=ft.alignment.top_left, end=ft.alignment.bottom_right)},
            'Adult Visual Novel': {'bg': ft.colors.DEEP_ORANGE_600, 'fg': ft.colors.WHITE, 'gradient': ft.LinearGradient(colors=[ft.colors.DEEP_ORANGE_600, ft.colors.DEEP_ORANGE_700], begin=ft.alignment.top_left, end=ft.alignment.bottom_right)},
            'Other': {'bg': ft.colors.BLUE_GREY_600, 'fg': ft.colors.WHITE, 'gradient': ft.LinearGradient(colors=[ft.colors.BLUE_GREY_600, ft.colors.BLUE_GREY_700], begin=ft.alignment.top_left, end=ft.alignment.bottom_right)},
        }
        return styles.get(entry_type, styles['Other'])

    title_text = ft.Text(name, weight=ft.FontWeight.W_600, size=TITLE_SIZE, max_lines=2, overflow=ft.TextOverflow.ELLIPSIS, color=ft.colors.ON_SURFACE, style=ft.TextStyle(letter_spacing=0.2))
    entry_type_style = get_entry_type_styling(entry_type_str)
    entry_type_icon_name = get_entry_type_icon_name(entry_type_str)
    entry_type_badge = ft.Container(content=ft.Row([ft.Icon(entry_type_icon_name, size=14, color=entry_type_style['fg']), ft.Text(entry_type_str, size=TAG_SIZE, color=entry_type_style['fg'], weight=ft.FontWeight.W_600, style=ft.TextStyle(letter_spacing=0.3))], spacing=6, vertical_alignment=ft.CrossAxisAlignment.CENTER, tight=True), gradient=entry_type_style['gradient'], padding=ft.padding.symmetric(horizontal=12, vertical=6), border_radius=ft.border_radius.all(20), shadow=ft.BoxShadow(spread_radius=0, blur_radius=4, color=ft.colors.with_opacity(0.3, entry_type_style['bg']), offset=ft.Offset(0, 2)))

    def create_enhanced_rating_badge(score):
        if score is None: return ft.Container()
        if score >= 9: color, bg_color = ft.colors.GREEN_600, ft.colors.with_opacity(0.1, ft.colors.GREEN_600)
        elif score >= 7: color, bg_color = ft.colors.BLUE_600, ft.colors.with_opacity(0.1, ft.colors.BLUE_600)
        elif score >= 5: color, bg_color = ft.colors.ORANGE_600, ft.colors.with_opacity(0.1, ft.colors.ORANGE_600)
        else: color, bg_color = ft.colors.RED_600, ft.colors.with_opacity(0.1, ft.colors.RED_600)
        return ft.Container(content=ft.Row([ft.Icon(ft.icons.STAR_ROUNDED, size=14, color=color), ft.Text(f"{score:.1f}", size=TAG_SIZE + 1, color=color, weight=ft.FontWeight.W_700)], spacing=4, vertical_alignment=ft.CrossAxisAlignment.CENTER, tight=True), bgcolor=bg_color, padding=ft.padding.symmetric(horizontal=10, vertical=6), border_radius=ft.border_radius.all(20), border=ft.border.all(1, ft.colors.with_opacity(0.2, color)))
    rating_badge = create_enhanced_rating_badge(score)

    def create_genre_tag(genre_text):
        return ft.Container(content=ft.Text(genre_text, size=TAG_SIZE - 1, color=ft.colors.ON_SURFACE_VARIANT, weight=ft.FontWeight.W_500, max_lines=1, overflow=ft.TextOverflow.ELLIPSIS), bgcolor=ft.colors.with_opacity(0.08, ft.colors.ON_SURFACE), padding=ft.padding.symmetric(horizontal=8, vertical=4), border_radius=ft.border_radius.all(12), border=ft.border.all(1, ft.colors.with_opacity(0.12, ft.colors.ON_SURFACE)))
    genre_widgets_row = ft.Row(wrap=True, spacing=6, run_spacing=6, tight=True)
    if parsed_genres:
        display_genres = parsed_genres[:3]
        for genre_text in display_genres: genre_widgets_row.controls.append(create_genre_tag(genre_text))
        if len(parsed_genres) > 3:
            remaining_genres = parsed_genres[3:]
            tooltip_text = ", ".join(remaining_genres)
            genre_widgets_row.controls.append(ft.Container(content=ft.Text(f"+{len(parsed_genres) - 3}", size=TAG_SIZE - 1, color=ft.colors.PRIMARY, weight=ft.FontWeight.W_600), bgcolor=ft.colors.with_opacity(0.1, ft.colors.PRIMARY), padding=ft.padding.symmetric(horizontal=8, vertical=4), border_radius=ft.border_radius.all(12), border=ft.border.all(1, ft.colors.with_opacity(0.3, ft.colors.PRIMARY)), tooltip=tooltip_text))

    def create_indicator(icon, tooltip, color):
        return ft.Container(content=ft.Icon(icon, size=16, color=color), bgcolor=ft.colors.with_opacity(0.1, color), padding=ft.padding.all(6), border_radius=ft.border_radius.all(20), tooltip=tooltip, border=ft.border.all(1, ft.colors.with_opacity(0.3, color)))
    bottom_indicators_list = []
    if is_rewatch: bottom_indicators_list.append(create_indicator(ft.icons.REPLAY_ROUNDED, "Rewatched", ft.colors.AMBER_600))
    if owns_local_copy: bottom_indicators_list.append(create_indicator(ft.icons.DOWNLOAD_DONE_ROUNDED, "Owns Local Copy", ft.colors.GREEN_600))
    bottom_indicators_row = ft.Row(controls=bottom_indicators_list, spacing=8, vertical_alignment=ft.CrossAxisAlignment.CENTER)

    options_button = ft.Container(content=ft.PopupMenuButton(content=ft.Icon(ft.icons.MORE_VERT_ROUNDED, color=ft.colors.WHITE, size=18), tooltip="Options", items=[ft.PopupMenuItem(text="Edit", icon=ft.icons.EDIT_OUTLINED, on_click=lambda _, item=jav_item: edit_callback(item)), ft.PopupMenuItem(text="View Description", icon=ft.icons.DESCRIPTION_OUTLINED, on_click=lambda _, item=jav_item: show_desc_callback(item), disabled=not has_description), ft.PopupMenuItem(), ft.PopupMenuItem(text="Delete", icon=ft.icons.DELETE_OUTLINE, on_click=lambda _, item_id=jav_item['id'], item_name=jav_item['name']: delete_callback(item_id, item_name))]), bgcolor=ft.colors.with_opacity(0.4, ft.colors.BLACK87), padding=ft.padding.all(8), border_radius=ft.border_radius.all(20), shadow=ft.BoxShadow(spread_radius=0, blur_radius=8, color=ft.colors.with_opacity(0.3, ft.colors.BLACK), offset=ft.Offset(0, 2)))
    image_stack = ft.Stack([ft.Container(content=ft.Image(src=image_src_for_flet, height=IMAGE_HEIGHT, width=float('inf'), fit=ft.ImageFit.COVER, error_content=ft.Container(content=ft.Column([ft.Icon(ft.icons.BROKEN_IMAGE, size=40, color=ft.colors.ON_SURFACE_VARIANT), ft.Text("Image Error", size=12, color=ft.colors.ON_SURFACE_VARIANT, weight=ft.FontWeight.W_500)], horizontal_alignment=ft.CrossAxisAlignment.CENTER, alignment=ft.MainAxisAlignment.CENTER, spacing=8), height=IMAGE_HEIGHT, width=float('inf'), bgcolor=ft.colors.SURFACE_VARIANT, alignment=ft.alignment.center)), border_radius=ft.border_radius.only(top_left=CARD_RADIUS, top_right=CARD_RADIUS), clip_behavior=ft.ClipBehavior.HARD_EDGE), ft.Container(height=IMAGE_HEIGHT, width=float('inf'), gradient=ft.LinearGradient(colors=[ft.colors.with_opacity(0, ft.colors.BLACK), ft.colors.with_opacity(0.2, ft.colors.BLACK)], begin=ft.alignment.top_center, end=ft.alignment.bottom_center), border_radius=ft.border_radius.only(top_left=CARD_RADIUS, top_right=CARD_RADIUS)), ft.Container(content=options_button, top=12, right=12)])

    def create_info_chip(icon, text, tooltip_prefix):
        return ft.Container(content=ft.Row([ft.Icon(icon, size=12, color=ft.colors.ON_SURFACE_VARIANT), ft.Text(text, size=TAG_SIZE, color=ft.colors.ON_SURFACE_VARIANT, weight=ft.FontWeight.W_500, max_lines=1, overflow=ft.TextOverflow.ELLIPSIS)], spacing=4, vertical_alignment=ft.CrossAxisAlignment.CENTER, tight=True), bgcolor=ft.colors.with_opacity(0.06, ft.colors.ON_SURFACE), padding=ft.padding.symmetric(horizontal=8, vertical=4), border_radius=ft.border_radius.all(12), tooltip=f"{tooltip_prefix}: {text}", border=ft.border.all(1, ft.colors.with_opacity(0.08, ft.colors.ON_SURFACE)))
    type_specific_info_container = ft.Row(wrap=True, spacing=6, run_spacing=6)
    if jav_item.get('platform'): type_specific_info_container.controls.append(create_info_chip(ft.icons.VIDEOGAME_ASSET_OUTLINED, jav_item['platform'], "Platform"))
    if jav_item.get('author'): type_specific_info_container.controls.append(create_info_chip(ft.icons.PERSON_OUTLINE, jav_item['author'], "Author"))
    if jav_item.get('director'): type_specific_info_container.controls.append(create_info_chip(ft.icons.BUSINESS_OUTLINED, jav_item['director'], "Studio"))
    if jav_item.get('actress'):
        for actress_name in utils.parse_multi_value_field(jav_item['actress']): type_specific_info_container.controls.append(create_info_chip(ft.icons.WOMAN_2_OUTLINED, actress_name, f"Actress: {actress_name}"))
    if jav_item.get('update_version'): type_specific_info_container.controls.append(create_info_chip(ft.icons.INFO_OUTLINE, jav_item['update_version'], "Version"))

    card_content_controls = [ft.Container(content=title_text, margin=ft.margin.only(bottom=4)), ft.Row(controls=[entry_type_badge, rating_badge] if rating_badge.content else [entry_type_badge], alignment=ft.MainAxisAlignment.SPACE_BETWEEN, vertical_alignment=ft.CrossAxisAlignment.CENTER)]
    if type_specific_info_container.controls: card_content_controls.append(type_specific_info_container)
    if genre_widgets_row.controls: card_content_controls.append(genre_widgets_row)
    card_content_controls.append(ft.Row(alignment=ft.MainAxisAlignment.SPACE_BETWEEN, vertical_alignment=ft.CrossAxisAlignment.CENTER, controls=[bottom_indicators_row, ft.Text(display_completion_date, size=DATE_SIZE, color=ft.colors.ON_SURFACE_VARIANT, opacity=0.8, weight=ft.FontWeight.W_500, style=ft.TextStyle(letter_spacing=0.2))]))
    card_content = ft.Column(controls=card_content_controls, spacing=MAIN_SPACING, tight=True)
    return ft.Card(content=ft.Container(content=ft.Column([image_stack, ft.Container(content=card_content, padding=CONTENT_PADDING)], spacing=0, tight=True), clip_behavior=ft.ClipBehavior.HARD_EDGE), elevation=3, margin=ft.margin.all(8), shape=ft.RoundedRectangleBorder(radius=CARD_RADIUS), shadow_color=ft.colors.with_opacity(0.15, ft.colors.BLACK), surface_tint_color=ft.colors.SURFACE_TINT)

def update_conditional_fields(selected_type: str, container: ft.Column, initial_data: dict | None = None):
    container.controls.clear()
    if selected_type == "Game":
        platform_options = [ft.dropdown.Option("PC"), ft.dropdown.Option("PlayStation"), ft.dropdown.Option("Xbox"), ft.dropdown.Option("Nintendo Switch"), ft.dropdown.Option("Mobile"), ft.dropdown.Option("Other")]
        container.controls.append(ft.Dropdown(label="Platform", options=platform_options, hint_text="Select the game platform", value=initial_data.get('platform') if initial_data else None, data="platform"))
    elif selected_type == "Book":
        container.controls.append(ft.TextField(label="Author", capitalization=ft.TextCapitalization.WORDS, value=initial_data.get('author') if initial_data else None, data="author"))
    elif selected_type == "JAV":
        container.controls.extend([ft.TextField(label="Studio", capitalization=ft.TextCapitalization.WORDS, value=initial_data.get('director') if initial_data else None, data="director"), ft.TextField(label="Actress(es)", capitalization=ft.TextCapitalization.WORDS, value=initial_data.get('actress') if initial_data else None, data="actress")])
    elif selected_type == "Adult Visual Novel":
        container.controls.append(ft.TextField(label="Update / Version", value=initial_data.get('update_version') if initial_data else None, data="update_version"))
    if container.page:
        try: container.update()
        except Exception: pass

def get_data_from_conditional_fields(container: ft.Column) -> dict:
    data = {}
    for control in container.controls:
        if hasattr(control, 'data') and control.data: data[control.data] = control.value
    return data

def create_markdown_editor(initial_value: str = ""):
    text_field_ref = ft.Ref[ft.TextField]()
    def insert_markdown(syntax: str):
        tf = text_field_ref.current
        if tf:
            if tf.value: tf.value += f"\n{syntax}"
            else: tf.value = syntax
            tf.focus()
            tf.update()
    toolbar = ft.Container(content=ft.Row(controls=[ft.IconButton(icon=ft.icons.TITLE, on_click=lambda _: insert_markdown("# "), tooltip="Heading"), ft.IconButton(icon=ft.icons.FORMAT_BOLD, on_click=lambda _: insert_markdown("**text**"), tooltip="Bold"), ft.IconButton(icon=ft.icons.FORMAT_ITALIC, on_click=lambda _: insert_markdown("*text*"), tooltip="Italic"), ft.IconButton(icon=ft.icons.FORMAT_LIST_BULLETED, on_click=lambda _: insert_markdown("- "), tooltip="Bulleted List"), ft.IconButton(icon=ft.icons.FORMAT_LIST_NUMBERED, on_click=lambda _: insert_markdown("1. "), tooltip="Numbered List"), ft.IconButton(icon=ft.icons.LINK, on_click=lambda _: insert_markdown("[link text](url)"), tooltip="Link"), ft.IconButton(icon=ft.icons.CODE, on_click=lambda _: insert_markdown("```\ncode\n```"), tooltip="Code Block")], spacing=0, alignment=ft.MainAxisAlignment.START), border=ft.border.all(1, ft.colors.OUTLINE_VARIANT), border_radius=ft.border_radius.only(top_left=4, top_right=4), padding=ft.padding.symmetric(horizontal=4))
    text_field = ft.TextField(ref=text_field_ref, label="Description / Notes (Markdown supported)", value=initial_value, multiline=True, min_lines=3, max_lines=5, capitalization=ft.TextCapitalization.SENTENCES, border_radius=ft.border_radius.only(bottom_left=4, bottom_right=4), border=ft.border.only(left=ft.border.BorderSide(1, ft.colors.OUTLINE_VARIANT), right=ft.border.BorderSide(1, ft.colors.OUTLINE_VARIANT), bottom=ft.border.BorderSide(1, ft.colors.OUTLINE_VARIANT)))
    return ft.Column(controls=[toolbar, text_field], spacing=0), text_field_ref

def create_entry_type_filter_button_with_sheet(page_ref: ft.Page, available_types: list[str], selected_types_set: set[str], on_change_callback: callable, button_label_prefix: str = "Filter Types"):
    filter_button_ref = ft.Ref[ft.OutlinedButton]()
    def get_button_text():
        count = len(selected_types_set)
        if count == len(available_types): return f"{button_label_prefix} (All)"
        elif count == 0: return f"{button_label_prefix} (None)"
        else: return f"{button_label_prefix} ({count} selected)"
    all_types_checkbox_bs_ref = ft.Ref[ft.Checkbox]()
    individual_checkbox_bs_refs = {type_name: ft.Ref[ft.Checkbox]() for type_name in available_types}
    def update_button_and_all_cb_state():
        if filter_button_ref.current:
            filter_button_ref.current.text = get_button_text()
            if filter_button_ref.current.page:
                try: filter_button_ref.current.update()
                except: pass
        if all_types_checkbox_bs_ref.current:
            all_selected = len(selected_types_set) == len(available_types)
            if all_types_checkbox_bs_ref.current.value != all_selected:
                all_types_checkbox_bs_ref.current.value = all_selected
                if all_types_checkbox_bs_ref.current.page:
                    try: all_types_checkbox_bs_ref.current.update()
                    except: pass
    def on_all_types_bs_change(e):
        is_checked = e.control.value
        if is_checked: selected_types_set.update(available_types)
        else: selected_types_set.clear()
        for type_name, cb_ref in individual_checkbox_bs_refs.items():
            if cb_ref.current and cb_ref.current.value != is_checked:
                cb_ref.current.value = is_checked
                if cb_ref.current.page:
                    try: cb_ref.current.update()
                    except: pass
        update_button_and_all_cb_state()
    def on_individual_type_bs_change(e):
        type_name, is_checked = e.control.data, e.control.value
        if is_checked: selected_types_set.add(type_name)
        else: selected_types_set.discard(type_name)
        update_button_and_all_cb_state()
    bs_checkbox_controls = [ft.Checkbox(ref=all_types_checkbox_bs_ref, label="All Types", value=len(selected_types_set) == len(available_types), on_change=on_all_types_bs_change, adaptive=True), ft.Divider(height=5, thickness=0.5)]
    for type_name_str in available_types: bs_checkbox_controls.append(ft.Checkbox(ref=individual_checkbox_bs_refs[type_name_str], label=type_name_str, value=type_name_str in selected_types_set, data=type_name_str, on_change=on_individual_type_bs_change, adaptive=True))
    filter_bottom_sheet_ref = ft.Ref[ft.BottomSheet]()
    def close_bs_and_apply(e=None):
        if filter_bottom_sheet_ref.current:
            filter_bottom_sheet_ref.current.open = False
            if filter_bottom_sheet_ref.current.page:
                try: filter_bottom_sheet_ref.current.update()
                except: pass
        on_change_callback()
    filter_bottom_sheet = ft.BottomSheet(ref=filter_bottom_sheet_ref, content=ft.Container(ft.Column([ft.Text("Select Entry Types", weight=ft.FontWeight.BOLD, size=16), ft.Divider(height=10), ft.Column(bs_checkbox_controls, scroll=ft.ScrollMode.ADAPTIVE, spacing=0, tight=True, expand=True), ft.Divider(height=10), ft.Row([ft.ElevatedButton("Done", on_click=close_bs_and_apply, expand=True, style=ft.ButtonStyle(padding=12))], alignment=ft.MainAxisAlignment.CENTER)], tight=True, spacing=5), padding=ft.padding.only(left=20, right=20, top=10, bottom=20), height=page_ref.window_height * 0.6 if page_ref and page_ref.window_height else 400), open=False, on_dismiss=lambda e: on_change_callback(), enable_drag=True, show_drag_handle=True)
    if filter_bottom_sheet not in page_ref.overlay: page_ref.overlay.append(filter_bottom_sheet)
    def open_filter_bottom_sheet(e):
        if all_types_checkbox_bs_ref.current: all_types_checkbox_bs_ref.current.value = (len(selected_types_set) == len(available_types))
        for type_name, cb_ref in individual_checkbox_bs_refs.items():
            if cb_ref.current: cb_ref.current.value = (type_name in selected_types_set)
        if filter_bottom_sheet_ref.current and filter_bottom_sheet_ref.current.page:
            for ctrl in bs_checkbox_controls:
                if hasattr(ctrl, 'page') and ctrl.page:
                    try: ctrl.update()
                    except: pass
        if filter_bottom_sheet_ref.current:
            filter_bottom_sheet_ref.current.open = True
            page_ref.update()
    return ft.OutlinedButton(ref=filter_button_ref, text=get_button_text(), icon=ft.icons.FILTER_LIST_ROUNDED, on_click=open_filter_bottom_sheet, tooltip="Filter by entry type")

def create_search_fields_filter_button_with_sheet(page_ref: ft.Page, available_fields: list[dict], selected_fields_set: set[str], on_change_callback: callable, button_label_prefix: str = "Search In"):
    filter_button_ref = ft.Ref[ft.OutlinedButton]()
    def get_button_text():
        count = len(selected_fields_set)
        if count == len(available_fields): return f"{button_label_prefix} (All Fields)"
        elif count == 0: return f"{button_label_prefix} (No Fields)"
        else: return f"{button_label_prefix} ({count} fields)"
    all_fields_checkbox_bs_ref = ft.Ref[ft.Checkbox]()
    individual_checkbox_bs_refs = {field["key"]: ft.Ref[ft.Checkbox]() for field in available_fields}
    def update_button_and_all_cb_state():
        if filter_button_ref.current:
            filter_button_ref.current.text = get_button_text()
            if filter_button_ref.current.page:
                try: filter_button_ref.current.update()
                except: pass
        if all_fields_checkbox_bs_ref.current:
            all_selected = len(selected_fields_set) == len(available_fields)
            if all_fields_checkbox_bs_ref.current.value != all_selected:
                all_fields_checkbox_bs_ref.current.value = all_selected
                if all_fields_checkbox_bs_ref.current.page:
                    try: all_fields_checkbox_bs_ref.current.update()
                    except: pass
    def on_all_fields_bs_change(e):
        is_checked = e.control.value
        if is_checked: selected_fields_set.update([field["key"] for field in available_fields])
        else: selected_fields_set.clear()
        for field_key, cb_ref in individual_checkbox_bs_refs.items():
            if cb_ref.current and cb_ref.current.value != is_checked:
                cb_ref.current.value = is_checked
                if cb_ref.current.page:
                    try: cb_ref.current.update()
                    except: pass
        update_button_and_all_cb_state()
    def on_individual_field_bs_change(e):
        field_key, is_checked = e.control.data, e.control.value
        if is_checked: selected_fields_set.add(field_key)
        else: selected_fields_set.discard(field_key)
        update_button_and_all_cb_state()
    bs_checkbox_controls = [ft.Checkbox(ref=all_fields_checkbox_bs_ref, label="All Fields", value=len(selected_fields_set) == len(available_fields), on_change=on_all_fields_bs_change, adaptive=True), ft.Divider(height=5, thickness=0.5)]
    for field in available_fields: bs_checkbox_controls.append(ft.Checkbox(ref=individual_checkbox_bs_refs[field["key"]], label=field["label"], value=field["key"] in selected_fields_set, data=field["key"], on_change=on_individual_field_bs_change, adaptive=True))
    filter_bottom_sheet_ref = ft.Ref[ft.BottomSheet]()
    def close_bs_and_apply(e=None):
        if filter_bottom_sheet_ref.current:
            filter_bottom_sheet_ref.current.open = False
            if filter_bottom_sheet_ref.current.page:
                try: filter_bottom_sheet_ref.current.update()
                except: pass
        on_change_callback()
    filter_bottom_sheet = ft.BottomSheet(ref=filter_bottom_sheet_ref, content=ft.Container(ft.Column([ft.Text("Select Search Fields", weight=ft.FontWeight.BOLD, size=16), ft.Divider(height=10), ft.Column(bs_checkbox_controls, scroll=ft.ScrollMode.ADAPTIVE, spacing=0, tight=True, expand=True), ft.Divider(height=10), ft.Row([ft.ElevatedButton("Done", on_click=close_bs_and_apply, expand=True, style=ft.ButtonStyle(padding=12))], alignment=ft.MainAxisAlignment.CENTER)], tight=True, spacing=5), padding=ft.padding.only(left=20, right=20, top=10, bottom=20), height=page_ref.window_height * 0.6 if page_ref and page_ref.window_height else 400), open=False, on_dismiss=lambda e: on_change_callback(), enable_drag=True, show_drag_handle=True)
    if filter_bottom_sheet not in page_ref.overlay: page_ref.overlay.append(filter_bottom_sheet)
    def open_filter_bottom_sheet(e):
        if all_fields_checkbox_bs_ref.current: all_fields_checkbox_bs_ref.current.value = (len(selected_fields_set) == len(available_fields))
        for field_key, cb_ref in individual_checkbox_bs_refs.items():
            if cb_ref.current: cb_ref.current.value = (field_key in selected_fields_set)
        if filter_bottom_sheet_ref.current and filter_bottom_sheet_ref.current.page:
            for ctrl in bs_checkbox_controls:
                if hasattr(ctrl, 'page') and ctrl.page:
                    try: ctrl.update()
                    except: pass
        if filter_bottom_sheet_ref.current:
            filter_bottom_sheet_ref.current.open = True
            page_ref.update()
    return ft.OutlinedButton(ref=filter_button_ref, text=get_button_text(), icon=ft.icons.SEARCH_OUTLINED, on_click=open_filter_bottom_sheet, tooltip="Select which fields to search in")

# --- ENHANCED: UI Helper for Backlog List Item ---
def create_backlog_list_item(page, item_data, complete_callback, edit_callback, delete_callback):
    """Creates a visually enhanced list item for a backlog item with modern design."""
    item_id = item_data['id']
    name = item_data.get('name', 'Unknown Title')
    entry_type = item_data.get('entry_type', 'Other')
    source = item_data.get('source')
    notes = item_data.get('notes')
    date_added_str = item_data.get('date_added', 'N/A')
    image_url = item_data.get('image_url')

    # Date formatting
    display_date = date_added_str
    try:
        date_obj = datetime.strptime(date_added_str, '%Y-%m-%d')
        display_date = date_obj.strftime('%d %b %Y')
    except (ValueError, TypeError):
        pass

    # --- Enhanced Components ---

    # 1. Enhanced Image Container with gradient overlay
    image_container = ft.Container(
        width=90,
        height=120,
        clip_behavior=ft.ClipBehavior.ANTI_ALIAS,
        border_radius=ft.border_radius.all(16),
        shadow=ft.BoxShadow(
            spread_radius=0,
            blur_radius=12,
            color=ft.colors.with_opacity(0.25, ft.colors.BLACK),
            offset=ft.Offset(0, 4),
        ),
        animate=ft.animation.Animation(300, ft.AnimationCurve.EASE_OUT_CUBIC)
    )
    
    if image_url:
        if image_url.lower().startswith("http"):
            image_src = image_url
        else:
            # Check if the image exists in the assets directory
            full_local_path_check = os.path.join(config.ASSETS_DIR, image_url)
            if os.path.exists(full_local_path_check):
                image_src = image_url # Use the relative path for Flet
            else:
                image_src = config.DEFAULT_IMAGE_URL # Fallback if local file is missing
        
        # Image with subtle gradient overlay
        image_stack = ft.Stack([
            ft.Image(src=image_src, fit=ft.ImageFit.COVER, width=90, height=120),
            ft.Container(
                width=90,
                height=120,
                gradient=ft.LinearGradient(
                    colors=[
                        ft.colors.with_opacity(0.0, ft.colors.BLACK),
                        ft.colors.with_opacity(0.1, ft.colors.BLACK)
                    ],
                    begin=ft.alignment.top_center,
                    end=ft.alignment.bottom_center
                )
            )
        ])
        image_container.content = image_stack
    else:
        image_container.content = ft.Container(
            gradient=ft.LinearGradient(
                colors=[ft.colors.SURFACE_VARIANT, ft.colors.with_opacity(0.8, ft.colors.SURFACE_VARIANT)],
                begin=ft.alignment.top_left,
                end=ft.alignment.bottom_right
            ),
            alignment=ft.alignment.center,
            content=ft.Icon(
                get_entry_type_icon_name(entry_type), 
                size=36, 
                color=ft.colors.ON_SURFACE_VARIANT, 
                opacity=0.6
            )
        )

    # 2. Enhanced Title and Type Badge
    title_text = ft.Text(
        name, 
        weight=ft.FontWeight.W_600, 
        size=19, 
        max_lines=2, 
        overflow=ft.TextOverflow.ELLIPSIS,
        color=ft.colors.ON_SURFACE
    )
    
    # Entry type colors mapping
    type_colors = {
        "Movie": [ft.colors.PURPLE_600],
        "TV Show": [ft.colors.BLUE_600],
        "Game": [ft.colors.GREEN_600],
        "Book": [ft.colors.ORANGE_600],
        "Anime": [ft.colors.PINK_600],
        "K-Drama": [ft.colors.LIGHT_GREEN_600],
        "Hentai": [ft.colors.DEEP_PURPLE_600],
        "JAV": [ft.colors.INDIGO_600],
        "Adult Visual Novel": [ft.colors.DEEP_ORANGE_600],
        "Other": [ft.colors.GREY_400, ft.colors.GREY_600]
    }
    
    gradient_colors = type_colors.get(entry_type, [ft.colors.PRIMARY, ft.colors.with_opacity(0.8, ft.colors.PRIMARY)])
    
    type_badge = ft.Container(
        content=ft.Text(
            entry_type, 
            size=12, 
            weight=ft.FontWeight.W_600, 
            color=ft.colors.WHITE
        ),
        gradient=ft.LinearGradient(
            colors=gradient_colors,
            begin=ft.alignment.top_left,
            end=ft.alignment.bottom_right
        ),
        padding=ft.padding.symmetric(horizontal=12, vertical=6),
        border_radius=ft.border_radius.all(20),
        shadow=ft.BoxShadow(
            spread_radius=0,
            blur_radius=4,
            color=ft.colors.with_opacity(0.3, gradient_colors[0]),
            offset=ft.Offset(0, 2),
        ),
        animate=ft.animation.Animation(200, ft.AnimationCurve.EASE_OUT)
    )

    # 3. Enhanced Info Chips
    date_chip = ft.Container(
        content=ft.Row([
            ft.Icon(ft.icons.SCHEDULE_ROUNDED, size=14, color=ft.colors.PRIMARY),
            ft.Text(display_date, size=13, color=ft.colors.ON_SURFACE, weight=ft.FontWeight.W_500)
        ], spacing=6),
        padding=ft.padding.symmetric(horizontal=12, vertical=8),
        bgcolor=ft.colors.with_opacity(0.08, ft.colors.PRIMARY),
        border_radius=ft.border_radius.all(12),
        animate=ft.animation.Animation(200, ft.AnimationCurve.EASE_OUT)
    )
    
    source_chip = ft.Container()
    if source:
        source_chip = ft.Container(
            content=ft.Row([
                ft.Icon(ft.icons.RECOMMEND_ROUNDED, size=14, color=ft.colors.SECONDARY),
                ft.Text(
                    source, 
                    size=13, 
                    color=ft.colors.ON_SURFACE, 
                    weight=ft.FontWeight.W_500,
                    max_lines=1, 
                    overflow=ft.TextOverflow.ELLIPSIS
                )
            ], spacing=6),
            padding=ft.padding.symmetric(horizontal=12, vertical=8),
            bgcolor=ft.colors.with_opacity(0.08, ft.colors.SECONDARY),
            border_radius=ft.border_radius.all(12),
            tooltip=f"Recommended by: {source}",
            animate=ft.animation.Animation(200, ft.AnimationCurve.EASE_OUT)
        )

    # 4. Enhanced Notes Section
    notes_display = ft.Container()
    if notes:
        notes_display = ft.Container(
            content=ft.Text(
                notes, 
                size=14, 
                max_lines=3, 
                overflow=ft.TextOverflow.ELLIPSIS, 
                color=ft.colors.ON_SURFACE_VARIANT,
                style=ft.TextStyle(height=1.4)
            ),
            padding=ft.padding.all(12),
            margin=ft.margin.only(top=12),
            bgcolor=ft.colors.with_opacity(0.05, ft.colors.ON_SURFACE),
            border_radius=ft.border_radius.all(12),
            border=ft.border.all(1, ft.colors.with_opacity(0.1, ft.colors.ON_SURFACE))
        )

    # 5. Enhanced Action Buttons with hover effects
    def create_action_button(icon, color, tooltip, callback, hover_color=None):
        if hover_color is None:
            hover_color = ft.colors.with_opacity(0.1, color)
        
        return ft.Container(
            content=ft.Icon(icon, size=20, color=color),
            width=44,
            height=44,
            border_radius=ft.border_radius.all(12),
            alignment=ft.alignment.center,
            tooltip=tooltip,
            animate=ft.animation.Animation(200, ft.AnimationCurve.EASE_OUT),
            on_click=callback,
            ink=True,
            on_hover=lambda e: setattr(e.control, 'bgcolor', hover_color if e.data == "true" else ft.colors.TRANSPARENT) or e.control.update()
        )

    action_buttons = ft.Row(
        spacing=8,
        alignment=ft.MainAxisAlignment.END,
        controls=[
            create_action_button(
                ft.icons.CHECK_CIRCLE_ROUNDED,
                ft.colors.GREEN_600,
                "Mark as Completed",
                lambda _, item=item_data: complete_callback(item),
                ft.colors.with_opacity(0.1, ft.colors.GREEN_600)
            ),
            create_action_button(
                ft.icons.EDIT_ROUNDED,
                ft.colors.BLUE_600,
                "Edit Item",
                lambda _, item=item_data: edit_callback(item),
                ft.colors.with_opacity(0.1, ft.colors.BLUE_600)
            ),
            create_action_button(
                ft.icons.DELETE_ROUNDED,
                ft.colors.RED_600,
                "Delete Item",
                lambda _, item_id=item_id, item_name=name: delete_callback(item_id, item_name),
                ft.colors.with_opacity(0.1, ft.colors.RED_600)
            ),
        ]
    )

    # --- Enhanced Layout Assembly ---
    header_row = ft.Row(
        [title_text, type_badge], 
        alignment=ft.MainAxisAlignment.SPACE_BETWEEN,
        vertical_alignment=ft.CrossAxisAlignment.START
    )
    
    chips_row = ft.Row(
        [date_chip, source_chip] if source else [date_chip], 
        spacing=10, 
        wrap=True
    )

    main_content = ft.Column(
        [header_row, chips_row, notes_display],
        spacing=12,
        expand=True,
    )

    item_layout = ft.Row(
        controls=[image_container, main_content],
        vertical_alignment=ft.CrossAxisAlignment.START,
        spacing=16,
    )

    # Main card with enhanced styling
    card_container = ft.Container(
        content=ft.Column([
            item_layout,
            ft.Divider(height=1, color=ft.colors.with_opacity(0.1, ft.colors.ON_SURFACE)),
            action_buttons
        ], spacing=16),
        padding=ft.padding.all(20),
        bgcolor=ft.colors.SURFACE,
        border_radius=ft.border_radius.all(20),
        border=ft.border.all(1, ft.colors.with_opacity(0.08, ft.colors.ON_SURFACE)),
        shadow=ft.BoxShadow(
            spread_radius=0,
            blur_radius=8,
            color=ft.colors.with_opacity(0.1, ft.colors.BLACK),
            offset=ft.Offset(0, 2),
        ),
        animate=ft.animation.Animation(300, ft.AnimationCurve.EASE_OUT_CUBIC),
        on_hover=lambda e: animate_card_hover(e.control, e.data == "true")
    )

    def animate_card_hover(control, is_hovering):
        if is_hovering:
            control.shadow = ft.BoxShadow(
                spread_radius=0,
                blur_radius=16,
                color=ft.colors.with_opacity(0.15, ft.colors.BLACK),
                offset=ft.Offset(0, 4),
            )
            control.scale = ft.transform.Scale(1.02)
        else:
            control.shadow = ft.BoxShadow(
                spread_radius=0,
                blur_radius=8,
                color=ft.colors.with_opacity(0.1, ft.colors.BLACK),
                offset=ft.Offset(0, 2),
            )
            control.scale = ft.transform.Scale(1.0)
        control.update()

    return ft.Container(
        content=card_container,
        margin=ft.margin.symmetric(vertical=8, horizontal=16),
        animate=ft.animation.Animation(200, ft.AnimationCurve.EASE_OUT)
    )



class AppUI:
    def __init__(self, page: ft.Page):
        self.page = page
        self.app_state = {}
        self._target_image_field_for_picker = None
        self.image_file_picker = ft.FilePicker(on_result=self.handle_image_file_pick)
        self.import_dialog = ft.FilePicker(on_result=self.handle_import_result)
        self.export_dialog = ft.FilePicker(on_result=self.handle_export_result)
        self.current_dialog = None
        self.form_overlay_container = ft.Ref[ft.Container]()
        self.stats_total_javs_text = ft.Ref[ft.Text]()
        self.stats_avg_score_text = ft.Ref[ft.Text]()
        self.stats_total_rewatches_text = ft.Ref[ft.Text]()
        self.stats_unique_genres_text = ft.Ref[ft.Text]()
        self.genre_pie_chart = ft.Ref[ft.PieChart]()
        self.genre_legend = ft.Ref[ft.Column]()
        self.main_stack = ft.Ref[ft.Stack]()
        self.stats_year_filter = ft.Ref[ft.SegmentedButton]()
        self.platform_chart_container = ft.Ref[ft.Card]()
        self.platform_pie_chart = ft.Ref[ft.PieChart]()
        self.platform_legend = ft.Ref[ft.Column]()
        self.author_chart_container = ft.Ref[ft.Card]()
        self.author_pie_chart = ft.Ref[ft.PieChart]()
        self.author_legend = ft.Ref[ft.Column]()
        self.director_chart_container = ft.Ref[ft.Card]()
        self.director_pie_chart = ft.Ref[ft.PieChart]()
        self.director_legend = ft.Ref[ft.Column]()
        self.actress_chart_container = ft.Ref[ft.Card]()
        self.actress_pie_chart = ft.Ref[ft.PieChart]()
        self.actress_legend = ft.Ref[ft.Column]()
        self.version_chart_container = ft.Ref[ft.Card]()
        self.version_pie_chart = ft.Ref[ft.PieChart]()
        self.version_legend = ft.Ref[ft.Column]()
        self.search_text_field = ft.Ref[ft.TextField]()
        self.search_results_grid = ft.Ref[ft.GridView]()
        self.search_results_count_text = ft.Ref[ft.Text]()
        self.main_content_area = ft.Ref[ft.Column]()
        self.fab = ft.Ref[ft.FloatingActionButton]()

    def initialize_app_state(self):
        saved_year_filter_str = database.get_setting_db(config.SAVED_YEAR_VIEW_FILTER_KEY)
        year_view_selected_types = set(s_type for s_type in saved_year_filter_str.split(',')) if saved_year_filter_str is not None else set(config.ALL_ENTRY_TYPES_STR)
        
        saved_stats_filter_str = database.get_setting_db(config.SAVED_STATS_VIEW_FILTER_KEY)
        stats_view_selected_types = set(s_type for s_type in saved_stats_filter_str.split(',')) if saved_stats_filter_str is not None else set(config.ALL_ENTRY_TYPES_STR)
        
        saved_search_filter_str = database.get_setting_db(config.SAVED_SEARCH_VIEW_FILTER_KEY)
        search_view_selected_types = set(s_type for s_type in saved_search_filter_str.split(',')) if saved_search_filter_str is not None else set(config.ALL_ENTRY_TYPES_STR)
        
        saved_backlog_filter_str = database.get_setting_db(config.SAVED_BACKLOG_VIEW_FILTER_KEY)
        backlog_view_selected_types = set(s_type for s_type in saved_backlog_filter_str.split(',')) if saved_backlog_filter_str is not None else set(config.ALL_ENTRY_TYPES_STR)

        self.app_state = {
            "current_view": config.YEARS[0] if config.YEARS else "Stats",
            "year_view_selected_entry_types": year_view_selected_types,
            "stats_view_selected_entry_types": stats_view_selected_types,
            "search_view_selected_entry_types": search_view_selected_types,
            "backlog_view_selected_entry_types": backlog_view_selected_types,
            "search_selected_fields": {"name", "author", "platform", "director", "actress", "update_version"},
            "current_search_term": "",
            "search_results": [],
        }

    def show_snackbar(self, message: str, color: str = None, duration: int = 4000):
        if not self.page: return
        try:
            self.page.snack_bar = ft.SnackBar(content=ft.Text(message, max_lines=3, overflow=ft.TextOverflow.ELLIPSIS), bgcolor=color, duration=duration, open=True)
            self.page.update()
        except Exception as e:
            print(f"Error displaying snackbar '{message}': {e}")

    def handle_image_file_pick(self, e: ft.FilePickerResultEvent):
        if self._target_image_field_for_picker is None:
            self.show_snackbar("Internal error: Target field for image not set.", color=ft.colors.ERROR_CONTAINER)
            return
        if e.files and e.files[0].path:
            selected_file_path = e.files[0].path
            self._target_image_field_for_picker.value = selected_file_path
            self._target_image_field_for_picker.error_text = None
            if hasattr(self._target_image_field_for_picker, 'page') and self._target_image_field_for_picker.page: self._target_image_field_for_picker.update()
            self.show_snackbar(f"Image selected: {os.path.basename(selected_file_path)}", duration=2500)
        elif not e.files and not e.path:
            self.show_snackbar("Image selection cancelled.", duration=2000)
        self._target_image_field_for_picker = None

    def process_and_copy_image(self, image_source_path_or_url: str) -> str | None:
        if not image_source_path_or_url or not image_source_path_or_url.strip(): return None
        source_str = image_source_path_or_url.strip()
        if source_str.lower().startswith("http://") or source_str.lower().startswith("https://"): return source_str
        if not os.path.exists(source_str):
            print(f"Warning: Local image path does not exist: {source_str}")
            return None
        try:
            if not os.path.exists(config.IMAGES_DIR):
                os.makedirs(config.IMAGES_DIR)
                print(f"Created images directory during processing: {config.IMAGES_DIR}")
            _, extension = os.path.splitext(source_str)
            extension = extension.lower() if extension else ".png"
            if not extension.startswith("."): extension = "." + extension
            if len(extension) > 10: extension = ".dat"
            unique_filename = f"{uuid.uuid4()}{extension}"
            destination_path = os.path.join(config.IMAGES_DIR, unique_filename)
            shutil.copy2(source_str, destination_path)
            print(f"Image copied from '{source_str}' to '{destination_path}'")
            return os.path.join("images", unique_filename).replace("\\", "/")
        except Exception as e:
            print(f"Error copying image from '{source_str}': {e}")
            traceback.print_exc()
            self.show_snackbar(f"Error copying image: {os.path.basename(source_str)}", color=ft.colors.ERROR_CONTAINER)
            return None

    def handle_import_result(self, e: ft.FilePickerResultEvent):
        if e.files and e.files[0].path:
            selected_file = e.files[0].path
            print(f"CSV file selected: {selected_file}")
            progress_dialog = ft.AlertDialog(modal=True, title=ft.Text("Importing CSV"), content=ft.Row([ft.ProgressRing(), ft.Text("Processing...")], alignment=ft.MainAxisAlignment.CENTER))
            self.current_dialog = progress_dialog
            self.page.overlay.append(self.current_dialog)
            self.current_dialog.open = True
            self.page.update()
            self.page.run_thread(self.import_csv_data, selected_file)
        else:
            self.show_snackbar("CSV Import Cancelled or No File Selected")

    def open_import_dialog(self, e):
        self.import_dialog.pick_files(dialog_title="Select CSV Log", allow_multiple=False, allowed_extensions=["csv"])

    def open_export_dialog(self, e):
        default_filename = f"media_log_export_{datetime.now().strftime('%Y%m%d')}.csv"
        self.export_dialog.save_file(dialog_title="Save CSV Export", file_name=default_filename, allowed_extensions=["csv"])

    def handle_export_result(self, e: ft.FilePickerResultEvent):
        if e.path:
            save_path = e.path
            print(f"CSV export path selected: {save_path}")
            progress_dialog = ft.AlertDialog(modal=True, title=ft.Text("Exporting to CSV"), content=ft.Row([ft.ProgressRing(), ft.Text("Writing data...")], alignment=ft.MainAxisAlignment.CENTER))
            self.current_dialog = progress_dialog
            self.page.overlay.append(self.current_dialog)
            self.current_dialog.open = True
            self.page.update()
            self.page.run_thread(self.write_csv_file, save_path)
        else:
            self.show_snackbar("CSV Export Cancelled")

    def write_csv_file(self, file_path):
        try:
            all_entries = database.get_all_javs_db()
            if not all_entries:
                self.page.run_thread(self.show_export_summary, file_path, False, "No data to export.")
                return
            fieldnames = ["Name", "Genre", "Review_Score", "Completion_Date", "Description", "IsRewatch", "OwnLocalCopy", "EntryType", "ImageURL", "Platform", "Author", "Studio", "Actress", "UpdateVersion"]
            with open(file_path, 'w', newline='', encoding='utf-8-sig') as csvfile:
                writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
                writer.writeheader()
                for entry in all_entries:
                    writer.writerow({
                        "Name": entry.get('name', ''), "Genre": entry.get('genre', ''), "Review_Score": entry.get('review_score', ''),
                        "Completion_Date": entry.get('completion_date', ''), "Description": entry.get('description', ''),
                        "IsRewatch": bool(entry.get('is_rewatch')), "OwnLocalCopy": bool(entry.get('own_local_copy')),
                        "EntryType": entry.get('entry_type', ''), "ImageURL": entry.get('image_url', ''),
                        "Platform": entry.get('platform', ''), "Author": entry.get('author', ''),
                        "Studio": entry.get('director', ''), "Actress": entry.get('actress', ''),
                        "UpdateVersion": entry.get('update_version', '')
                    })
            self.page.run_thread(self.show_export_summary, file_path, True)
        except Exception as e:
            print(f"Error during CSV export: {e}")
            traceback.print_exc()
            self.page.run_thread(self.show_export_summary, file_path, False, str(e))

    def show_export_summary(self, file_path, success, error_message=None):
        if self.current_dialog:
            self.current_dialog.open = False
            self.page.overlay.remove(self.current_dialog)
            self.current_dialog = None
            self.page.update()
        if success:
            self.show_snackbar(f"Successfully exported data to {os.path.basename(file_path)}", color=ft.colors.GREEN_700)
        else:
            self.show_snackbar(f"Export failed: {error_message}", color=ft.colors.ERROR_CONTAINER, duration=6000)

    def import_csv_data(self, file_path):
        expected_headers_lower = ["name", "genre", "review_score", "completion_date", "description", "isrewatch", "ownlocalcopy", "entrytype", "imageurl", "platform", "author", "studio", "actress", "updateversion"]
        header_map = {"name": "name", "genre": "genre_str", "review_score": "score", "completion_date": "completion_date_str", "description": "description", "isrewatch": "is_rewatch_csv", "ownlocalcopy": "own_local_copy_csv", "entrytype": "entry_type_csv", "imageurl": "image_url_csv", "platform": "platform_csv", "author": "author_csv", "studio": "director_csv", "actress": "actress_csv", "updateversion": "update_version_csv"}
        added_count, skipped_count = 0, 0
        error_messages, warning_messages = [], []
        try:
            with open(file_path, mode='r', encoding='utf-8-sig') as csvfile:
                reader = csv.DictReader(csvfile)
                csv_headers_lower_normalized = [h.lower().strip().replace(" ", "") for h in reader.fieldnames or []]
                if not csv_headers_lower_normalized: raise ValueError("CSV file is empty or has no header row.")
                if "name" not in csv_headers_lower_normalized or "completion_date" not in csv_headers_lower_normalized: raise ValueError("CSV Header Missing Required Columns: 'Name' and 'Completion_Date' are mandatory.")
                
                current_header_to_internal_var_map = {norm_h: header_map[orig_h] for norm_h, orig_h in {eh.replace(" ", ""): eh for eh in expected_headers_lower}.items() if norm_h in csv_headers_lower_normalized}
                original_csv_header_lookup = {h.lower().strip().replace(" ", ""): h for h in reader.fieldnames}

                for row_num, row in enumerate(reader, start=2):
                    jav_data_for_db = {}
                    valid_row = True
                    row_errors, row_warnings = [], []
                    try:
                        for norm_csv_h, internal_var_key in current_header_to_internal_var_map.items():
                            jav_data_for_db[internal_var_key] = row.get(original_csv_header_lookup.get(norm_csv_h), "").strip()
                        
                        name_val = jav_data_for_db.get("name")
                        entry_type_from_csv = jav_data_for_db.get("entry_type_csv") or "Other"
                        if not jav_data_for_db.get("entry_type_csv"): row_warnings.append("Missing Entry Type, defaulted to 'Other'.")
                        elif entry_type_from_csv not in config.ALL_ENTRY_TYPES_STR: row_warnings.append(f"Non-standard Entry Type '{entry_type_from_csv}'.")
                        
                        if not name_val: row_errors.append("Missing 'Name'"); valid_row = False
                        
                        db_date_str = None
                        date_input_str = jav_data_for_db.get("completion_date_str")
                        if date_input_str:
                            for fmt in ['%Y-%m-%d', '%d/%m/%Y', '%m/%d/%Y', '%Y/%m/%d', '%d-%m-%Y', '%m-%d-%Y']:
                                try: db_date_str = datetime.strptime(date_input_str, fmt).strftime('%Y-%m-%d'); break
                                except ValueError: continue
                            if not db_date_str: row_errors.append(f"Invalid Date Format '{date_input_str}'")
                        else: row_errors.append("Missing 'Completion_Date'")
                        
                        score_int = None
                        score_str = jav_data_for_db.get("score")
                        if score_str and score_str.lower() != 'n/a' and score_str.strip() != '':
                            try: score_int = int(round(float(score_str)))
                            except (ValueError, TypeError): row_warnings.append(f"Invalid Score '{score_str}', set to N/A.")
                        
                        is_rewatch = jav_data_for_db.get("is_rewatch_csv", "false").lower() in ['true', '1', 'yes', 't', 'y']
                        own_local_copy = jav_data_for_db.get("own_local_copy_csv", "false").lower() in ['true', '1', 'yes', 't', 'y']
                        
                        if valid_row and not row_errors:
                            database.add_jav_db(name_val, jav_data_for_db.get("genre_str"), db_date_str, score_int, jav_data_for_db.get("description"), is_rewatch, own_local_copy, jav_data_for_db.get("image_url_csv"), entry_type_from_csv, {"platform": jav_data_for_db.get("platform_csv"), "author": jav_data_for_db.get("author_csv"), "director": jav_data_for_db.get("director_csv"), "actress": jav_data_for_db.get("actress_csv"), "update_version": jav_data_for_db.get("update_version_csv")})
                            added_count += 1
                            if row_warnings: warning_messages.extend([f"Row {row_num} ('{name_val}'): {w}" for w in row_warnings])
                        else:
                            skipped_count += 1
                            error_messages.append(f"Row {row_num} ('{name_val or '<?>'}'): Skipped - {' | '.join(row_errors)}")
                    except Exception as e:
                        skipped_count += 1
                        error_messages.append(f"Row {row_num}: Skipped - Unexpected error: {e}")
        except Exception as e:
            error_messages.append(f"An unexpected error occurred during import: {e}")
            traceback.print_exc()
        
        summary_lines = [f"CSV Import Finished. Added: {added_count}, Skipped: {skipped_count}."]
        if warning_messages: summary_lines.extend(["\nWarnings (Max 5 shown):"] + warning_messages[:5])
        if error_messages: summary_lines.extend(["\nErrors (Max 5 shown):"] + error_messages[:5])
        
        if self.page: self.page.run_thread(self.show_import_summary_and_refresh, "\n".join(summary_lines), bool(error_messages or (skipped_count > 0 and added_count == 0)))

    def show_import_summary_and_refresh(self, message, had_errors):
        if self.current_dialog:
            self.current_dialog.open = False
            self.page.overlay.remove(self.current_dialog)
            self.current_dialog = None
            self.page.update()
        self.show_snackbar(message, color=ft.colors.ERROR_CONTAINER if had_errors else ft.colors.GREEN_700, duration=10000)
        self.refresh_current_view()
        current_stats_filter = "All Time"
        if self.stats_year_filter.current and self.stats_year_filter.current.selected:
            current_stats_filter = list(self.stats_year_filter.current.selected)[0]
        self.page.run_thread(self.calculate_and_update_stats_display, current_stats_filter)
        self.page.update()

    def close_form_overlay(self, e=None):
        overlay = self.form_overlay_container.current
        if overlay and overlay in self.main_stack.current.controls:
            try:
                if hasattr(overlay, '_associated_date_picker') and overlay._associated_date_picker in self.page.overlay:
                    self.page.overlay.remove(overlay._associated_date_picker)
                self.main_stack.current.controls.remove(overlay)
                self.form_overlay_container.current = None
                self.main_stack.current.update()
            except Exception as remove_e:
                print(f"Error removing form overlay from stack: {remove_e}")

    def build_form_view(self, title_text: str, form_controls: dict, save_callback: callable, close_callback: callable, type_change_callback: callable, associated_picker=None):
        preview_image, preview_title, preview_type, preview_date, preview_score, preview_genre = ft.Ref[ft.Image](), ft.Ref[ft.Text](), ft.Ref[ft.Text](), ft.Ref[ft.Text](), ft.Ref[ft.Text](), ft.Ref[ft.Text]()
        def update_previews(e=None):
            try:
                if preview_title.current: preview_title.current.value = form_controls["name"].value or "New Entry"; preview_title.current.update()
                if preview_type.current: preview_type.current.value = form_controls["entry_type"].value or "Not Selected"; preview_type.current.update()
                if preview_image.current:
                    src = form_controls["image_source"].value
                    if src and src.strip():
                        if src.lower().startswith(("http://", "https://")) or os.path.exists(src): preview_image.current.src = src
                        else: preview_image.current.src = config.DEFAULT_IMAGE_URL
                    else: preview_image.current.src = config.DEFAULT_IMAGE_URL
                    preview_image.current.update()
                if preview_date.current:
                    date_val = form_controls["date_display"].value
                    if date_val and date_val.strip():
                        try: preview_date.current.value = datetime.strptime(date_val, '%Y-%m-%d').strftime('%d %B %Y')
                        except ValueError: preview_date.current.value = "Invalid Date"
                    else: preview_date.current.value = "Not Set"
                    preview_date.current.update()
                if preview_score.current:
                    score_val = form_controls["score"].value
                    if score_val and score_val != "N/A": preview_score.current.value = f"{score_val}/10"
                    else: preview_score.current.value = "Not Rated"
                    preview_score.current.update()
                if preview_genre.current and "genre" in form_controls:
                    preview_genre.current.value = form_controls["genre"].value.strip() or "No Genre"
                    preview_genre.current.update()
            except Exception as ex: print(f"Preview update error: {ex}")
        
        def combined_type_change_handler(e):
            type_change_callback(e)
            update_previews(e)

        for ctrl_name, handler in [("name", update_previews), ("entry_type", combined_type_change_handler), ("image_source", update_previews), ("date_display", update_previews), ("score", update_previews), ("genre", update_previews)]:
            if form_controls.get(ctrl_name): form_controls[ctrl_name].on_change = handler

        def create_stat_display(icon, text_ref, label):
            return ft.Container(content=ft.Row([ft.Container(content=ft.Icon(icon, size=20, color=ft.colors.PRIMARY), padding=ft.padding.all(8), bgcolor=ft.colors.with_opacity(0.1, ft.colors.PRIMARY), border_radius=8), ft.Column([ft.Text(ref=text_ref, value="...", weight=ft.FontWeight.W_600, size=16), ft.Text(label, size=12, opacity=0.7, weight=ft.FontWeight.W_500)], spacing=2)], spacing=12, vertical_alignment=ft.CrossAxisAlignment.CENTER), padding=ft.padding.all(12), bgcolor=ft.colors.with_opacity(0.05, ft.colors.ON_SURFACE), border_radius=8, border=ft.border.all(1, ft.colors.with_opacity(0.1, ft.colors.OUTLINE)))
        
        left_panel = ft.Container(content=ft.Column([ft.Container(content=ft.Stack([ft.Container(content=ft.Image(ref=preview_image, src=config.DEFAULT_IMAGE_URL, fit=ft.ImageFit.COVER, width=float("inf"), height=280), clip_behavior=ft.ClipBehavior.ANTI_ALIAS, border_radius=12), ft.Container(gradient=ft.LinearGradient(begin=ft.alignment.top_center, end=ft.alignment.bottom_center, colors=[ft.colors.TRANSPARENT, ft.colors.with_opacity(0.8, ft.colors.BLACK)])), ft.Container(padding=ft.padding.all(24), alignment=ft.alignment.bottom_left, content=ft.Column([ft.Text(ref=preview_title, value="New Entry", size=24, weight=ft.FontWeight.BOLD, color=ft.colors.WHITE, max_lines=2, overflow=ft.TextOverflow.ELLIPSIS), ft.Container(content=ft.Text(ref=preview_type, value="Not Selected", size=14, weight=ft.FontWeight.W_500, color=ft.colors.WHITE70), padding=ft.padding.symmetric(horizontal=8, vertical=4), bgcolor=ft.colors.with_opacity(0.3, ft.colors.WHITE), border_radius=12)], spacing=8))]), shadow=ft.BoxShadow(blur_radius=10, color=ft.colors.with_opacity(0.2, ft.colors.BLACK), offset=ft.Offset(0, 4))), ft.Container(content=ft.Column([ft.Text("PREVIEW", size=12, weight=ft.FontWeight.BOLD, opacity=0.6), ft.Divider(height=1, opacity=0.3), create_stat_display(ft.icons.CALENDAR_TODAY_ROUNDED, preview_date, "Completion Date"), create_stat_display(ft.icons.STAR_ROUNDED, preview_score, "Rating"), create_stat_display(ft.icons.CATEGORY_ROUNDED, preview_genre, "Genre")], spacing=12), padding=ft.padding.all(20), expand=True)], spacing=20), width=400, bgcolor=ft.colors.SURFACE_VARIANT, border_radius=16, padding=ft.padding.all(20))
        
        def create_form_section(title, controls, icon=None):
            header = ft.Row([ft.Icon(icon, size=16, opacity=0.7), ft.Text(title, style=ft.TextThemeStyle.LABEL_LARGE, weight=ft.FontWeight.BOLD, opacity=0.8)], spacing=8) if icon else ft.Text(title, style=ft.TextThemeStyle.LABEL_LARGE, weight=ft.FontWeight.BOLD, opacity=0.8)
            return ft.Container(content=ft.Column([header, ft.Divider(height=1, opacity=0.2), *controls], spacing=8), margin=ft.margin.only(bottom=24))

        right_panel = ft.Container(content=ft.Column([ft.Container(content=ft.Row([ft.Icon(ft.icons.ADD_CIRCLE_OUTLINE, size=28, color=ft.colors.PRIMARY), ft.Column([ft.Text(title_text, style=ft.TextThemeStyle.HEADLINE_SMALL, weight=ft.FontWeight.BOLD), ft.Text("Fill in the details for your new entry", opacity=0.7, size=14)], spacing=2, expand=True)], spacing=12, vertical_alignment=ft.CrossAxisAlignment.CENTER), padding=ft.padding.only(bottom=20), border=ft.border.only(bottom=ft.BorderSide(1, ft.colors.with_opacity(0.1, ft.colors.OUTLINE)))), create_form_section("BASIC INFORMATION", [form_controls.get("name", ft.Container()), form_controls.get("entry_type", ft.Container()), form_controls.get("conditional_fields", ft.Container())], ft.icons.INFO_OUTLINE), create_form_section("MEDIA DETAILS", [form_controls.get("genre", ft.Container()), form_controls.get("image_source_row", ft.Container()), ft.Row([ft.Container(content=form_controls.get("date_display", ft.Container()), expand=True), form_controls.get("date_picker_button", ft.Container())], vertical_alignment=ft.CrossAxisAlignment.END), form_controls.get("score", ft.Container())], ft.icons.MOVIE_OUTLINED), create_form_section("NOTES & PREFERENCES", [form_controls.get("description_editor", ft.Container()), ft.Row([form_controls.get("rewatch", ft.Container()), form_controls.get("own_local_copy", ft.Container())], spacing=20)], ft.icons.EDIT_NOTE), ft.Container(content=ft.Row([ft.TextButton("Cancel", icon=ft.icons.CLOSE, on_click=close_callback), ft.ElevatedButton("Save Entry", icon=ft.icons.SAVE_OUTLINED, on_click=save_callback, style=ft.ButtonStyle(bgcolor=ft.colors.PRIMARY, color=ft.colors.ON_PRIMARY, padding=ft.padding.symmetric(horizontal=32, vertical=12)))], alignment=ft.MainAxisAlignment.END, spacing=12), padding=ft.padding.only(top=20), border=ft.border.only(top=ft.BorderSide(1, ft.colors.with_opacity(0.1, ft.colors.OUTLINE))))], scroll=ft.ScrollMode.ADAPTIVE, spacing=0), padding=ft.padding.all(32), expand=True)
        
        main_form_content = ft.Container(content=ft.Row(controls=[left_panel, right_panel], vertical_alignment=ft.CrossAxisAlignment.STRETCH, spacing=24), width=1200, height=min(850, self.page.window_height * 0.9 if self.page.window_height else 850), bgcolor=ft.colors.SURFACE, border_radius=20, shadow=ft.BoxShadow(blur_radius=30, color=ft.colors.with_opacity(0.15, ft.colors.BLACK), offset=ft.Offset(0, 10)), clip_behavior=ft.ClipBehavior.ANTI_ALIAS)
        
        overlay = ft.Stack(ref=self.form_overlay_container, controls=[ft.Container(bgcolor=ft.colors.with_opacity(0.7, ft.colors.BLACK), expand=True, on_click=close_callback), ft.Container(content=main_form_content, alignment=ft.alignment.center, expand=True), ft.Container(content=ft.IconButton(icon=ft.icons.CLOSE_ROUNDED, icon_color=ft.colors.WHITE, bgcolor=ft.colors.with_opacity(0.3, ft.colors.BLACK), tooltip="Close (Esc)", on_click=close_callback, icon_size=20), top=24, right=24)])
        
        if associated_picker: overlay._associated_date_picker = associated_picker
        update_previews()
        return overlay

    def show_description_dialog(self, jav_data):
        if (hasattr(self.page, '_dialog_is_opening') and self.page._dialog_is_opening) or (self.form_overlay_container.current and self.form_overlay_container.current in self.main_stack.current.controls): return
        self.page._dialog_is_opening = True
        dialog_overlay_ref = ft.Ref[ft.Container]()
        try:
            entry_name, entry_type, description_text = jav_data.get('name', 'Unknown Title'), jav_data.get('entry_type', 'Media'), jav_data.get('description') or "No description provided."
            def close_dialog(e=None):
                if dialog_overlay_ref.current and dialog_overlay_ref.current in self.main_stack.current.controls:
                    self.main_stack.current.controls.remove(dialog_overlay_ref.current)
                    self.main_stack.current.update()
            header = ft.Container(content=ft.Column([ft.Row([ft.Container(content=ft.Icon(get_entry_type_icon_name(entry_type), size=28, color=ft.colors.PRIMARY), bgcolor=ft.colors.with_opacity(0.1, ft.colors.PRIMARY), padding=12, border_radius=12), ft.Column([ft.Text(entry_name, style=ft.TextThemeStyle.TITLE_LARGE, weight=ft.FontWeight.W_600, max_lines=2), ft.Container(content=ft.Text(entry_type, size=14, color=ft.colors.PRIMARY, weight=ft.FontWeight.W_500), bgcolor=ft.colors.with_opacity(0.08, ft.colors.PRIMARY), padding=ft.padding.symmetric(horizontal=12, vertical=6), border_radius=16, margin=ft.margin.only(top=4))], spacing=8, tight=True, expand=True)], spacing=16, vertical_alignment=ft.CrossAxisAlignment.START), ft.Container(height=1, bgcolor=ft.colors.with_opacity(0.12, ft.colors.ON_SURFACE), margin=ft.margin.symmetric(vertical=20))]), padding=24, bgcolor=ft.colors.with_opacity(0.02, ft.colors.PRIMARY))
            description_content = ft.Container(content=ft.Markdown(value=description_text, selectable=True, extension_set=ft.MarkdownExtensionSet.GITHUB_WEB, code_theme="atom-one-dark", on_tap_link=lambda e: self.page.launch_url(e.data)), padding=ft.padding.symmetric(horizontal=24, vertical=16), margin=ft.margin.only(bottom=8))
            scrollable_content = ft.Container(content=ft.Column(controls=[description_content], scroll=ft.ScrollMode.ADAPTIVE, tight=True), height=min(400, self.page.window_height * 0.5 if self.page.window_height else 400))
            close_button = ft.Container(content=ft.ElevatedButton(text="Close", icon=ft.icons.CLOSE_ROUNDED, on_click=close_dialog), alignment=ft.alignment.center_right, padding=ft.padding.only(right=24, bottom=20, top=16))
            dialog_content = ft.Container(content=ft.Column([header, scrollable_content, close_button], spacing=0, tight=True), width=min(600, self.page.window_width * 0.8 if self.page.window_width else 600), bgcolor=ft.colors.SURFACE, border_radius=20, shadow=ft.BoxShadow(blur_radius=24, color=ft.colors.with_opacity(0.15, ft.colors.BLACK), offset=ft.Offset(0, 8)), on_click=lambda e: None)
            dialog_overlay = ft.Container(ref=dialog_overlay_ref, content=dialog_content, alignment=ft.alignment.center, bgcolor=ft.colors.with_opacity(0.5, ft.colors.BLACK), expand=True, on_click=close_dialog)
            self.main_stack.current.controls.append(dialog_overlay)
            self.main_stack.current.update()
        finally:
            self.page._dialog_is_opening = False

    def open_add_jav_dialog(self, e=None, initial_data=None, backlog_item_id=None):
        if initial_data is None:
            initial_data = {}

        name_field = ft.TextField(label="Title", autofocus=True, capitalization=ft.TextCapitalization.WORDS, value=initial_data.get('name', ''))
        conditional_fields_container = ft.Column(spacing=12, tight=True)
        
        def on_type_change_add(e): 
            update_conditional_fields(e.control.value, conditional_fields_container)
        
        entry_type_dropdown = ft.Dropdown(label="Entry Type", options=config.ENTRY_TYPE_OPTIONS, hint_text="Select the type of media", value=initial_data.get('entry_type'))
        if initial_data.get('entry_type'):
            update_conditional_fields(initial_data['entry_type'], conditional_fields_container, initial_data=initial_data)

        image_source_field = ft.TextField(label="Image Source (URL or Local Path)", hint_text="e.g., https://... or C:\\path\\to\\image.jpg", expand=True, value=initial_data.get('image_url', ''))
        
        def browse_for_image_add(e):
            self._target_image_field_for_picker = image_source_field
            self.image_file_picker.pick_files(dialog_title="Select Image", allow_multiple=False, allowed_extensions=["jpg", "jpeg", "png", "gif", "bmp", "webp"])
        
        image_source_row = ft.Row([image_source_field, ft.IconButton(icon=ft.icons.FOLDER_OPEN_OUTLINED, tooltip="Browse for local image", on_click=browse_for_image_add)], vertical_alignment=ft.CrossAxisAlignment.END)
        genre_field = ft.TextField(label="Genres (comma-separated)", hint_text="e.g., Action, Drama", capitalization=ft.TextCapitalization.WORDS)
        date_display_field = ft.TextField(label="Completion Date", read_only=True, hint_text="Click calendar to select...")
        add_date_picker = ft.DatePicker(on_change=lambda e: handle_date_change(e, date_display_field), help_text="Select Completion Date")
        self.page.overlay.append(add_date_picker)
        
        def handle_date_change(e, target_field):
            if target_field and e.control.value:
                target_field.value = e.control.value.strftime('%Y-%m-%d')
                if hasattr(target_field, 'on_change') and callable(target_field.on_change): target_field.on_change(e)
                if target_field.page: target_field.update()
        
        date_picker_button = ft.IconButton(icon=ft.icons.CALENDAR_MONTH, tooltip="Select Date", on_click=lambda e: (setattr(add_date_picker, 'open', True), self.page.update()))
        
        description_editor, description_field_ref = create_markdown_editor(initial_value=initial_data.get('notes', ''))
        
        score_dropdown = ft.Dropdown(label="Score", width=110, options=[ft.dropdown.Option("N/A")] + [ft.dropdown.Option(str(i)) for i in range(10, -1, -1)], value="N/A")
        rewatch_check = ft.Checkbox(label="This was a Rewatch", value=False)
        own_local_copy_check = ft.Checkbox(label="Own Local Copy?", value=False)

        def save_new_jav(e):
            name, entry_type_val, image_source_input, genre_input_str, date_str, score_str, description, is_rewatch, own_local_copy = name_field.value.strip(), entry_type_dropdown.value, image_source_field.value.strip(), genre_field.value.strip(), date_display_field.value.strip(), score_dropdown.value, description_field_ref.current.value.strip(), rewatch_check.value, own_local_copy_check.value
            errors = []
            for field in [name_field, date_display_field, score_dropdown, entry_type_dropdown, image_source_field]: field.error_text = None
            if not name: errors.append("Title is required."); name_field.error_text = "Required"
            if not entry_type_val: errors.append("Entry Type is required."); entry_type_dropdown.error_text = "Required"
            if not date_str: errors.append("Completion Date is required."); date_display_field.error_text = "Required"
            score_int = None
            if score_str and score_str != "N/A":
                try: score_int = int(score_str)
                except ValueError: errors.append("Invalid score."); score_dropdown.error_text = "Invalid"
            if errors:
                for field in [name_field, entry_type_dropdown, image_source_field, date_display_field, score_dropdown]:
                    if field.page: field.update()
                self.show_snackbar("Please fix errors: " + " ".join(errors), color=ft.colors.ERROR_CONTAINER)
                return

            final_image_ref_for_db = self.process_and_copy_image(image_source_input)
            conditional_data = get_data_from_conditional_fields(conditional_fields_container)
            database.add_jav_db(name, genre_input_str, date_str, score_int, description, is_rewatch, own_local_copy, final_image_ref_for_db, entry_type_val, conditional_data)
            
            if backlog_item_id:
                database.delete_backlog_item_db(backlog_item_id)
                self.show_snackbar(f"Moved '{name}' from backlog to log!")
            else:
                self.show_snackbar(f"Added '{name}'")

            self.close_form_overlay()
            self.refresh_current_view()
            current_stats_filter = list(self.stats_year_filter.current.selected)[0] if self.stats_year_filter.current and self.stats_year_filter.current.selected else "All Time"
            self.page.run_thread(self.calculate_and_update_stats_display, current_stats_filter)

        form_controls_dict = {"name": name_field, "entry_type": entry_type_dropdown, "conditional_fields": conditional_fields_container, "genre": genre_field, "image_source": image_source_field, "image_source_row": image_source_row, "date_display": date_display_field, "date_picker_button": date_picker_button, "score": score_dropdown, "description_editor": description_editor, "rewatch": rewatch_check, "own_local_copy": own_local_copy_check}
        form_view = self.build_form_view("Add New Entry", form_controls_dict, save_new_jav, self.close_form_overlay, on_type_change_add, add_date_picker)
        if self.form_overlay_container.current and self.form_overlay_container.current in self.main_stack.current.controls: self.close_form_overlay()
        self.main_stack.current.controls.append(form_view)
        self.main_stack.current.update()

    def open_edit_jav_dialog(self, jav_data_to_edit, list_refresh_callback):
        jav_id = jav_data_to_edit['id']
        name_field = ft.TextField(label="Title", autofocus=True, capitalization=ft.TextCapitalization.WORDS, value=jav_data_to_edit.get('name', ''))
        conditional_fields_container = ft.Column(spacing=12, tight=True)
        def on_type_change_edit(e): update_conditional_fields(e.control.value, conditional_fields_container, jav_data_to_edit)
        entry_type_dropdown = ft.Dropdown(label="Entry Type", options=config.ENTRY_TYPE_OPTIONS, value=jav_data_to_edit.get('entry_type'))
        update_conditional_fields(jav_data_to_edit.get('entry_type'), conditional_fields_container, initial_data=jav_data_to_edit)
        image_source_field = ft.TextField(label="Image Source (URL or Local Path)", value=jav_data_to_edit.get('image_url', ''), expand=True, hint_text="e.g., https://... or C:\\path\\to\\image.jpg or images/file.jpg")
        def browse_for_image_edit(e):
            self._target_image_field_for_picker = image_source_field
            self.image_file_picker.pick_files(dialog_title="Select Image", allow_multiple=False, allowed_extensions=["jpg", "jpeg", "png", "gif", "bmp", "webp"])
        image_source_row = ft.Row([image_source_field, ft.IconButton(icon=ft.icons.FOLDER_OPEN_OUTLINED, tooltip="Browse for local image", on_click=browse_for_image_edit)], vertical_alignment=ft.CrossAxisAlignment.END)
        genre_field = ft.TextField(label="Genres (comma-separated)", hint_text="e.g., Action, Drama", capitalization=ft.TextCapitalization.WORDS, value=jav_data_to_edit.get('genre', '') or '')
        initial_date_str = jav_data_to_edit.get('completion_date', '')
        date_display_field = ft.TextField(label="Completion Date", read_only=True, hint_text="Click calendar to select...", value=initial_date_str)
        initial_picker_date = datetime.strptime(initial_date_str, '%Y-%m-%d') if initial_date_str else None
        edit_date_picker = ft.DatePicker(on_change=lambda e: handle_date_change(e, date_display_field), help_text="Select Completion Date", value=initial_picker_date)
        self.page.overlay.append(edit_date_picker)
        def handle_date_change(e, target_field):
            if target_field and e.control.value:
                target_field.value = e.control.value.strftime('%Y-%m-%d')
                if hasattr(target_field, 'on_change') and callable(target_field.on_change): target_field.on_change(e)
                if target_field.page: target_field.update()
        date_picker_button = ft.IconButton(icon=ft.icons.CALENDAR_MONTH, tooltip="Select Date", on_click=lambda e: (setattr(edit_date_picker, 'open', True), self.page.update()))
        score_dropdown = ft.Dropdown(label="Score", width=110, options=[ft.dropdown.Option("N/A")] + [ft.dropdown.Option(str(i)) for i in range(10, -1, -1)], value=str(jav_data_to_edit.get('review_score')) if jav_data_to_edit.get('review_score') is not None else "N/A")
        description_editor, description_field_ref = create_markdown_editor(initial_value=jav_data_to_edit.get('description', '') or '')
        rewatch_check = ft.Checkbox(label="This was a Rewatch", value=jav_data_to_edit.get('is_rewatch') == 1)
        own_local_copy_check = ft.Checkbox(label="Own Local Copy?", value=jav_data_to_edit.get('own_local_copy') == 1)

        def save_edited_jav(e):
            name, entry_type_val, image_source_input, genre_input_str, date_str, score_str, description, is_rewatch, own_local_copy = name_field.value.strip(), entry_type_dropdown.value, image_source_field.value.strip(), genre_field.value.strip(), date_display_field.value.strip(), score_dropdown.value, description_field_ref.current.value.strip(), rewatch_check.value, own_local_copy_check.value
            if not name or not entry_type_val or not date_str:
                self.show_snackbar("Title, Entry Type, and Completion Date are required.", color=ft.colors.ERROR_CONTAINER)
                return
            score_int = None
            if score_str and score_str != "N/A":
                try: score_int = int(score_str)
                except ValueError: self.show_snackbar("Invalid score.", color=ft.colors.ERROR_CONTAINER); return
            
            final_image_ref_for_db = jav_data_to_edit.get('image_url')
            if image_source_input != jav_data_to_edit.get('image_url'):
                if not image_source_input: final_image_ref_for_db = None
                elif image_source_input.lower().startswith(("http://", "https://")) or image_source_input.startswith("images/"): final_image_ref_for_db = image_source_input
                else: final_image_ref_for_db = self.process_and_copy_image(image_source_input)
            
            conditional_data = get_data_from_conditional_fields(conditional_fields_container)
            database.update_jav_db(jav_id, name, genre_input_str, date_str, score_int, description, is_rewatch, own_local_copy, final_image_ref_for_db, entry_type_val, conditional_data)
            self.show_snackbar(f"Updated '{name}'")
            self.close_form_overlay()
            list_refresh_callback()
            current_stats_filter = list(self.stats_year_filter.current.selected)[0] if self.stats_year_filter.current and self.stats_year_filter.current.selected else "All Time"
            self.page.run_thread(self.calculate_and_update_stats_display, current_stats_filter)

        form_controls_dict = {"name": name_field, "entry_type": entry_type_dropdown, "conditional_fields": conditional_fields_container, "genre": genre_field, "image_source": image_source_field, "image_source_row": image_source_row, "date_display": date_display_field, "date_picker_button": date_picker_button, "score": score_dropdown, "description_editor": description_editor, "rewatch": rewatch_check, "own_local_copy": own_local_copy_check}
        form_view = self.build_form_view("Edit Entry", form_controls_dict, save_edited_jav, self.close_form_overlay, on_type_change_edit, edit_date_picker)
        if self.form_overlay_container.current and self.form_overlay_container.current in self.main_stack.current.controls: self.close_form_overlay()
        self.main_stack.current.controls.append(form_view)
        self.main_stack.current.update()

    def open_add_backlog_dialog(self, e=None):
        """Enhanced add backlog dialog with better styling and validation."""
        name_field = ft.TextField(
            label="Title", 
            autofocus=True, 
            capitalization=ft.TextCapitalization.WORDS,
            border_radius=ft.border_radius.all(12),
            filled=True,
            prefix_icon=ft.icons.TITLE_ROUNDED
        )
        
        entry_type_dropdown = ft.Dropdown(
            label="Entry Type", 
            options=config.ENTRY_TYPE_OPTIONS, 
            hint_text="Select the type of media",
            border_radius=ft.border_radius.all(12),
            filled=True
        )
        
        source_field = ft.TextField(
            label="Source / Recommendation", 
            hint_text="e.g., Friend, YouTube, Steam", 
            capitalization=ft.TextCapitalization.SENTENCES,
            border_radius=ft.border_radius.all(12),
            filled=True,
            prefix_icon=ft.icons.PERSON_ROUNDED
        )
        
        notes_field = ft.TextField(
            label="Notes", 
            hint_text="Why do you want to watch/play this?", 
            multiline=True, 
            min_lines=3, 
            max_lines=5, 
            capitalization=ft.TextCapitalization.SENTENCES,
            border_radius=ft.border_radius.all(12),
            filled=True
        )
        
        image_source_field = ft.TextField(
            label="Image URL (Optional)", 
            hint_text="https://example.com/image.jpg",
            border_radius=ft.border_radius.all(12),
            filled=True,
            prefix_icon=ft.icons.IMAGE_ROUNDED
        )

        # Enhanced dialog
        add_dialog = ft.AlertDialog(
            modal=True,
            shape=ft.RoundedRectangleBorder(radius=20),
            bgcolor=ft.colors.SURFACE,
            surface_tint_color=ft.colors.PRIMARY
        )

        def close_dialog(e):
            add_dialog.open = False
            self.page.update()

        def save_new_backlog_item(e):
            name = name_field.value.strip()
            if not name:
                name_field.error_text = "Title is required."
                name_field.update()
                return
            
            # Clear any previous errors
            name_field.error_text = None
            name_field.update()
            
            final_image_ref = self.process_and_copy_image(image_source_field.value)
            database.add_backlog_item_db(
                name,
                entry_type_dropdown.value,
                source_field.value,
                notes_field.value,
                final_image_ref
            )
            self.show_snackbar(f"✅ Added '{name}' to backlog.")
            close_dialog(e)
            self.refresh_current_view()

        add_dialog.title = ft.Row([
            ft.Icon(ft.icons.ADD_CIRCLE_ROUNDED, color=ft.colors.PRIMARY, size=28),
            ft.Text("Add to Backlog", style=ft.TextThemeStyle.HEADLINE_SMALL, weight=ft.FontWeight.W_600)
        ], spacing=12)
        
        add_dialog.content = ft.Container(
            content=ft.Column(
                controls=[name_field, entry_type_dropdown, source_field, notes_field, image_source_field],
                spacing=20, 
                tight=True, 
                scroll=ft.ScrollMode.ADAPTIVE
            ),
            width=450,
            height=480,
            padding=ft.padding.symmetric(horizontal=4)
        )
        
        add_dialog.actions = [
            ft.TextButton(
                "Cancel", 
                on_click=close_dialog,
                style=ft.ButtonStyle(
                    shape=ft.RoundedRectangleBorder(radius=12),
                    padding=ft.padding.symmetric(horizontal=20, vertical=12)
                )
            ),
            ft.ElevatedButton(
                "Add to Backlog", 
                on_click=save_new_backlog_item,
                icon=ft.icons.ADD_ROUNDED,
                style=ft.ButtonStyle(
                    shape=ft.RoundedRectangleBorder(radius=12),
                    padding=ft.padding.symmetric(horizontal=20, vertical=12),
                    bgcolor=ft.colors.PRIMARY,
                    color=ft.colors.ON_PRIMARY
                )
            ),
        ]
        add_dialog.actions_alignment = ft.MainAxisAlignment.END
        add_dialog.on_dismiss = lambda e: self.page.overlay.remove(add_dialog)

        self.page.overlay.append(add_dialog)
        add_dialog.open = True
        self.page.update()

    def open_edit_backlog_dialog(self, item_data):
        """Enhanced edit backlog dialog with better styling."""
        item_id = item_data['id']
        
        name_field = ft.TextField(
            label="Title", 
            capitalization=ft.TextCapitalization.WORDS, 
            value=item_data.get('name', ''),
            border_radius=ft.border_radius.all(12),
            filled=True,
            prefix_icon=ft.icons.TITLE_ROUNDED
        )
        
        entry_type_dropdown = ft.Dropdown(
            label="Entry Type", 
            options=config.ENTRY_TYPE_OPTIONS, 
            value=item_data.get('entry_type'),
            border_radius=ft.border_radius.all(12),
            filled=True
        )
        
        source_field = ft.TextField(
            label="Source / Recommendation", 
            capitalization=ft.TextCapitalization.SENTENCES, 
            value=item_data.get('source', ''),
            border_radius=ft.border_radius.all(12),
            filled=True,
            prefix_icon=ft.icons.PERSON_ROUNDED
        )
        
        notes_field = ft.TextField(
            label="Notes", 
            multiline=True, 
            min_lines=3, 
            max_lines=5, 
            capitalization=ft.TextCapitalization.SENTENCES, 
            value=item_data.get('notes', ''),
            border_radius=ft.border_radius.all(12),
            filled=True
        )
        
        image_source_field = ft.TextField(
            label="Image URL (Optional)", 
            value=item_data.get('image_url', ''),
            border_radius=ft.border_radius.all(12),
            filled=True,
            prefix_icon=ft.icons.IMAGE_ROUNDED
        )

        edit_dialog = ft.AlertDialog(
            modal=True,
            shape=ft.RoundedRectangleBorder(radius=20),
            bgcolor=ft.colors.SURFACE,
            surface_tint_color=ft.colors.PRIMARY
        )

        def close_dialog(e):
            edit_dialog.open = False
            self.page.update()

        def save_edited_backlog_item(e):
            name = name_field.value.strip()
            if not name:
                name_field.error_text = "Title is required."
                name_field.update()
                return
            
            name_field.error_text = None
            name_field.update()
            
            final_image_ref = item_data.get('image_url')
            if image_source_field.value != item_data.get('image_url'):
                final_image_ref = self.process_and_copy_image(image_source_field.value)

            database.update_backlog_item_db(
                item_id, name, entry_type_dropdown.value, source_field.value, notes_field.value, final_image_ref
            )
            self.show_snackbar(f"✅ Updated '{name}' in backlog.")
            close_dialog(e)
            self.refresh_current_view()

        edit_dialog.title = ft.Row([
            ft.Icon(ft.icons.EDIT_ROUNDED, color=ft.colors.BLUE_600, size=28),
            ft.Text("Edit Backlog Item", style=ft.TextThemeStyle.HEADLINE_SMALL, weight=ft.FontWeight.W_600)
        ], spacing=12)
        
        edit_dialog.content = ft.Container(
            content=ft.Column(
                controls=[name_field, entry_type_dropdown, source_field, notes_field, image_source_field],
                spacing=20, 
                tight=True, 
                scroll=ft.ScrollMode.ADAPTIVE
            ),
            width=450,
            height=480,
            padding=ft.padding.symmetric(horizontal=4)
        )
        
        edit_dialog.actions = [
            ft.TextButton(
                "Cancel", 
                on_click=close_dialog,
                style=ft.ButtonStyle(
                    shape=ft.RoundedRectangleBorder(radius=12),
                    padding=ft.padding.symmetric(horizontal=20, vertical=12)
                )
            ),
            ft.ElevatedButton(
                "Save Changes", 
                on_click=save_edited_backlog_item,
                icon=ft.icons.SAVE_ROUNDED,
                style=ft.ButtonStyle(
                    shape=ft.RoundedRectangleBorder(radius=12),
                    padding=ft.padding.symmetric(horizontal=20, vertical=12),
                    bgcolor=ft.colors.BLUE_600,
                    color=ft.colors.WHITE
                )
            ),
        ]
        edit_dialog.actions_alignment = ft.MainAxisAlignment.END
        edit_dialog.on_dismiss = lambda e: self.page.overlay.remove(edit_dialog)

        self.page.overlay.append(edit_dialog)
        edit_dialog.open = True
        self.page.update()

    def handle_complete_backlog_item(self, item_data):
        """Handle completing a backlog item."""
        self.open_add_jav_dialog(initial_data=item_data, backlog_item_id=item_data['id'])

    # --- ENHANCED: Main Backlog View ---
    def build_backlog_view(self):
        """Enhanced backlog view with modern design and animations."""
        backlog_list_view_ref = ft.Ref[ft.ListView]()

        def refresh_view_content():
            list_view = backlog_list_view_ref.current
            if not list_view: return
            list_view.controls.clear()
            
            all_items = database.get_all_backlog_items_db()
            selected_types = self.app_state["backlog_view_selected_entry_types"]
            filtered_items = [item for item in all_items if item.get('entry_type') in selected_types]

            if not filtered_items:
                # Enhanced empty state
                empty_state = ft.Container(
                    content=ft.Column([
                        ft.Icon(
                            ft.icons.MOVIE_FILTER_ROUNDED, 
                            size=64, 
                            color=ft.colors.with_opacity(0.4, ft.colors.ON_SURFACE)
                        ),
                        ft.Text(
                            "Your backlog is empty!", 
                            style=ft.TextThemeStyle.HEADLINE_SMALL,
                            weight=ft.FontWeight.W_600,
                            color=ft.colors.ON_SURFACE,
                            text_align=ft.TextAlign.CENTER
                        ),
                        ft.Text(
                            "Add movies, shows, games, and more to keep track of what you want to experience next.",
                            style=ft.TextThemeStyle.BODY_MEDIUM,
                            color=ft.colors.ON_SURFACE_VARIANT,
                            text_align=ft.TextAlign.CENTER,
                            width=300
                        ),
                        ft.ElevatedButton(
                            "Add Your First Item",
                            icon=ft.icons.ADD_ROUNDED,
                            on_click=self.open_add_backlog_dialog,
                            style=ft.ButtonStyle(
                                shape=ft.RoundedRectangleBorder(radius=16),
                                padding=ft.padding.symmetric(horizontal=24, vertical=12),
                                bgcolor=ft.colors.PRIMARY,
                                color=ft.colors.ON_PRIMARY
                            )
                        )
                    ], 
                    horizontal_alignment=ft.CrossAxisAlignment.CENTER,
                    spacing=16),
                    alignment=ft.alignment.center,
                    padding=40,
                    expand=True
                )
                list_view.controls.append(empty_state)
            else:
                # Add items with staggered animation
                for i, item in enumerate(filtered_items):
                    item_widget = create_backlog_list_item(
                        self.page, item,
                        self.handle_complete_backlog_item,
                        self.open_edit_backlog_dialog,
                        delete_backlog_item_action
                    )
                    # Add slight delay for staggered animation effect
                    item_widget.animate_opacity = ft.animation.Animation(
                        duration=300 + (i * 50), 
                        curve=ft.AnimationCurve.EASE_OUT_CUBIC
                    )
                    list_view.controls.append(item_widget)
                    
            if list_view.page: list_view.update()

        def on_backlog_view_filter_change():
            refresh_view_content()
            database.set_setting_db(
                config.SAVED_BACKLOG_VIEW_FILTER_KEY, 
                ",".join(sorted(list(self.app_state["backlog_view_selected_entry_types"])))
            )

        def delete_backlog_item_action(item_id, item_name):
            database.delete_backlog_item_db(item_id)
            self.show_snackbar(f"🗑️ Removed '{item_name}' from backlog.")
            refresh_view_content()

        # Enhanced filter button
        filter_button_ui = create_entry_type_filter_button_with_sheet(
            self.page, config.ALL_ENTRY_TYPES_STR, self.app_state["backlog_view_selected_entry_types"],
            on_backlog_view_filter_change, button_label_prefix="Filter Backlog"
        )
        
        # Enhanced header with gradient background
        header_container = ft.Container(
            content=ft.Row([
                ft.Column([
                    ft.Row([
                        ft.Icon(ft.icons.LIST_ALT_ROUNDED, size=32, color=ft.colors.PRIMARY),
                        ft.Text(
                            "Media Backlog", 
                            style=ft.TextThemeStyle.HEADLINE_MEDIUM,
                            weight=ft.FontWeight.W_700,
                            color=ft.colors.ON_SURFACE
                        )
                    ], spacing=12, vertical_alignment=ft.CrossAxisAlignment.CENTER),
                    ft.Text(
                        f"{len(database.get_all_backlog_items_db())} items waiting to be discovered",
                        style=ft.TextThemeStyle.BODY_MEDIUM,
                        color=ft.colors.ON_SURFACE_VARIANT
                    )
                ], spacing=4),
                ft.Row([
                    filter_button_ui,
                    ft.ElevatedButton(
                        "Add Item",
                        icon=ft.icons.ADD_ROUNDED,
                        on_click=self.open_add_backlog_dialog,
                        style=ft.ButtonStyle(
                            shape=ft.RoundedRectangleBorder(radius=16),
                            padding=ft.padding.symmetric(horizontal=20, vertical=12),
                            bgcolor=ft.colors.PRIMARY,
                            color=ft.colors.ON_PRIMARY,
                            elevation=2
                        )
                    )
                ], spacing=12)
            ], alignment=ft.MainAxisAlignment.SPACE_BETWEEN),
            padding=ft.padding.only(left=24, right=24, top=20, bottom=16),
            gradient=ft.LinearGradient(
                colors=[
                    ft.colors.with_opacity(0.02, ft.colors.PRIMARY),
                    ft.colors.TRANSPARENT
                ],
                begin=ft.alignment.top_center,
                end=ft.alignment.bottom_center
            )
        )
        
        # Enhanced list view with better scrolling
        backlog_list_view = ft.ListView(
            ref=backlog_list_view_ref, 
            expand=True, 
            spacing=0, 
            padding=ft.padding.only(bottom=24),
            auto_scroll=False
        )
        
        refresh_view_content()

        # Return enhanced layout
        return ft.Column(
            expand=True,
            spacing=0,
            controls=[
                header_container,
                ft.Divider(height=1, color=ft.colors.with_opacity(0.12, ft.colors.ON_SURFACE)),
                backlog_list_view
            ]
        )

    def build_year_view(self, year_str):
        year_grid_view_ref = ft.Ref[ft.GridView]()
        def refresh_view_content():
            grid_view = year_grid_view_ref.current
            if not grid_view: return
            grid_view.controls.clear()
            javs = database.get_javs_by_year_db(int(year_str))
            filtered_javs = [jav for jav in javs if jav.get('entry_type') in self.app_state["year_view_selected_entry_types"]]
            if not filtered_javs:
                grid_view.controls.append(ft.Container(content=ft.Text(f"No entries for {year_str} match the selected filters.", italic=True, text_align=ft.TextAlign.CENTER, size=16), alignment=ft.alignment.center, padding=30, expand=True))
            else:
                for jav_item in filtered_javs:
                    grid_view.controls.append(create_gallery_card(self.page, jav_item, delete_jav_action, open_edit_jav_dialog_wrapper, self.show_description_dialog))
            if grid_view.page: grid_view.update()

        def on_year_view_filter_change():
            refresh_view_content()
            database.set_setting_db(config.SAVED_YEAR_VIEW_FILTER_KEY, ",".join(sorted(list(self.app_state["year_view_selected_entry_types"]))))

        def delete_jav_action(jav_id, jav_name):
            jav_to_delete = next((j for j in database.get_all_javs_db() if j['id'] == jav_id), None)
            database.delete_jav_db(jav_id)
            if jav_to_delete and jav_to_delete.get('image_url') and jav_to_delete['image_url'].startswith("images/"):
                full_image_path = os.path.join(config.ASSETS_DIR, jav_to_delete['image_url'])
                if os.path.exists(full_image_path):
                    try: os.remove(full_image_path); self.show_snackbar(f"Deleted '{jav_name}' and its local image.")
                    except OSError as e: self.show_snackbar(f"Deleted '{jav_name}', but failed to delete image: {e}", color=ft.colors.WARNING_CONTAINER)
                else: self.show_snackbar(f"Deleted '{jav_name}'.")
            else: self.show_snackbar(f"Deleted '{jav_name}'.")
            refresh_view_content()
            current_stats_filter = list(self.stats_year_filter.current.selected)[0] if self.stats_year_filter.current and self.stats_year_filter.current.selected else "All Time"
            self.page.run_thread(self.calculate_and_update_stats_display, current_stats_filter)

        def open_edit_jav_dialog_wrapper(jav_item_data):
            self.open_edit_jav_dialog(jav_item_data, refresh_view_content)
        
        filter_button_ui = create_entry_type_filter_button_with_sheet(self.page, config.ALL_ENTRY_TYPES_STR, self.app_state["year_view_selected_entry_types"], on_year_view_filter_change, button_label_prefix="Filter Entries")
        year_grid_view = ft.GridView(ref=year_grid_view_ref, expand=True, runs_count=5, max_extent=270, child_aspect_ratio=0.55, spacing=10, run_spacing=10, padding=10)
        refresh_view_content()
        return ft.Column(expand=True, controls=[ft.Container(content=ft.Row([filter_button_ui], alignment=ft.MainAxisAlignment.END), padding=ft.padding.only(left=10, right=10, top=10, bottom=5)), year_grid_view])

    def build_search_view(self):
        search_task = None
        async def on_search_text_change(e):
            nonlocal search_task
            if search_task: search_task.cancel()
            async def debounced_search_job():
                try:
                    await asyncio.sleep(0.4)
                    perform_search()
                except asyncio.CancelledError: pass
            search_task = asyncio.create_task(debounced_search_job())

        def perform_search():
            search_term = self.search_text_field.current.value.strip() if self.search_text_field.current else ""
            selected_entry_types = list(self.app_state["search_view_selected_entry_types"]) if self.app_state["search_view_selected_entry_types"] else None
            self.app_state["search_results"] = database.search_javs_db(search_term, list(self.app_state["search_selected_fields"]), selected_entry_types)
            self.app_state["current_search_term"] = search_term
            refresh_search_results()
        
        def refresh_search_results():
            grid_view, count_text = self.search_results_grid.current, self.search_results_count_text.current
            if not grid_view: return
            grid_view.controls.clear()
            results, search_term = self.app_state["search_results"], self.app_state["current_search_term"]
            if count_text:
                count_text.value = f"Found {len(results)} result{'s' if len(results) != 1 else ''} for '{search_term}'" if search_term else "Enter a search term to find entries"
                if count_text.page: count_text.update()
            if not search_term:
                grid_view.controls.append(ft.Container(content=ft.Column([ft.Icon(ft.icons.SEARCH_OUTLINED, size=64), ft.Text("Enter a search term to find entries", size=16)], horizontal_alignment=ft.CrossAxisAlignment.CENTER), alignment=ft.alignment.center, expand=True))
            elif not results:
                grid_view.controls.append(ft.Container(content=ft.Column([ft.Icon(ft.icons.SEARCH_OFF_OUTLINED, size=64), ft.Text(f"No results found for '{search_term}'", size=16)], horizontal_alignment=ft.CrossAxisAlignment.CENTER), alignment=ft.alignment.center, expand=True))
            else:
                for jav_item in results:
                    grid_view.controls.append(create_gallery_card(self.page, jav_item, delete_jav_action_search, open_edit_jav_dialog_wrapper_search, self.show_description_dialog))
            if grid_view.page: grid_view.update()
        
        def delete_jav_action_search(jav_id, jav_name):
            database.delete_jav_db(jav_id)
            self.show_snackbar(f"Deleted '{jav_name}'")
            perform_search()
            current_stats_filter = list(self.stats_year_filter.current.selected)[0] if self.stats_year_filter.current and self.stats_year_filter.current.selected else "All Time"
            self.page.run_thread(self.calculate_and_update_stats_display, current_stats_filter)

        def open_edit_jav_dialog_wrapper_search(jav_item_data):
            self.open_edit_jav_dialog(jav_item_data, perform_search)

        def on_search_entry_type_filter_change():
            perform_search()
            database.set_setting_db(config.SAVED_SEARCH_VIEW_FILTER_KEY, ",".join(sorted(list(self.app_state["search_view_selected_entry_types"]))))

        search_entry_type_filter_button = create_entry_type_filter_button_with_sheet(self.page, config.ALL_ENTRY_TYPES_STR, self.app_state["search_view_selected_entry_types"], on_search_entry_type_filter_change, button_label_prefix="Filter Types")
        search_fields_filter_button = create_search_fields_filter_button_with_sheet(self.page, config.SEARCH_FIELD_OPTIONS, self.app_state["search_selected_fields"], perform_search, button_label_prefix="Search In")
        
        refresh_search_results()
        return ft.Column(expand=True, controls=[ft.Container(content=ft.Row([ft.TextField(ref=self.search_text_field, label="Search entries...", prefix_icon=ft.icons.SEARCH_ROUNDED, on_change=on_search_text_change, expand=True, autofocus=True), ft.IconButton(icon=ft.icons.CLEAR_ROUNDED, on_click=lambda e: (setattr(self.search_text_field.current, 'value', ''), self.search_text_field.current.update(), perform_search()))]), padding=10), ft.Container(content=ft.Row([search_fields_filter_button, search_entry_type_filter_button]), padding=ft.padding.only(left=10, right=10, bottom=5)), ft.Container(content=ft.Text(ref=self.search_results_count_text, value=""), padding=ft.padding.symmetric(horizontal=10)), ft.GridView(ref=self.search_results_grid, expand=True, runs_count=5, max_extent=270, child_aspect_ratio=0.55, spacing=10, run_spacing=10, padding=10)])

    def calculate_and_update_stats_display(self, filter_year="All Time"):
        base_jav_data = database.get_all_javs_db() if filter_year == "All Time" else database.get_javs_by_year_db(int(filter_year))
        jav_data = [jav for jav in base_jav_data if jav.get('entry_type') in self.app_state["stats_view_selected_entry_types"]]
        
        total_javs = len(jav_data)
        valid_scores = [g['review_score'] for g in jav_data if g.get('review_score') is not None]
        average_score = (sum(valid_scores) / len(valid_scores)) if valid_scores else 0.0
        total_rewatches = sum(1 for g in jav_data if g.get('is_rewatch') == 1)
        
        all_genres = [genre for g in jav_data for genre in utils.parse_genres(g.get('genre'))]
        unique_genres_count = len(set(all_genres))
        
        genre_pie_sections, genre_legend_items = utils._generate_pie_data_from_list(all_genres, [ft.colors.BLUE_500, ft.colors.GREEN_500, ft.colors.RED_500, ft.colors.YELLOW_500, ft.colors.PURPLE_500])
        
        platforms = [jav['platform'] for jav in jav_data if jav.get('entry_type') == 'Game' and jav.get('platform')]
        authors = [author for jav in jav_data if jav.get('entry_type') == 'Book' and jav.get('author') for author in utils.parse_multi_value_field(jav['author'])]
        directors = [director for jav in jav_data if jav.get('entry_type') == 'JAV' and jav.get('director') for director in utils.parse_multi_value_field(jav['director'])]
        actresses = [actress for jav in jav_data if jav.get('entry_type') == 'JAV' and jav.get('actress') for actress in utils.parse_multi_value_field(jav['actress'])]
        versions = [jav['update_version'] for jav in jav_data if jav.get('entry_type') == 'Adult Visual Novel' and jav.get('update_version')]

        platform_pie_sections, platform_legend_items = utils._generate_pie_data_from_list(platforms, [ft.colors.BLUE_700, ft.colors.GREEN_700, ft.colors.RED_700, ft.colors.ORANGE_700])
        author_pie_sections, author_legend_items = utils._generate_pie_data_from_list(authors, [ft.colors.TEAL_400, ft.colors.AMBER_600])
        director_pie_sections, director_legend_items = utils._generate_pie_data_from_list(directors, [ft.colors.LIGHT_BLUE_400, ft.colors.LIME_700])
        actress_pie_sections, actress_legend_items = utils._generate_pie_data_from_list(actresses, [ft.colors.DEEP_PURPLE_300, ft.colors.PINK_300])
        version_pie_sections, version_legend_items = utils._generate_pie_data_from_list(versions, [ft.colors.BROWN_400, ft.colors.BLUE_GREY_500])

        def safe_update(control_ref, attr, value):
            if control_ref.current and control_ref.current.page:
                setattr(control_ref.current, attr, value)
                try: control_ref.current.update()
                except: pass
        
        safe_update(self.stats_total_javs_text, "value", str(total_javs))
        safe_update(self.stats_avg_score_text, "value", f"{average_score:.1f}")
        safe_update(self.stats_total_rewatches_text, "value", str(total_rewatches))
        safe_update(self.stats_unique_genres_text, "value", str(unique_genres_count))
        safe_update(self.genre_pie_chart, "sections", genre_pie_sections)
        safe_update(self.genre_legend, "controls", genre_legend_items)
        
        for container, sections, legend, data, pie_data, legend_data in [
            (self.platform_chart_container, self.platform_pie_chart, self.platform_legend, platforms, platform_pie_sections, platform_legend_items),
            (self.author_chart_container, self.author_pie_chart, self.author_legend, authors, author_pie_sections, author_legend_items),
            (self.director_chart_container, self.director_pie_chart, self.director_legend, directors, director_pie_sections, director_legend_items),
            (self.actress_chart_container, self.actress_pie_chart, self.actress_legend, actresses, actress_pie_sections, actress_legend_items),
            (self.version_chart_container, self.version_pie_chart, self.version_legend, versions, version_pie_sections, version_legend_items)
        ]:
            safe_update(container, "visible", bool(data))
            if data:
                safe_update(sections, "sections", pie_data)
                safe_update(legend, "controls", legend_data)

    def on_stats_filter_change(self, e):
        selected_year = list(e.control.selected)[0] if e.control.selected else "All Time"
        if self.page: self.page.run_thread(self.calculate_and_update_stats_display, selected_year)

    def on_theme_change(self, e):
        new_theme_name = e.control.value
        if new_theme_name in config.THEMES:
            theme_config = config.THEMES[new_theme_name]
            self.page.theme_mode = theme_config["mode"]
            self.page.theme.color_scheme_seed = theme_config["seed"]
            self.page.update()
            database.set_setting_db("current_theme", new_theme_name)
            self.show_snackbar(f"Theme changed to {new_theme_name}", duration=2000)

    def build_stats_view(self):
        if not self.stats_year_filter.current:
            self.stats_year_filter.current = ft.SegmentedButton(segments=[ft.Segment(value="All Time", label=ft.Text("Overall"))] + [ft.Segment(value=year, label=ft.Text(year)) for year in config.YEARS], selected={"All Time"}, allow_empty_selection=False, show_selected_icon=False, on_change=self.on_stats_filter_change)
        
        def on_stats_entry_type_filter_change():
            current_year_filter = list(self.stats_year_filter.current.selected)[0] if self.stats_year_filter.current.selected else "All Time"
            self.page.run_thread(self.calculate_and_update_stats_display, current_year_filter)
            database.set_setting_db(config.SAVED_STATS_VIEW_FILTER_KEY, ",".join(sorted(list(self.app_state["stats_view_selected_entry_types"]))))

        stats_entry_type_filter_button = create_entry_type_filter_button_with_sheet(self.page, config.ALL_ENTRY_TYPES_STR, self.app_state["stats_view_selected_entry_types"], on_stats_entry_type_filter_change, button_label_prefix="Filter Stats")
        
        self.page.run_thread(self.calculate_and_update_stats_display, "All Time")
        
        def _create_breakdown_card(container_ref, chart_ref, legend_ref, title):
            return ft.Card(ref=container_ref, visible=False, content=ft.Container(padding=20, content=ft.Row([ft.Column([ft.Text(title, style=ft.TextThemeStyle.TITLE_MEDIUM), ft.PieChart(ref=chart_ref, sections=[], center_space_radius=40)], expand=3, horizontal_alignment=ft.CrossAxisAlignment.CENTER), ft.Column([ft.Text("Top Entries", weight=ft.FontWeight.BOLD), ft.Column(ref=legend_ref, controls=[], spacing=8, scroll=ft.ScrollMode.ADAPTIVE)], expand=2, scroll=ft.ScrollMode.ADAPTIVE, height=250)], vertical_alignment=ft.CrossAxisAlignment.CENTER, height=260)))

        theme_dropdown = ft.Dropdown(label="App Theme", options=[ft.dropdown.Option(name) for name in config.THEMES.keys()], value=database.get_setting_db("current_theme", config.DEFAULT_THEME_NAME), on_change=self.on_theme_change, width=250)
        
        return ft.Container(content=ft.Column(scroll=ft.ScrollMode.ADAPTIVE, spacing=20, controls=[
            ft.Text("Statistics", style=ft.TextThemeStyle.HEADLINE_MEDIUM),
            ft.Row([self.stats_year_filter.current, stats_entry_type_filter_button], alignment=ft.MainAxisAlignment.SPACE_BETWEEN),
            ft.GridView(runs_count=4, max_extent=200, child_aspect_ratio=1.1, spacing=10, run_spacing=10, controls=[
                ft.Card(content=ft.Container(padding=15, content=ft.Column([ft.Icon(ft.icons.MOVIE_FILTER_ROUNDED), ft.Text(ref=self.stats_total_javs_text, value="..."), ft.Text("Total Entries")], horizontal_alignment=ft.CrossAxisAlignment.CENTER))),
                ft.Card(content=ft.Container(padding=15, content=ft.Column([ft.Icon(ft.icons.STAR_RATE_ROUNDED), ft.Text(ref=self.stats_avg_score_text, value="..."), ft.Text("Average Rating")], horizontal_alignment=ft.CrossAxisAlignment.CENTER))),
                ft.Card(content=ft.Container(padding=15, content=ft.Column([ft.Icon(ft.icons.REPLAY_CIRCLE_FILLED_ROUNDED), ft.Text(ref=self.stats_total_rewatches_text, value="..."), ft.Text("Rewatches")], horizontal_alignment=ft.CrossAxisAlignment.CENTER))),
                ft.Card(content=ft.Container(padding=15, content=ft.Column([ft.Icon(ft.icons.CATEGORY_ROUNDED), ft.Text(ref=self.stats_unique_genres_text, value="..."), ft.Text("Unique Genres")], horizontal_alignment=ft.CrossAxisAlignment.CENTER))),
            ]),
            ft.Card(content=ft.Container(padding=20, content=ft.Row([ft.Column([ft.Text("Genre Breakdown"), ft.PieChart(ref=self.genre_pie_chart, sections=[], center_space_radius=40)], expand=3, horizontal_alignment=ft.CrossAxisAlignment.CENTER), ft.Column([ft.Text("Genres"), ft.Column(ref=self.genre_legend, controls=[], scroll=ft.ScrollMode.ADAPTIVE)], expand=2, height=250, scroll=ft.ScrollMode.ADAPTIVE)], height=260))),
            _create_breakdown_card(self.platform_chart_container, self.platform_pie_chart, self.platform_legend, "Platform Breakdown"),
            _create_breakdown_card(self.author_chart_container, self.author_pie_chart, self.author_legend, "Author Breakdown"),
            _create_breakdown_card(self.director_chart_container, self.director_pie_chart, self.director_legend, "Studio Breakdown"),
            _create_breakdown_card(self.actress_chart_container, self.actress_pie_chart, self.actress_legend, "Actress Breakdown"),
            _create_breakdown_card(self.version_chart_container, self.version_pie_chart, self.version_legend, "Version Breakdown"),
            ft.Divider(),
            ft.Text("Settings", style=ft.TextThemeStyle.TITLE_MEDIUM),
            ft.Row([ft.Text("Theme:"), theme_dropdown]),
            ft.Row([ft.ElevatedButton("Import from CSV", on_click=self.open_import_dialog), ft.ElevatedButton("Export to CSV", on_click=self.open_export_dialog)])
        ]), padding=20, expand=True)

    def update_main_content(self, view_id):
        self.app_state["current_view"] = view_id
        content_area = self.main_content_area.current
        if not content_area: return
        content_area.controls.clear()
        
        show_fab, fab_tooltip = False, "Add Entry"
        if view_id in config.YEARS:
            content = self.build_year_view(view_id)
            show_fab = True
            fab_tooltip = f"Add Entry to {view_id}"
        elif view_id == "Backlog":
            content = self.build_backlog_view()
            show_fab = True
            fab_tooltip = "Add Item to Backlog"
        elif view_id == "Stats":
            content = self.build_stats_view()
        elif view_id == "Search":
            content = self.build_search_view()
            show_fab = True
        else:
            content = ft.Text(f"Error: Unknown view '{view_id}'")
        
        content_area.controls.append(content)
        fab = self.fab.current
        if fab:
            fab.visible = show_fab
            fab.tooltip = fab_tooltip
            fab.update()
        content_area.update()

    def refresh_current_view(self):
        self.update_main_content(self.app_state['current_view'])

    def navigation_change(self, e):
        idx = e.control.selected_index
        if 0 <= idx < len(config.YEARS):
            new_view = config.YEARS[idx]
        elif idx == len(config.YEARS):
            new_view = "Backlog"
        elif idx == len(config.YEARS) + 1:
            new_view = "Stats"
        elif idx == len(config.YEARS) + 2:
            new_view = "Search"
        else:
            return
        
        self.close_form_overlay()
        if self.current_dialog and self.current_dialog.open:
            self.current_dialog.open = False
            self.page.overlay.remove(self.current_dialog)
            self.current_dialog = None
            self.page.update()
        self.update_main_content(new_view)

    def handle_fab_click(self, e):
        current_view = self.app_state.get("current_view")
        if current_view == "Backlog":
            self.open_add_backlog_dialog(e)
        else:
            self.open_add_jav_dialog(e)

    def build_main_layout(self):
        self.initialize_app_state()
        self.page.overlay.extend([self.image_file_picker, self.import_dialog, self.export_dialog])
        
        try:
            initial_index = config.YEARS.index(self.app_state["current_view"])
        except ValueError:
            if self.app_state["current_view"] == "Backlog":
                initial_index = len(config.YEARS)
            elif self.app_state["current_view"] == "Stats":
                initial_index = len(config.YEARS) + 1
            elif self.app_state["current_view"] == "Search":
                initial_index = len(config.YEARS) + 2
            else:
                initial_index = 0
        
        rail = ft.NavigationRail(
            selected_index=initial_index, label_type=ft.NavigationRailLabelType.ALL, min_width=100,
            destinations=(
                [ft.NavigationRailDestination(icon=ft.icons.CALENDAR_MONTH_OUTLINED, selected_icon=ft.icons.CALENDAR_MONTH, label=y) for y in config.YEARS] +
                [ft.NavigationRailDestination(icon=ft.icons.BOOKMARKS_OUTLINED, selected_icon=ft.icons.BOOKMARKS, label="Backlog")] +
                [ft.NavigationRailDestination(icon=ft.icons.QUERY_STATS_OUTLINED, selected_icon=ft.icons.QUERY_STATS, label="Stats")] +
                [ft.NavigationRailDestination(icon=ft.icons.SEARCH_OUTLINED, selected_icon=ft.icons.SEARCH, label="Search")]
            ),
            on_change=self.navigation_change
        )
        
        self.fab.current = ft.FloatingActionButton(ref=self.fab, icon=ft.icons.ADD, on_click=self.handle_fab_click, visible=False)
        self.page.floating_action_button = self.fab.current
        self.page.floating_action_button_location = ft.FloatingActionButtonLocation.END_CONTAINED

        main_layout = ft.Row(controls=[rail, ft.VerticalDivider(width=1), ft.Column(ref=self.main_content_area, expand=True)], expand=True, vertical_alignment=ft.CrossAxisAlignment.START)
        self.main_stack.current = ft.Stack(ref=self.main_stack, controls=[main_layout], expand=True)
        
        self.page.add(self.main_stack.current)
        self.update_main_content(self.app_state["current_view"])
