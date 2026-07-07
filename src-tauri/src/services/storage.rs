use std::path::Path;

use crate::error::Result;

pub fn save_pin_image(app_data_dir: &Path, temp_path: &str, id: &str) -> Result<String> {
    let ext = Path::new(temp_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png");
    let filename = format!("{}.{}", id, ext);
    let dest = app_data_dir.join("pins").join(&filename);
    std::fs::copy(temp_path, &dest)?;
    Ok(format!("pins/{}", filename))
}
