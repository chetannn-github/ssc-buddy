use serde::{Deserialize, Serialize};
use std::io::Write;
use std::{collections::hash_map::DefaultHasher, hash::{Hash, Hasher}, sync::Mutex};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HabitPin {
  pub uid: String,
  pub habit_id: String,
  pub style: String,
  pub x: Option<f64>,
  pub y: Option<f64>,
  pub width: f64,
  pub height: f64,
  #[serde(default)]
  pub desktop_id: Option<String>,
}
impl HabitPin {
  fn min_size(&self) -> (f64, f64) {
    match self.style.as_str() { "recall" => (400., 300.), "tasks" => (340., 400.), "study" => (340., 200.), _ => (220., 160.) }
  }
  fn max_size(&self) -> (f64, f64) {
    match self.style.as_str() { "recall" => (400., 420.), "tasks" => (340., 500.), "study" => (430., 300.), _ => (430., 420.) }
  }
  fn label(&self) -> String {
    let mut hash = DefaultHasher::new();
    (&self.uid, &self.habit_id, &self.style).hash(&mut hash);
    format!("habit-{:016x}", hash.finish())
  }
  fn recover_desktop(&mut self, current: &str, existing: &[String]) -> bool {
    // Registry updates can arrive separately. Wait until the active ID is in
    // the live list before deciding that a saved desktop was removed.
    if !existing.iter().any(|id| id.eq_ignore_ascii_case(current)) { return false; }
    if self.desktop_id.as_ref().map_or(true, |saved| !existing.iter().any(|id| id.eq_ignore_ascii_case(saved))) {
      self.desktop_id = Some(current.to_owned());
      return true;
    }
    false
  }
  fn valid(&self) -> bool {
    !self.uid.is_empty() && !self.habit_id.is_empty()
      && self.uid.len() <= 256 && self.habit_id.len() <= 512
      && matches!(self.style.as_str(), "heatmap" | "month" | "compact" | "recall" | "tasks" | "study")
      && self.width.is_finite() && self.height.is_finite()
      && self.x.map_or(true, f64::is_finite) && self.y.map_or(true, f64::is_finite)
  }
}

#[derive(Default)]
pub struct HabitPins(pub Mutex<Vec<HabitPin>>);
#[derive(Default)]
pub struct BoundsSaveDebounce(pub Mutex<(u64, bool)>);

// Keep the latest bounds in memory during dragging; write once movement settles.
fn schedule_bounds_save(app: &AppHandle) {
  let state = app.state::<BoundsSaveDebounce>();
  let mut pending = state.0.lock().unwrap_or_else(|e| e.into_inner());
  pending.0 = pending.0.wrapping_add(1);
  if pending.1 { return; }
  pending.1 = true;
  let mut revision = pending.0;
  drop(pending);
  let app = app.clone();
  std::thread::spawn(move || loop {
    std::thread::sleep(std::time::Duration::from_millis(450));
    let state = app.state::<BoundsSaveDebounce>();
    let mut pending = state.0.lock().unwrap_or_else(|e| e.into_inner());
    if pending.0 != revision { revision = pending.0; continue; }
    // Serialize the final write with new drag events scheduling another save.
    if let Err(error) = persist(&app) { eprintln!("Could not save widget bounds: {error}"); }
    pending.1 = false;
    break;
  });
}
#[derive(Clone, Copy)]
pub struct ChecklistBounds { x: f64, y: f64, width: f64, height: f64 }
#[derive(Default)]
pub struct ChecklistWindows(pub Mutex<std::collections::HashMap<String, ChecklistBounds>>);

fn checklist_height(items: usize, original: f64) -> f64 {
  (70. + items.min(100) as f64 * 48.).max(original).min(300.)
}

fn checklist_ease(t: f64) -> f64 { let t = t.clamp(0., 1.); t * t * (3. - 2. * t) }

async fn animate_checklist(window: WebviewWindow, width: f64, height: f64, position: Option<(f64, f64)>, animate: bool) -> Result<(), String> {
  tauri::async_runtime::spawn_blocking(move || {
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let from = window.inner_size().map_err(|e| e.to_string())?.to_logical::<f64>(scale);
    let start_position = window.outer_position().map_err(|e| e.to_string())?.to_logical::<f64>(scale);
    let duration = if animate { 240. } else { 0. };
    let start = std::time::Instant::now();
    loop {
      let t = if duration > 0. { (start.elapsed().as_secs_f64() * 1000. / duration).min(1.) } else { 1. };
      let eased = checklist_ease(t);
      window.set_size(tauri::LogicalSize::new(from.width + (width - from.width) * eased, from.height + (height - from.height) * eased)).map_err(|e| e.to_string())?;
      if let Some((x, y)) = position {
        let _ = window.set_position(tauri::LogicalPosition::new(start_position.x + (x - start_position.x) * eased, start_position.y + (y - start_position.y) * eased));
      }
      if t >= 1. { break; }
      std::thread::sleep(std::time::Duration::from_millis(16));
    }
    Ok(())
  }).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn fit_habit_heatmap(app: AppHandle, window: WebviewWindow, height: f64) -> Result<(), String> {
  let label = window.label();
  let valid = app.state::<HabitPins>().0.lock().map_err(|e| e.to_string())?.iter()
    .any(|pin| pin.label() == label && matches!(pin.style.as_str(), "heatmap" | "month" | "compact"));
  if !valid || !height.is_finite() { return Err("Invalid heatmap window.".into()); }
  if app.state::<ChecklistWindows>().0.lock().map_err(|e| e.to_string())?.contains_key(label) { return Ok(()); }
  let scale = window.scale_factor().map_err(|e| e.to_string())?;
  let size = window.inner_size().map_err(|e| e.to_string())?.to_logical::<f64>(scale);
  if size.height < 200. { return Ok(()); }
  let height = height.clamp(200., 420.);
  if (height - size.height).abs() > 2. {
    window.set_size(tauri::LogicalSize::new(size.width, height)).map_err(|e| e.to_string())?;
    crate::window_bounds::keep_visible(&window.as_ref().window());
    remember_bounds(&window.as_ref().window());
  }
  Ok(())
}

#[tauri::command]
pub async fn resize_study_widget(app: AppHandle, window: WebviewWindow, expanded: bool) -> Result<(), String> {
  let label = window.label().to_owned();
  let valid = app.state::<HabitPins>().0.lock().map_err(|e| e.to_string())?.iter().any(|pin| pin.label() == label && pin.style == "study");
  if !valid { return Err("Not a Study Lock widget.".into()); }
  let state = app.state::<ChecklistWindows>();
  if expanded {
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let size = window.inner_size().map_err(|e| e.to_string())?.to_logical::<f64>(scale);
    let position = window.outer_position().map_err(|e| e.to_string())?.to_logical::<f64>(scale);
    let original = {
      let mut saved = state.0.lock().map_err(|e| e.to_string())?;
      *saved.entry(label.clone()).or_insert(ChecklistBounds { x: position.x, y: position.y, width: size.width, height: size.height })
    };
    window.set_max_size(Some(tauri::LogicalSize::new(430., 540.))).map_err(|e| e.to_string())?;
    animate_checklist(window.clone(), original.width, 520., None, true).await?;
    crate::window_bounds::keep_visible(&window.as_ref().window());
  } else {
    let original = state.0.lock().map_err(|e| e.to_string())?.get(&label).copied();
    if let Some(original) = original {
      animate_checklist(window.clone(), original.width, original.height, Some((original.x, original.y)), true).await?;
      window.set_max_size(Some(tauri::LogicalSize::new(430., 300.))).map_err(|e| e.to_string())?;
      state.0.lock().map_err(|e| e.to_string())?.remove(&label);
      crate::window_bounds::keep_visible(&window.as_ref().window());
      remember_bounds(&window.as_ref().window());
    }
  }
  Ok(())
}

#[tauri::command]
pub async fn resize_habit_checklist(app: AppHandle, window: WebviewWindow, expanded: bool, item_count: usize, animate: Option<bool>) -> Result<(), String> {
  let label = window.label().to_owned();
  let is_habit = app.state::<HabitPins>().0.lock().map_err(|e| e.to_string())?.iter()
    .any(|pin| pin.label() == label && matches!(pin.style.as_str(), "heatmap" | "month" | "compact"));
  if !is_habit { return Err("Not a habit widget.".into()); }
  let state = app.state::<ChecklistWindows>();
  if expanded {
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let size = window.inner_size().map_err(|e| e.to_string())?.to_logical::<f64>(scale);
    let pos = window.outer_position().map_err(|e| e.to_string())?.to_logical::<f64>(scale);
    let original = {
      let mut saved = state.0.lock().map_err(|e| e.to_string())?;
      *saved.entry(label.clone()).or_insert(ChecklistBounds { x: pos.x, y: pos.y, width: size.width, height: size.height })
    };
    if let Err(error) = animate_checklist(window.clone(), original.width, checklist_height(item_count, original.height), None, animate.unwrap_or(true)).await {
      state.0.lock().map_err(|e| e.to_string())?.remove(&label);
      return Err(error.to_string());
    }
    crate::window_bounds::keep_visible(&window.as_ref().window());
  } else {
    let original = state.0.lock().map_err(|e| e.to_string())?.get(&label).copied();
    if let Some(original) = original {
      animate_checklist(window.clone(), original.width, original.height, Some((original.x, original.y)), animate.unwrap_or(true)).await?;
      state.0.lock().map_err(|e| e.to_string())?.remove(&label);
      crate::window_bounds::keep_visible(&window.as_ref().window());
      remember_bounds(&window.as_ref().window());
    }
  }
  Ok(())
}


pub fn persist(app: &AppHandle) -> Result<(), String> {
  let directory = app.path().app_data_dir().map_err(|e| e.to_string())?;
  std::fs::create_dir_all(&directory).map_err(|e| e.to_string())?;
  let pins = app.state::<HabitPins>();
  let pins = pins.0.lock().map_err(|e| e.to_string())?;
  let data = serde_json::to_vec(&*pins).map_err(|e| e.to_string())?;
  let temporary = directory.join("habit-widgets.tmp");
  let mut file = std::fs::File::create(&temporary).map_err(|e| e.to_string())?;
  file.write_all(&data).map_err(|e| e.to_string())?;
  file.sync_all().map_err(|e| e.to_string())?;
  drop(file);
  std::fs::rename(temporary, directory.join("habit-widgets.json")).map_err(|e| e.to_string())
}

fn open(app: &AppHandle, pin: &HabitPin) -> Result<(), String> {
  if let Some(window) = app.get_webview_window(&pin.label()) {
    window.show().map_err(|e| e.to_string())?;
    let _ = window.unminimize();
    if let Some(id) = &pin.desktop_id { virtual_desktop::move_to(&window, id); }
    return Ok(());
  }
  let script = format!("window.__SSC_HABIT_WIDGET__ = {};", serde_json::to_string(pin).map_err(|e| e.to_string())?);
  let (max_width, max_height) = pin.max_size();
  let (min_width, min_height) = pin.min_size();
  let mut builder = WebviewWindowBuilder::new(app, pin.label(), WebviewUrl::App("index.html".into()))
    .title(if pin.style == "study" { "Study Lock" } else { "Habit widget" })
    .initialization_script(&script)
    .inner_size(pin.width.clamp(min_width, max_width), pin.height.clamp(min_height, max_height))
    .min_inner_size(min_width, min_height)
    .max_inner_size(max_width, max_height)
    .decorations(false).transparent(true).shadow(false)
    // Virtual desktop visibility is managed explicitly without a taskbar entry.
    .always_on_top(false).always_on_bottom(true).skip_taskbar(true)
    .resizable(true).maximizable(false).fullscreen(false).focused(false);
  if let (Some(x), Some(y)) = (pin.x, pin.y) { builder = builder.position(x, y); }
  let window = builder.build().map_err(|e| e.to_string())?;
  if let Some(native) = app.get_webview_window(&pin.label()) { crate::window_bounds::keep_visible(&native.as_ref().window()); }
  if let Some(id) = &pin.desktop_id { virtual_desktop::move_to(&window, id); }
  Ok(())
}

pub fn restore(app: &AppHandle) {
  let stored = app.path().app_data_dir().ok()
    .and_then(|dir| std::fs::read(dir.join("habit-widgets.json")).ok())
    .and_then(|data| serde_json::from_slice::<Vec<HabitPin>>(&data).ok()).unwrap_or_default();
  let mut pins: Vec<_> = stored.into_iter().filter(HabitPin::valid).take(30).collect();
  for pin in &mut pins {
    // Migrate the previous default while preserving manually chosen heights.
    if pin.style == "recall" && (pin.height - 475.).abs() < 1. { pin.height = 380.; }
  }
  for pin in &mut pins { if pin.desktop_id.is_none() { pin.desktop_id = virtual_desktop::active().or_else(|| app.get_webview_window("main").and_then(|window| virtual_desktop::current(&window))); } }
  if let Ok(mut state) = app.state::<HabitPins>().0.lock() { *state = pins.clone(); }
  for pin in pins { if let Err(error) = open(app, &pin) { eprintln!("Could not restore habit widget: {error}"); } }
  keep_on_saved_desktops(app);
  let _ = persist(app);
}

#[tauri::command]
pub async fn pin_habit_widget(app: AppHandle, window: WebviewWindow, uid: String, habit_id: String, style: String) -> Result<(), String> {
  if window.label() != "main" { return Err("Open widgets from the main window.".into()); }
  let (width, height) = match style.as_str() { "month" => (260., 260.), "compact" => (250., 180.), "recall" => (400., 380.), "tasks" => (340., 475.), "study" => (430., 220.), _ => (430., 220.) };
  let pin = HabitPin { uid, habit_id, style, x: None, y: None, width, height, desktop_id: virtual_desktop::active().or_else(|| virtual_desktop::current(&window)) };
  if !pin.valid() { return Err("Invalid habit widget.".into()); }
  keep_on_saved_desktops(&app);
  let existing = app.state::<HabitPins>().0.lock().map_err(|e| e.to_string())?.iter().find(|p| p.label() == pin.label()).cloned();
  if let Some(existing) = existing { return open(&app, &existing); }
  if app.state::<HabitPins>().0.lock().map_err(|e| e.to_string())?.len() >= 30 { return Err("Remove a widget before adding another.".into()); }
  open(&app, &pin)?;
  app.state::<HabitPins>().0.lock().map_err(|e| e.to_string())?.push(pin);
  keep_on_saved_desktops(&app);
  persist(&app)
}

#[tauri::command]
pub async fn remove_habit_widget(app: AppHandle, window: WebviewWindow) -> Result<(), String> {
  if !window.label().starts_with("habit-") { return Err("Not a habit widget.".into()); }
  app.state::<HabitPins>().0.lock().map_err(|e| e.to_string())?.retain(|p| p.label() != window.label());
  persist(&app)?;
  app.state::<ChecklistWindows>().0.lock().map_err(|e| e.to_string())?.remove(window.label());
  window.destroy().map_err(|e| e.to_string())
}

pub fn remember_bounds(window: &tauri::Window) {
  if !window.label().starts_with("habit-") { return; }
  let scale = window.scale_factor().unwrap_or(1.);
  let app = window.app_handle();
  if app.state::<ChecklistWindows>().0.lock().map(|saved| saved.contains_key(window.label())).unwrap_or(false) { return; }
  let state = app.state::<HabitPins>();
  if let Ok(mut pins) = state.0.lock() {
    if let Some(pin) = pins.iter_mut().find(|p| p.label() == window.label()) {
      if let Ok(position) = window.outer_position() {
        let logical = position.to_logical::<f64>(scale);
        pin.x = Some(logical.x); pin.y = Some(logical.y);
      }
      if let Ok(size) = window.inner_size() {
        let logical = size.to_logical::<f64>(scale);
        if logical.width >= 200. && logical.height >= 150. { let (max_width, max_height) = pin.max_size(); let (min_width, min_height) = pin.min_size(); pin.width = logical.width.clamp(min_width, max_width); pin.height = logical.height.clamp(min_height, max_height); }
      }
    }
  };
  schedule_bounds_save(app);
}

#[cfg(test)]
mod tests {
  use super::*;
  fn pin() -> HabitPin { HabitPin { uid: "alice".into(), habit_id: "read".into(), style: "heatmap".into(), x: None, y: None, width: 430., height: 220., desktop_id: None } }
  #[test]
  fn study_widget_has_compact_bounds_and_survives_restore() {
    let study = HabitPin { style: "study".into(), habit_id: "study-lock".into(), ..pin() };
    assert!(study.valid());
    assert_eq!(study.min_size(), (340., 200.));
    assert_eq!(study.max_size(), (430., 300.));
    let restored: HabitPin = serde_json::from_str(&serde_json::to_string(&study).unwrap()).unwrap();
    assert!(restored.valid());
    assert_eq!(restored.label(), study.label());
    assert_ne!(restored.label(), pin().label());
  }
  #[test]
  fn widgets_are_isolated_by_account_habit_and_style() {
    let first = pin();
    assert_eq!(first.label(), first.clone().label());
    for other in [HabitPin { uid: "bob".into(), ..pin() }, HabitPin { habit_id: "walk".into(), ..pin() }, HabitPin { style: "compact".into(), ..pin() }] {
      assert_ne!(first.label(), other.label());
    }
  }
  #[test]
  fn deleted_desktop_rehomes_widget_without_moving_other_desktop_widgets() {
    let mut widget = pin();
    widget.desktop_id = Some("removed".into());
    assert!(widget.recover_desktop("current", &["current".into(), "other".into()]));
    assert_eq!(widget.desktop_id.as_deref(), Some("current"));
    assert!(!widget.recover_desktop("other", &["current".into(), "other".into()]));
    assert_eq!(widget.desktop_id.as_deref(), Some("current"));
    widget.desktop_id = Some("removed".into());
    assert!(!widget.recover_desktop("removed", &["current".into()]));
    assert_eq!(widget.desktop_id.as_deref(), Some("removed"));
  }
  #[test]
  fn checklist_expands_to_fit_items_without_shrinking_or_exceeding_limit() {
    assert_eq!(checklist_height(1, 180.), 180.);
    assert_eq!(checklist_height(3, 180.), 214.);
    assert_eq!(checklist_height(20, 180.), 300.);
  }
  #[test]
  fn validates_and_roundtrips_saved_widgets() {
    let saved = serde_json::to_string(&pin()).unwrap();
    let restored: HabitPin = serde_json::from_str(&saved).unwrap();
    assert!(restored.valid());
    assert_eq!(restored.label(), pin().label());
    let mut assigned = pin();
    assigned.desktop_id = Some("A5CD92FF-29BE-454C-8D04-D82879FB3F1B".into());
    let restored: HabitPin = serde_json::from_str(&serde_json::to_string(&assigned).unwrap()).unwrap();
    assert_eq!(assigned.desktop_id, restored.desktop_id);
    assert_eq!(assigned.label(), pin().label());
    assert!(!HabitPin { uid: "".into(), ..pin() }.valid());
    assert!(!HabitPin { style: "unknown".into(), ..pin() }.valid());
    assert!(!HabitPin { x: Some(f64::NAN), ..pin() }.valid());
  }
}


pub fn keep_on_saved_desktops(app: &AppHandle) {
  let active = virtual_desktop::active();
  let existing = virtual_desktop::all();
  let mut recovered = false;
  let pins = {
    let state = app.state::<HabitPins>();
    let Ok(mut pins) = state.0.lock() else { return; };
    if let (Some(current), Some(existing)) = (&active, &existing) {
      for pin in pins.iter_mut() { recovered |= pin.recover_desktop(current, existing); }
    }
    pins.clone()
  };
  if recovered { let _ = persist(app); }
  for pin in pins {
    if let (Some(window), Some(id)) = (app.get_webview_window(&pin.label()), pin.desktop_id) {
      if let Some(current) = &active {
        if current.eq_ignore_ascii_case(&id) {
          if !window.is_visible().unwrap_or(false) { let _ = window.show(); }
        } else if window.is_visible().unwrap_or(false) { let _ = window.hide(); }
      }
    }
  }
}

pub fn watch_desktop(app: AppHandle) {
  virtual_desktop::watch(app);
}

#[cfg(windows)]
mod virtual_desktop {
  use super::*;
  use windows::{core::GUID, Win32::{System::Com::{CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED}, UI::Shell::{IVirtualDesktopManager, VirtualDesktopManager}}};
  struct ComGuard(bool);
  impl Drop for ComGuard { fn drop(&mut self) { if self.0 { unsafe { CoUninitialize(); } } } }
  fn manager() -> Option<(ComGuard, IVirtualDesktopManager)> {
    let guard = ComGuard(unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) }.is_ok());
    let manager = unsafe { CoCreateInstance(&VirtualDesktopManager, None, CLSCTX_INPROC_SERVER) }.ok()?;
    Some((guard, manager))
  }
  // Explorer publishes the selected desktop here. Wait for its change event
  // rather than letting a 200ms polling interval leak widgets onto another desktop.
  #[link(name = "advapi32")]
  extern "system" {
    fn RegNotifyChangeKeyValue(key: *mut std::ffi::c_void, subtree: i32, filter: u32,
      event: *mut std::ffi::c_void, asynchronous: i32) -> i32;
  }
  pub fn watch(app: AppHandle) {
    use windows::Win32::System::{Threading::GetCurrentProcessId, RemoteDesktop::ProcessIdToSessionId};
    let mut session = 0;
    let _ = unsafe { ProcessIdToSessionId(GetCurrentProcessId(), &mut session) };
    let paths = [format!(r"Software\Microsoft\Windows\CurrentVersion\Explorer\SessionInfo\{}\VirtualDesktops", session),
      r"Software\Microsoft\Windows\CurrentVersion\Explorer\VirtualDesktops".into()];
    let mut watching = false;
    for path in paths {
      if windows_registry::CURRENT_USER.open(&path).is_ok() {
        watching = true;
        let app = app.clone();
        std::thread::spawn(move || {
          let Ok(key) = windows_registry::CURRENT_USER.open(&path) else { return; };
          loop {
            let result = unsafe { RegNotifyChangeKeyValue(key.as_raw(), 0, 4, std::ptr::null_mut(), 0) };
            if result != 0 { break; }
            keep_on_saved_desktops(&app);
          }
        });
      }
    }
    if !watching {
      std::thread::spawn(move || loop {
        keep_on_saved_desktops(&app);
        std::thread::sleep(std::time::Duration::from_millis(50));
      });
    }
  }
  pub fn active() -> Option<String> {
    use windows::Win32::System::{Threading::GetCurrentProcessId, RemoteDesktop::ProcessIdToSessionId};
    let mut session = 0;
    let _ = unsafe { ProcessIdToSessionId(GetCurrentProcessId(), &mut session) };
    let paths = [format!(r"Software\Microsoft\Windows\CurrentVersion\Explorer\SessionInfo\{}\VirtualDesktops", session),
      r"Software\Microsoft\Windows\CurrentVersion\Explorer\VirtualDesktops".into()];
    for path in paths {
      if let Ok(key) = windows_registry::CURRENT_USER.open(&path) {
        if let Ok(data) = key.get_value("CurrentVirtualDesktop") {
          if data.len() == 16 {
            let id = GUID::from_values(u32::from_le_bytes(data[0..4].try_into().ok()?), u16::from_le_bytes(data[4..6].try_into().ok()?),
              u16::from_le_bytes(data[6..8].try_into().ok()?), data[8..16].try_into().ok()?);
            if id.to_u128() != 0 { return Some(format!("{:?}", id)); }
          }
        }
      }
    }
    None
  }
  pub fn all() -> Option<Vec<String>> {
    use windows::Win32::System::{Threading::GetCurrentProcessId, RemoteDesktop::ProcessIdToSessionId};
    let mut session = 0;
    let _ = unsafe { ProcessIdToSessionId(GetCurrentProcessId(), &mut session) };
    let paths = [format!(r"Software\Microsoft\Windows\CurrentVersion\Explorer\SessionInfo\{}\VirtualDesktops", session),
      r"Software\Microsoft\Windows\CurrentVersion\Explorer\VirtualDesktops".into()];
    for path in paths {
      if let Ok(key) = windows_registry::CURRENT_USER.open(&path) {
        if let Ok(data) = key.get_value("VirtualDesktopIDs") {
          if !data.is_empty() && data.len() % 16 == 0 {
            let mut ids = Vec::new();
            for bytes in data.chunks_exact(16) {
              let id = GUID::from_values(u32::from_le_bytes(bytes[0..4].try_into().ok()?), u16::from_le_bytes(bytes[4..6].try_into().ok()?),
                u16::from_le_bytes(bytes[6..8].try_into().ok()?), bytes[8..16].try_into().ok()?);
              if id.to_u128() != 0 { ids.push(format!("{:?}", id)); }
            }
            if !ids.is_empty() { return Some(ids); }
          }
        }
      }
    }
    None
  }
  pub fn current(window: &WebviewWindow) -> Option<String> {
    let (_guard, manager) = manager()?;
    let id = unsafe { manager.GetWindowDesktopId(window.hwnd().ok()?) }.ok()?;
    if id.to_u128() == 0 { return None; }
    Some(format!("{:?}", id))
  }
  pub fn move_to(window: &WebviewWindow, desktop: &str) {
    let Some((_guard, manager)) = manager() else { return; };
    let (Ok(id), Ok(hwnd)) = (GUID::try_from(desktop), window.hwnd()) else { return; };
    let current = unsafe { manager.GetWindowDesktopId(hwnd) };
    if current.ok() == Some(id) { return; }
    if let Err(error) = unsafe { manager.MoveWindowToDesktop(hwnd, &id) } {
      eprintln!("Could not restore widget virtual desktop: {error}");
    }
  }
}
#[cfg(not(windows))]
mod virtual_desktop {
  use super::*;
  pub fn watch(_: AppHandle) {}
  pub fn active() -> Option<String> { None }
  pub fn all() -> Option<Vec<String>> { None }
  pub fn current(_: &WebviewWindow) -> Option<String> { None }
  pub fn move_to(_: &WebviewWindow, _: &str) {}
}
