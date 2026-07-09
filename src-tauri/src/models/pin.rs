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
    pub hidden: bool,
    pub flip_h: bool,
    pub flip_v: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

/// 贴图变换参数，所有字段可选，仅更新传入的字段
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PinTransform {
    pub pos_x: Option<f64>,
    pub pos_y: Option<f64>,
    pub scale: Option<f64>,
    pub rotation: Option<f64>,
    pub opacity: Option<f64>,
    pub always_on_top: Option<bool>,
    pub locked: Option<bool>,
    pub flip_h: Option<bool>,
    pub flip_v: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PinImagePayload {
    pub temp_path: String,
}
