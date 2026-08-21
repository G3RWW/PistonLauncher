use sysinfo::{Pid, System};
use serde::Serialize;
use std::collections::HashSet;
use std::ffi::c_void;
use walkdir::WalkDir;
use windows_icons::get_icon_base64_by_path;
use windows::core::PCWSTR;
use windows::core::BOOL;
use windows::Win32::Foundation::{HWND, LPARAM, RECT};
use windows::Win32::Storage::FileSystem::{GetFileVersionInfoSizeW, GetFileVersionInfoW, VerQueryValueW};
use windows::Win32::UI::WindowsAndMessaging::{
    GetForegroundWindow, GetWindowThreadProcessId, EnumWindows, IsWindowVisible,
    GetWindowTextLengthW, GetWindowRect,
};

// ============================================================
// Launch + process tracking
// ============================================================

#[tauri::command]
fn launch_app(path: String) -> Result<u32, String> {
    let child = std::process::Command::new(path)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(child.id())
}

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

// ============================================================
// Icon extraction
// ============================================================

#[tauri::command]
fn get_app_icon(path: String) -> String {
    get_icon_base64_by_path(&path)
}

// ============================================================
// Vendor detection — reads the exe's own embedded "Company Name"
// metadata (the same field shown in File Properties -> Details),
// rather than guessing from names or folders.
// ============================================================

fn get_company_name(path: &str) -> Option<String> {
    unsafe {
        let path_wide: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
        let path_pcwstr = PCWSTR::from_raw(path_wide.as_ptr());

        let size = GetFileVersionInfoSizeW(path_pcwstr, None);
        if size == 0 {
            return None;
        }

        let mut data = vec![0u8; size as usize];
        let result = GetFileVersionInfoW(path_pcwstr, Some(0), size, data.as_mut_ptr() as *mut c_void);
        if result.is_err() {
            return None;
        }

        // Find which language/codepage this file's string table actually uses.
        let mut translation_ptr: *mut c_void = std::ptr::null_mut();
        let mut translation_len: u32 = 0;
        let query_translation: Vec<u16> = "\\VarFileInfo\\Translation\0".encode_utf16().collect();
        let result = VerQueryValueW(
            data.as_ptr() as *const c_void,
            PCWSTR::from_raw(query_translation.as_ptr()),
            &mut translation_ptr as *mut _ as *mut *mut c_void,
            &mut translation_len,
        );
        if !result.as_bool() || translation_ptr.is_null() || translation_len < 4 {
            return None;
        }

        let lang_codepage = std::slice::from_raw_parts(translation_ptr as *const u16, 2);
        let query = format!("\\StringFileInfo\\{:04x}{:04x}\\CompanyName\0", lang_codepage[0], lang_codepage[1]);
        let query_wide: Vec<u16> = query.encode_utf16().collect();

        let mut value_ptr: *mut c_void = std::ptr::null_mut();
        let mut value_len: u32 = 0;
        let result = VerQueryValueW(
            data.as_ptr() as *const c_void,
            PCWSTR::from_raw(query_wide.as_ptr()),
            &mut value_ptr as *mut _ as *mut *mut c_void,
            &mut value_len,
        );
        if !result.as_bool() || value_ptr.is_null() || value_len == 0 {
            return None;
        }

        let value_slice = std::slice::from_raw_parts(value_ptr as *const u16, (value_len as usize).saturating_sub(1));
        let company = String::from_utf16_lossy(value_slice).trim().to_string();

        if company.is_empty() { None } else { Some(company) }
    }
}

#[tauri::command]
fn get_exe_vendor(path: String) -> Option<String> {
    get_company_name(&path)
}

// ============================================================
// Start Menu scan
// ============================================================

#[derive(Serialize)]
struct ScannedApp {
    name: String,
    path: String,
    category: String,
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

                        // Skip uninstallers — not something you'd add to a launcher
                        if name.to_lowercase().contains("uninstall") {
                            continue;
                        }

                        let subfolder = path
                            .strip_prefix(base_path)
                            .ok()
                            .and_then(|rel| rel.parent())
                            .and_then(|parent| parent.file_name())
                            .and_then(|s| s.to_str())
                            .filter(|s| !s.is_empty())
                            .map(|s| s.to_string());

                        let is_useful_subfolder = subfolder
                            .as_ref()
                            .map(|sf| sf.to_lowercase() != name.to_lowercase())
                            .unwrap_or(false);

                        // Real embedded vendor metadata always wins over a guessed folder name.
                        let category = get_company_name(&target)
                            .or_else(|| if is_useful_subfolder { subfolder.clone() } else { None })
                            .unwrap_or_else(|| "Uncategorized".to_string());

                        results.push(ScannedApp { name, path: target, category });
                    }
                }
            }
        }
    }

    results
}

// ============================================================
// Foreground window detection — used to gate the overlay so it
// only opens when a tracked, launched app currently has focus.
// ============================================================

#[tauri::command]
fn get_foreground_pid() -> Option<u32> {
    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.0.is_null() {
            return None;
        }
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == 0 { None } else { Some(pid) }
    }
}

// Piston's own process id — the main window and the overlay window run
// in the same process, so comparing the foreground pid against this one
// tells us "the launcher or overlay itself has focus," distinct from
// "the tracked app has focus" or "the user switched to something else."
#[tauri::command]
fn get_current_pid() -> u32 {
    std::process::id()
}

// ============================================================
// Window bounds lookup — used to size/position the overlay to
// match the tracked app's actual on-screen window, live.
// ============================================================

struct EnumData {
    target_pid: u32,
    found_hwnd: Option<HWND>,
}

unsafe extern "system" fn enum_proc(hwnd: HWND, lparam: LPARAM) -> BOOL {
    let data = &mut *(lparam.0 as *mut EnumData);
    let mut pid: u32 = 0;
    GetWindowThreadProcessId(hwnd, Some(&mut pid));
    if pid == data.target_pid && IsWindowVisible(hwnd).as_bool() && GetWindowTextLengthW(hwnd) > 0 {
        data.found_hwnd = Some(hwnd);
        return BOOL(0); // found it — stop enumerating
    }
    BOOL(1) // keep looking
}

#[tauri::command]
fn get_window_rect_for_pid(pid: u32) -> Option<(i32, i32, i32, i32)> {
    unsafe {
        let mut data = EnumData { target_pid: pid, found_hwnd: None };
        let _ = EnumWindows(Some(enum_proc), LPARAM(&mut data as *mut _ as isize));
        let hwnd = data.found_hwnd?;

        let mut rect = RECT::default();
        if GetWindowRect(hwnd, &mut rect).is_err() {
            return None;
        }
        Some((rect.left, rect.top, rect.right - rect.left, rect.bottom - rect.top))
    }
}

// ============================================================
// Courses (task file uploads)
// ============================================================

#[tauri::command]
fn copy_file_to_folder(source_path: String, dest_folder: String) -> Result<String, String> {
    let source = std::path::Path::new(&source_path);
    let file_name = source
        .file_name()
        .ok_or_else(|| "Source path has no file name".to_string())?;

    let dest_dir = std::path::Path::new(&dest_folder);
    std::fs::create_dir_all(dest_dir).map_err(|e| e.to_string())?;

    let dest_path = dest_dir.join(file_name);
    std::fs::copy(&source, &dest_path).map_err(|e| e.to_string())?;

    Ok(file_name.to_string_lossy().to_string())
}

// ============================================================
// App entry point
// ============================================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            launch_app,
            is_running,
            find_pid_by_name,
            get_app_icon,
            scan_start_menu,
            get_exe_vendor,
            get_foreground_pid,
            get_current_pid,
            get_window_rect_for_pid,
            copy_file_to_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}