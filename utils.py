# --- START OF FILE utils.py ---

import flet as ft
import re
from collections import Counter

# Import the single source of truth for our settings
import config

# --- Data Parsing and Formatting Functions ---

def parse_genres(genre_str: str | None) -> list[str]:
    """Parses a comma-separated string of genres into a clean list."""
    if not genre_str or not genre_str.strip():
        return []
    return [genre.strip() for genre in genre_str.split(',') if genre.strip()]

def parse_multi_value_field(field_str: str | None) -> list[str]:
    """
    Parses a string that might contain multiple values separated by
    commas, semicolons, or slashes into a clean list.
    """
    if not field_str or not field_str.strip():
        return []
    # Use regex to split by common delimiters, ignoring surrounding whitespace
    items = re.split(r'\s*[,;/]\s*', field_str)
    # Return a list with no empty or whitespace-only items
    return [item.strip() for item in items if item and item.strip()]

def format_genres(genre_list: list) -> str:
    """Formats a list of genres back into a standardized, comma-separated string."""
    if not genre_list:
        return ""
    # Ensure all items are strings, stripped of whitespace, and sorted alphabetically
    clean_list = sorted([str(g).strip() for g in genre_list if str(g).strip()])
    return config.GENRE_SEPARATOR.join(clean_list)


# --- UI Data Generation Functions ---
def _generate_pie_data_from_list(items_list: list, fallback_colors: list, color_map: dict | None = None):
    """
    Helper to generate Flet PieChart sections and legend controls from a list of strings.

    This function is specific to the Flet UI and would be rewritten for PySide6.
    """
    if not items_list:
        pie_sections = [ft.PieChartSection(value=1, title="N/A", color=ft.colors.with_opacity(0.1, ft.colors.ON_SURFACE))]
        legend_controls = [ft.Text("No data for this category.")]
        return pie_sections, legend_controls

    # Count occurrences of each item
    counts = Counter(item for item in items_list if item and str(item).strip())
    if not counts:
        pie_sections = [ft.PieChartSection(value=1, title="N/A", color=ft.colors.with_opacity(0.1, ft.colors.ON_SURFACE))]
        legend_controls = [ft.Text("No data for this category.")]
        return pie_sections, legend_controls

    total_items = sum(counts.values())
    pie_sections = []
    legend_controls = []
    color_index = 0

    # Initialize color_map if it's None to avoid errors
    if color_map is None:
        color_map = {}

    # Loop through every unique item, sorted by the most common
    for item, count in counts.most_common():
        percentage = (count / total_items * 100) if total_items > 0 else 0
        
        # Check for a specific color in the map, otherwise use the fallback list
        if item in color_map:
            color = color_map[item]
        else:
            color = fallback_colors[color_index % len(fallback_colors)]
            color_index += 1

        pie_sections.append(
            ft.PieChartSection(
                value=percentage,
                title=f"{percentage:.0f}%" if percentage >= 5 else "",
                title_style=ft.TextStyle(size=10, color=ft.colors.WHITE, weight=ft.FontWeight.BOLD),
                color=color,
                radius=60
            )
        )
        legend_controls.append(
            ft.Row([
                ft.Container(width=16, height=16, bgcolor=color, border_radius=3),
                ft.Text(f"{item} ({count})", max_lines=1, overflow=ft.TextOverflow.ELLIPSIS, tooltip=item)
            ], spacing=10)
        )

    return pie_sections, legend_controls