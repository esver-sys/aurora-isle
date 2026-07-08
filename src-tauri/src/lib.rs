mod commands;
mod db;
mod error;
mod models;
mod services;
mod state;

use commands::{config, island, pin, screenshot, system};
use state::AppState;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let mut builder = tauri::Builder::default();

    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = app.get_webview_window("island").map(|w| {
                let _ = w.show();
                let _ = w.set_focus();
            });
        }));
    }

    builder
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            std::fs::create_dir_all(&app_data_dir)?;

            std::fs::create_dir_all(app_data_dir.join("pins"))?;
            std::fs::create_dir_all(app_data_dir.join("thumbs"))?;
            std::fs::create_dir_all(app_data_dir.join("snips"))?;

            let db_path = app_data_dir.join("app.db");
            let connection = services::database::init_database(&db_path)?;

            app.manage(AppState::new(connection, app_data_dir));

            tracing::info!("Aurora Isle initialized successfully");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            island::set_window_size,
            island::set_window_position,
            island::get_window_position,
            island::get_monitor_info,
            pin::pin_image,
            pin::unpin_image,
            pin::update_pin_transform,
            pin::get_open_pins,
            pin::get_pin_by_id,
            pin::get_image_path,
            config::get_config,
            config::set_config,
            system::toggle_autostart,
            system::is_autostart_enabled,
            screenshot::capture_screen,
            screenshot::crop_image,
        ])
        .run(tauri::generate_context!())
        .expect("error while running aurora-isle");
}
