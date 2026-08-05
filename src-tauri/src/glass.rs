use objc2::runtime::AnyClass;
use objc2::{MainThreadMarker, MainThreadOnly, msg_send, sel};
use objc2_app_kit::{
    NSAutoresizingMaskOptions, NSGlassEffectView, NSGlassEffectViewStyle, NSView, NSWindow,
    NSWindowOrderingMode,
};
use tauri::{Runtime, WebviewWindow};

#[derive(Clone, Copy)]
pub enum GlassStyle {
    Clear,
    Sidebar,
}

impl GlassStyle {
    fn variant(self) -> isize {
        match self {
            Self::Clear => 1,
            Self::Sidebar => 16,
        }
    }
}

pub fn is_supported() -> bool {
    AnyClass::get(c"NSGlassEffectView").is_some()
}

pub fn apply<R: Runtime>(window: &WebviewWindow<R>, style: GlassStyle) -> Result<(), String> {
    let ns_window = window.ns_window().map_err(|error| error.to_string())?;
    if ns_window.is_null() {
        return Err("The native macOS window is unavailable".to_string());
    }

    // Raw AppKit objects are main-thread-only. Pass only the pointer address
    // into Tauri's Send closure, then recreate the typed borrow on main.
    let ns_window_address = ns_window as usize;
    if let Some(mtm) = MainThreadMarker::new() {
        return unsafe { apply_on_main(ns_window_address, style, mtm) };
    }

    let (sender, receiver) = std::sync::mpsc::channel();
    window
        .run_on_main_thread(move || {
            let result = MainThreadMarker::new()
                .ok_or_else(|| "Tauri did not run the glass update on the main thread".to_string())
                .and_then(|mtm| unsafe { apply_on_main(ns_window_address, style, mtm) });
            let _ = sender.send(result);
        })
        .map_err(|error| error.to_string())?;

    receiver
        .recv()
        .map_err(|error| format!("Failed to receive the glass update result: {error}"))?
}

unsafe fn apply_on_main(
    ns_window_address: usize,
    style: GlassStyle,
    mtm: MainThreadMarker,
) -> Result<(), String> {
    // SAFETY: Tauri supplied this pointer for the live WebviewWindow, and the
    // caller proves this function is executing on AppKit's main thread.
    let ns_window = unsafe { &*(ns_window_address as *const NSWindow) };
    let content_view = ns_window
        .contentView()
        .ok_or_else(|| "The native macOS window has no content view".to_string())?;

    for subview in content_view.subviews().iter() {
        if let Some(glass) = subview.downcast_ref::<NSGlassEffectView>() {
            unsafe { set_variant(glass, style) };
            return Ok(());
        }
    }

    let glass =
        NSGlassEffectView::initWithFrame(NSGlassEffectView::alloc(mtm), content_view.bounds());
    glass.setAutoresizingMask(
        NSAutoresizingMaskOptions::ViewWidthSizable | NSAutoresizingMaskOptions::ViewHeightSizable,
    );
    unsafe { set_variant(&glass, style) };
    content_view.addSubview_positioned_relativeTo(
        &glass,
        NSWindowOrderingMode::Below,
        None::<&NSView>,
    );

    Ok(())
}

unsafe fn set_variant(view: &NSGlassEffectView, style: GlassStyle) {
    let variant = style.variant();

    // `variant` is an undocumented selector used by the former plugin. Keep
    // its known-working probe order so Sidebar (16) remains visually identical.
    let responds: bool = unsafe { msg_send![view, respondsToSelector: sel!(set_variant:)] };
    if responds {
        let _: () = unsafe { msg_send![view, set_variant: variant] };
        return;
    }

    let responds: bool = unsafe { msg_send![view, respondsToSelector: sel!(setVariant:)] };
    if responds {
        let _: () = unsafe { msg_send![view, setVariant: variant] };
        return;
    }

    // If Apple removes the private selector, preserve the supported Clear
    // style and degrade Sidebar to the public Regular style without crashing.
    view.setStyle(match style {
        GlassStyle::Clear => NSGlassEffectViewStyle::Clear,
        GlassStyle::Sidebar => NSGlassEffectViewStyle::Regular,
    });
}
