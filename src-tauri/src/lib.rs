// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use serde::Serialize;
use std::collections::HashSet;
use walkdir::WalkDir;

#[derive(Serialize)]
struct ScannedApp {
    name: String,
    path: String,
    category: String,
}

const KNOWN_VENDOR_PREFIXES: &[&str] = &[
    "Adobe", "Microsoft", "Google", "Mozilla", "Oracle", "Autodesk",
    "JetBrains", "Valve", "Epic Games", "Blizzard", "Ubisoft", "EA",
    "Discord", "Zoom", "Slack", "Spotify", "NVIDIA", "AMD", "Intel",
    "Corel", "Dropbox", "Steam", "Prusa", "Unity",
];

// Products whose shortcuts don't mention their vendor at all
// (e.g. "PowerPoint" instead of "Microsoft PowerPoint").
const KNOWN_PRODUCTS: &[(&str, &str)] = &[
    ("onenote", "Microsoft"),
    ("powerpoint", "Microsoft"),
    ("outlook", "Microsoft"),
    ("excel", "Microsoft"),
    ("access", "Microsoft"),
    ("publisher", "Microsoft"),
    ("teams", "Microsoft"),
    ("skype", "Microsoft"),
    ("visio", "Microsoft"),
];

fn guess_vendor_from_name(name: &str) -> Option<String> {
    let lower = name.to_lowercase();

    for vendor in KNOWN_VENDOR_PREFIXES {
        if lower.starts_with(&vendor.to_lowercase()) {
            return Some(vendor.to_string());
        }
    }
    for (product, vendor) in KNOWN_PRODUCTS {
        if lower.contains(product) {
            return Some(vendor.to_string());
        }
    }
    None
}

#[tauri::command]
fn scan_start_menu() -> Vec<ScannedApp> {
    let mut results = Vec::new();
    let mut seen_paths: HashSet<String> = HashSet::new();

    let mut dirs = Vec::new();
    if let Ok(program_data) = std::env::var("PROGRAMDATA") {
        dirs.push(format!("{}\\Microsoft\\Windows\\Start Menu\\Programs", program_data));
    }
    if let Ok(appdata) = std::env::var("APPDATA") {
        dirs.push(format!("{}\\Microsoft\\Windows\\Start Menu\\Programs", appdata));
    }

    for base_dir in dirs {
        let base_path = std::path::Path::new(&base_dir);
        for entry in WalkDir::new(&base_dir).into_iter().filter_map(|e| e.ok()) {
            let path = entry.path();
            let is_lnk = path
                .extension()
                .and_then(|e| e.to_str())
                .map(|e| e.eq_ignore_ascii_case("lnk"))
                .unwrap_or(false);
            if !is_lnk {
                continue;
            }

            if let Ok(shortcut) = lnk::ShellLink::open(path, lnk::encoding::WINDOWS_1252) {
                if let Some(target) = shortcut.link_target() {
                    if target.to_lowercase().ends_with(".exe") && seen_paths.insert(target.clone()) {
                        let name = path
                            .file_stem()
                            .and_then(|s| s.to_str())
                            .unwrap_or("Unknown")
                            .to_string();

                        let subfolder = path
                            .strip_prefix(base_path)
                            .ok()
                            .and_then(|rel| rel.parent())
                            .and_then(|parent| parent.file_name())
                            .and_then(|s| s.to_str())
                            .filter(|s| !s.is_empty())
                            .map(|s| s.to_string());

                        // A subfolder that just repeats the app's own name isn't a
                        // useful vendor grouping (e.g. "Oracle VirtualBox\Oracle VirtualBox.lnk")
                        let is_useful_subfolder = subfolder
                            .as_ref()
                            .map(|sf| sf.to_lowercase() != name.to_lowercase())
                            .unwrap_or(false);

                        let category = if is_useful_subfolder {
                            subfolder.unwrap()
                        } else {
                            guess_vendor_from_name(&name).unwrap_or_else(|| "Uncategorized".to_string())
                        };

                        results.push(ScannedApp { name, path: target, category });
                    }
                }
            }
        }
    }

    results
}

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
use windows_icons::get_icon_base64_by_path;

#[tauri::command]
fn get_app_icon(path: String) -> String {
    get_icon_base64_by_path(&path)
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
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .invoke_handler(tauri::generate_handler![
        launch_app, is_running, find_pid_by_name, get_app_icon, scan_start_menu
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
