#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{menu::{Menu, MenuItem}, tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent}, Manager};
use tauri_plugin_autostart::ManagerExt;

fn show_window(app: &tauri::AppHandle) {
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.show();
    let _ = window.set_focus();
  }
}

fn main() {
  tauri::Builder::default()
    .setup(|app| {
      app.handle().plugin(tauri_plugin_autostart::init(tauri_plugin_autostart::MacosLauncher::LaunchAgent, None))?;
      let _ = app.autolaunch().enable();
      let show = MenuItem::with_id(app, "show", "Show window", true, None::<&str>)?;
      let hide = MenuItem::with_id(app, "hide", "Hide window", true, None::<&str>)?;
      let quit = MenuItem::with_id(app, "quit", "Exit", true, None::<&str>)?;
      let menu = Menu::with_items(app, &[&show, &hide, &quit])?;
      let tray_icon = app.default_window_icon().cloned().ok_or("SSC Buddy tray icon is unavailable")?;
      TrayIconBuilder::with_id("ssc-buddy-tray")
        .icon(tray_icon)
        .menu(&menu)
        .tooltip("SSC Buddy Widget")
        .on_menu_event(|app, event| match event.id.as_ref() {
          "show" => show_window(app),
          "hide" => { if let Some(window) = app.get_webview_window("main") { let _ = window.hide(); } }
          "quit" => app.exit(0),
          _ => {}
        })
        .on_tray_icon_event(|tray, event| {
          if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
            show_window(tray.app_handle());
          }
        })
        .build(app)?;
      Ok(())
    })
    .on_window_event(|window, event| {
      if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        let _ = window.hide();
      }
    })
    .run(tauri::generate_context!())
    .expect("failed to run SSC Buddy");
}
