use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use rusqlite::Connection;

/// 贴图窗口池状态：预创建热备窗口，消除截图贴图热路径的 webview 创建开销。
///
/// 设计参考 Snipaste 的"贴图窗口即时就绪"思路：
/// - 启动时预创建一个隐藏窗口（pin-0）作为初始热备
/// - pin_image 激活当前热备窗口显示新贴图，同时后台异步补充下一个热备
/// - 双向映射用于关闭/隐藏时按 pinId 定位窗口，以及 pin:ready 时按 label 补发 pinId
pub struct PinPoolState {
    /// pinId -> 窗口 label，用于 unpin/hide/delete 时定位目标窗口
    pub pin_labels: Mutex<HashMap<String, String>>,
    /// 窗口 label -> pinId，用于窗口前端就绪后补发 pin:activate
    label_pins: Mutex<HashMap<String, String>>,
    /// 下一个待激活的热备窗口 label
    pub next_staging: Mutex<String>,
    /// 窗口 label 序号计数器（pin-0 为初始热备，后续递增）
    pub seq: Mutex<u64>,
}

impl PinPoolState {
    pub fn new(initial_staging: &str) -> Self {
        Self {
            pin_labels: Mutex::new(HashMap::new()),
            label_pins: Mutex::new(HashMap::new()),
            next_staging: Mutex::new(initial_staging.to_string()),
            // pin-0 已用作初始热备，下一个新建窗口从 pin-1 开始
            seq: Mutex::new(1),
        }
    }

    /// 查询 pin 当前绑定的窗口 label。
    pub fn label_for_pin(&self, pin_id: &str) -> Option<String> {
        self.pin_labels
            .lock()
            .expect("pin pool pin_labels poisoned")
            .get(pin_id)
            .cloned()
    }

    /// 查询窗口 label 当前承载的 pinId，用于 pin:ready 补发激活事件。
    pub fn pin_for_label(&self, label: &str) -> Option<String> {
        self.label_pins
            .lock()
            .expect("pin pool label_pins poisoned")
            .get(label)
            .cloned()
    }

    /// 建立 pinId 与窗口 label 的双向绑定；若 pin 或 label 已有旧绑定，会同步清理旧关系。
    pub fn assign_pin_label(&self, pin_id: &str, label: &str) {
        let mut pin_labels = self
            .pin_labels
            .lock()
            .expect("pin pool pin_labels poisoned");
        let mut label_pins = self
            .label_pins
            .lock()
            .expect("pin pool label_pins poisoned");

        // 核心逻辑：同一个 pin 重新分配窗口时，必须删除旧 label 的反向索引，
        // 否则旧窗口 ready 后会收到错误的 pin:activate 补发。
        if let Some(old_label) = pin_labels.insert(pin_id.to_string(), label.to_string()) {
            label_pins.remove(&old_label);
        }

        // 同一个热备窗口被新 pin 接管时，清理旧 pin 的正向索引，保证一个 label 只归属一个 pin。
        if let Some(old_pin_id) = label_pins.insert(label.to_string(), pin_id.to_string()) {
            if old_pin_id != pin_id {
                pin_labels.remove(&old_pin_id);
            }
        }
    }

    /// 删除 pinId 与窗口 label 的双向绑定，返回原窗口 label。
    pub fn remove_pin_label(&self, pin_id: &str) -> Option<String> {
        let mut pin_labels = self
            .pin_labels
            .lock()
            .expect("pin pool pin_labels poisoned");
        let mut label_pins = self
            .label_pins
            .lock()
            .expect("pin pool label_pins poisoned");

        let label = pin_labels.remove(pin_id)?;
        label_pins.remove(&label);
        Some(label)
    }

    /// 原子领取当前热备 label，并立即推进下一个热备 label，避免并发贴图复用同一窗口。
    pub fn reserve_staging_label(&self) -> String {
        let mut next_staging = self
            .next_staging
            .lock()
            .expect("pin pool next_staging poisoned");
        let label = next_staging.clone();
        let mut seq = self.seq.lock().expect("pin pool seq poisoned");
        *next_staging = format!("pin-{}", *seq);
        *seq += 1;
        label
    }

    /// 获取当前热备 label，用于激活后补建隐藏窗口。
    pub fn current_staging_label(&self) -> String {
        self.next_staging
            .lock()
            .expect("pin pool next_staging poisoned")
            .clone()
    }
}

pub struct AppState {
    pub db: Mutex<Connection>,
    pub app_data_dir: PathBuf,
    pub pin_pool: PinPoolState,
}

impl AppState {
    pub fn new(db: Connection, app_data_dir: PathBuf) -> Self {
        Self {
            db: Mutex::new(db),
            app_data_dir,
            pin_pool: PinPoolState::new("pin-0"),
        }
    }

    pub fn db(&self) -> Result<std::sync::MutexGuard<'_, Connection>, crate::error::AppError> {
        self.db
            .lock()
            .map_err(|e| crate::error::AppError::Lock(e.to_string()))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pin_pool_assigns_bidirectional_labels_and_removes_both_sides() {
        let pool = PinPoolState::new("pin-0");

        pool.assign_pin_label("pin-a", "pin-0");

        assert_eq!(pool.label_for_pin("pin-a"), Some("pin-0".to_string()));
        assert_eq!(pool.pin_for_label("pin-0"), Some("pin-a".to_string()));

        assert_eq!(pool.remove_pin_label("pin-a"), Some("pin-0".to_string()));
        assert_eq!(pool.label_for_pin("pin-a"), None);
        assert_eq!(pool.pin_for_label("pin-0"), None);
    }

    #[test]
    fn pin_pool_reassigning_pin_clears_old_label_reverse_mapping() {
        let pool = PinPoolState::new("pin-0");

        pool.assign_pin_label("pin-a", "pin-0");
        pool.assign_pin_label("pin-a", "pin-1");

        assert_eq!(pool.label_for_pin("pin-a"), Some("pin-1".to_string()));
        assert_eq!(pool.pin_for_label("pin-0"), None);
        assert_eq!(pool.pin_for_label("pin-1"), Some("pin-a".to_string()));
    }

    #[test]
    fn pin_pool_reserves_unique_staging_labels_atomically() {
        let pool = PinPoolState::new("pin-0");

        assert_eq!(pool.reserve_staging_label(), "pin-0");
        assert_eq!(pool.reserve_staging_label(), "pin-1");
        assert_eq!(pool.reserve_staging_label(), "pin-2");
        assert_eq!(pool.current_staging_label(), "pin-3");
    }
}
