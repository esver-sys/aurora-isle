use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Database error: {0}")]
    Database(#[from] rusqlite::Error),

    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    #[error("Image error: {0}")]
    Image(#[from] image::ImageError),

    #[error("Tauri error: {0}")]
    Tauri(#[from] tauri::Error),

    #[error("Clipboard error: {0}")]
    Clipboard(String),

    #[error("Window error: {0}")]
    Window(String),

    #[error("Config not found: {0}")]
    ConfigNotFound(String),

    #[error("Pin not found: {0}")]
    PinNotFound(String),

    #[error("Lock error: {0}")]
    Lock(String),

    #[error("{0}")]
    General(String),
}

pub type Result<T> = std::result::Result<T, AppError>;

impl serde::Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> std::result::Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(self.to_string().as_ref())
    }
}
