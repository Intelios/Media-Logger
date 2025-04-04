# main.py (SUPER SIMPLE DIALOG TEST)
import flet as ft
import time # Keep time just in case

# --- Main Application (Simplified Test) ---
def main(page: ft.Page):
    page.title = "Dialog Test"
    page.vertical_alignment = ft.MainAxisAlignment.CENTER
    page.horizontal_alignment = ft.CrossAxisAlignment.CENTER

    def open_test_dialog(e):
        print("Button clicked, attempting to open dialog...")

        # Define the dialog *inside* the handler for simplicity
        test_dialog = ft.AlertDialog(
            modal=True,
            title=ft.Text("Minimal Test Dialog"),
            content=ft.Text("Can you see this?"),
            actions=[
                ft.TextButton("Yes", on_click=lambda _: close_test_dialog(test_dialog)),
            ],
            actions_alignment=ft.MainAxisAlignment.END,
        )

        def close_test_dialog(dialog_control):
            dialog_control.open = False
            print("Closing dialog...")
            page.update()
            print("...page updated after close.")

        # Assign, open, update
        page.dialog = test_dialog
        test_dialog.open = True
        print("Dialog assigned and set to open...")
        page.update() # Direct update should work here
        print("...page update called.")


    # Just add a button to the page
    page.add(
        ft.ElevatedButton(
            "Show Minimal Dialog",
            on_click=open_test_dialog
        )
    )
    print("Simple page structure added.")
    page.update() # Initial page render

# --- Run the App ---
if __name__ == "__main__":
    ft.app(target=main)