use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct ScreenshotHistoryEntry {
    pub id: i64,
    pub region_x: f64,
    pub region_y: f64,
    pub region_width: f64,
    pub region_height: f64,
    pub scale_factor: f64,
    pub file_path: Option<String>,
    pub created_at: i64,
}
