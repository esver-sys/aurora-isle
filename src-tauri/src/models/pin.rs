use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PinRecord {
    pub id: String,
    pub file_path: String,
    pub thumb_path: Option<String>,
    pub pos_x: Option<f64>,
    pub pos_y: Option<f64>,
    pub scale: f64,
    pub rotation: f64,
    pub opacity: f64,
    pub always_on_top: bool,
    pub locked: bool,
    pub pinned_open: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PinTransform {
    pub pos_x: Option<f64>,
    pub pos_y: Option<f64>,
    pub scale: Option<f64>,
    pub rotation: Option<f64>,
    pub opacity: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PinImagePayload {
    pub temp_path: String,
}
