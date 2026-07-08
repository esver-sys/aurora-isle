pub mod config;
pub mod island;
pub mod pin;
pub mod screenshot;
pub mod system;

use std::time::{SystemTime, UNIX_EPOCH};

pub(crate) fn now_ts() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}
