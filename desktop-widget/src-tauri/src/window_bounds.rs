use tauri::{PhysicalPosition, Window};

fn clamp_position(position: (i32, i32), size: (u32, u32), origin: (i32, i32), area: (u32, u32)) -> (i32, i32) {
  let max_x = origin.0.saturating_add(area.0.saturating_sub(size.0).min(i32::MAX as u32) as i32);
  let max_y = origin.1.saturating_add(area.1.saturating_sub(size.1).min(i32::MAX as u32) as i32);
  (position.0.clamp(origin.0, max_x), position.1.clamp(origin.1, max_y))
}

pub fn keep_visible(window: &Window) {
  if window.is_minimized().unwrap_or(false) { return; }
  let (Ok(position), Ok(size)) = (window.outer_position(), window.outer_size()) else { return; };
  let monitor = window.current_monitor().ok().flatten()
    .or_else(|| window.primary_monitor().ok().flatten());
  let Some(monitor) = monitor else { return; };
  let area = monitor.work_area();
  let target = clamp_position((position.x, position.y), (size.width, size.height),
    (area.position.x, area.position.y), (area.size.width, area.size.height));
  if target != (position.x, position.y) {
    let _ = window.set_position(PhysicalPosition::new(target.0, target.1));
  }
}

#[cfg(test)]
mod tests {
  use super::*;
  #[test]
  fn clamps_all_edges_and_preserves_valid_positions() {
    assert_eq!(clamp_position((-50, -20), (340, 475), (0, 0), (1920, 1040)), (0, 0));
    assert_eq!(clamp_position((1850, 1000), (340, 475), (0, 0), (1920, 1040)), (1580, 565));
    assert_eq!(clamp_position((300, 150), (340, 475), (0, 0), (1920, 1040)), (300, 150));
  }
  #[test]
  fn supports_negative_monitor_coordinates_and_smaller_work_areas() {
    assert_eq!(clamp_position((-2000, 900), (340, 475), (-1920, 0), (1920, 1040)), (-1920, 565));
    assert_eq!(clamp_position((50, 50), (400, 600), (0, 0), (300, 500)), (0, 0));
  }
}
