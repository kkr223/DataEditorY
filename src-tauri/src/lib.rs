use tauri::Manager;

#[tauri::command]
fn read_cdb(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_cdb(path: String, data: Vec<u8>) -> Result<(), String> {
    std::fs::write(&path, data).map_err(|e| e.to_string())
}

#[tauri::command]
fn copy_image(src: String, dest: String) -> Result<(), String> {
    if let Some(parent) = std::path::Path::new(&dest).parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    std::fs::copy(&src, &dest).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn read_image(path: String) -> Result<Vec<u8>, String> {
    std::fs::read(&path).map_err(|e| e.to_string())
}

#[tauri::command]
fn load_strings_conf(app: tauri::AppHandle) -> Result<String, String> {
    let mut candidates: Vec<std::path::PathBuf> = Vec::new();

    if let Ok(resource_dir) = app.path().resource_dir() {
        candidates.push(resource_dir.join("resources").join("strings.conf"));
        candidates.push(resource_dir.join("strings.conf"));
    }

    if let Ok(current_dir) = std::env::current_dir() {
        candidates.push(current_dir.join("strings.conf"));
        candidates.push(current_dir.join("static").join("strings.conf"));
        candidates.push(current_dir.join("static").join("resources").join("strings.conf"));
    }

    if let Ok(current_exe) = std::env::current_exe() {
        if let Some(exe_dir) = current_exe.parent() {
            candidates.push(exe_dir.join("strings.conf"));
            candidates.push(exe_dir.join("resources").join("strings.conf"));
            if let Some(parent) = exe_dir.parent() {
                candidates.push(parent.join("strings.conf"));
                candidates.push(parent.join("resources").join("strings.conf"));
            }
        }
    }

    for path in candidates {
        if path.exists() {
            return std::fs::read_to_string(&path).map_err(|e| e.to_string());
        }
    }

    Err("strings.conf not found in external locations".to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![read_cdb, write_cdb, copy_image, read_image, load_strings_conf])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
