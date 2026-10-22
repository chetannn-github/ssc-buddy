#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{menu::{Menu, MenuItem}, tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent}, Manager};
use tauri_plugin_autostart::ManagerExt;
mod habit_widgets;
mod window_bounds;

fn show_window(app: &tauri::AppHandle) {
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.set_always_on_top(false);
    let _ = window.show();
    let _ = window.set_focus();
    let _ = window.set_always_on_bottom(true);
  }
}


fn toggle_window(app: &tauri::AppHandle) {
  if let Some(window) = app.get_webview_window("main") {
    if window.is_visible().unwrap_or(false) && !window.is_minimized().unwrap_or(false) {
      let _ = window.hide();
    } else {
      let _ = window.set_always_on_top(false);
      let _ = window.unminimize();
      let _ = window.show();
      let _ = window.set_focus();
      let _ = window.set_always_on_bottom(true);
    }
  }
}

fn main() {
  let app = tauri::Builder::default()
    .manage(habit_widgets::HabitPins::default())
    .manage(habit_widgets::BoundsSaveDebounce::default())
    .manage(habit_widgets::ChecklistWindows::default())
    .invoke_handler(tauri::generate_handler![habit_widgets::pin_habit_widget, habit_widgets::remove_habit_widget, habit_widgets::resize_habit_checklist, habit_widgets::fit_habit_heatmap, habit_widgets::resize_study_widget])
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
        .show_menu_on_left_click(false)
        .tooltip("SSC Buddy Widget")
        .on_menu_event(|app, event| match event.id.as_ref() {
          "show" => show_window(app),
          "hide" => { if let Some(window) = app.get_webview_window("main") { let _ = window.hide(); } }
          "quit" => { let _ = habit_widgets::persist(app); app.exit(0); },
          _ => {}
        })
        .on_tray_icon_event(|tray, event| {
          if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
            toggle_window(tray.app_handle());
          }
        })
        .build(app)?;
      if let Some(window) = app.get_webview_window("main") { window_bounds::keep_visible(&window.as_ref().window()); }
      habit_widgets::restore(app.handle());
      habit_widgets::watch_desktop(app.handle().clone());
      Ok(())
    })
    .on_window_event(|window, event| {
      if matches!(event, tauri::WindowEvent::Focused(true) | tauri::WindowEvent::Moved(_)) { habit_widgets::keep_on_saved_desktops(window.app_handle()); }
      if matches!(event, tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_) | tauri::WindowEvent::ScaleFactorChanged { .. }) { window_bounds::keep_visible(window); habit_widgets::remember_bounds(window); }
      if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        let _ = window.hide();
      }
    })
    .build(tauri::generate_context!())
    .expect("failed to run SSC Buddy");
  app.run(|app, event| {
    if matches!(event, tauri::RunEvent::ExitRequested { .. }) { let _ = habit_widgets::persist(app); }
  });
}
