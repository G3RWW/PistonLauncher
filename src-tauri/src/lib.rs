// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn launch_app(path: String) -> Result<u32, String> {
    let child = std::process::Command::new(path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(child.id())
}

use sysinfo::{Pid, System};

#[tauri::command]
fn is_running(pid: u32) -> bool {
    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    sys.process(Pid::from_u32(pid)).is_some()
}

#[tauri::command]
fn find_pid_by_name(name: String) -> Option<u32> {
    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    for (pid, process) in sys.processes() {
        if process.name().to_string_lossy().to_lowercase().contains(&name.to_lowercase()) {
            return Some(pid.as_u32());
        }
    }
    None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![launch_app, is_running, find_pid_by_name])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
