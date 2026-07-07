use std::path::Path;

use crate::error::Result;

pub fn generate_thumbnail(
    image_path: &Path,
    thumb_dir: &Path,
    id: &str,
    max_size: u32,
) -> Result<String> {
    let img = image::open(image_path)?;
    let thumb = img.resize(max_size, max_size, image::imageops::FilterType::Lanczos3);
    let thumb_filename = format!("{}.png", id);
    let thumb_path = thumb_dir.join(&thumb_filename);
    thumb.save(&thumb_path)?;
    Ok(format!("thumbs/{}", thumb_filename))
}
