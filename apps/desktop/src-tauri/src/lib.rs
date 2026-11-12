use std::net::{SocketAddr, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::Duration;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, RunEvent, WindowEvent};

const BACKEND_ADDR: &str = "127.0.0.1:8731";

/// Backend child process, owned by the app. Killed on exit.
struct Backend(Mutex<Option<Child>>);

fn backend_running() -> bool {
    let addr: SocketAddr = BACKEND_ADDR.parse().unwrap();
    TcpStream::connect_timeout(&addr, Duration::from_millis(300)).is_ok()
}

/// Dev: run services/api from the repo venv. Release: bundled sidecar `focus-api.exe` next to the app (added in the installer phase).
fn spawn_backend() -> Option<Child> {
    if backend_running() {
        return None; // already started (e.g. manually) — do not start a second copy
    }
    let mut cmd = if let Some(dir) = dev_api_dir() {
        let py = dir.join(".venv").join("Scripts").join("python.exe");
        let mut c = Command::new(py);
        c.args(["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8731"]).current_dir(dir);
        c
    } else {
        let exe = std::env::current_exe().ok()?.parent()?.join("focus-api.exe");
        Command::new(exe)
    };
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    }
    cmd.stdout(Stdio::null()).stderr(Stdio::null()).spawn().ok()
}

fn dev_api_dir() -> Option<PathBuf> {
    // apps/desktop/src-tauri -> ../../../services/api
    let p = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("..").join("..").join("..").join("services").join("api");
    let p = p.canonicalize().ok()?;
    p.join(".venv").join("Scripts").join("python.exe").exists().then_some(p)
}

fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
    }
}

fn stop_backend(app: &AppHandle) {
    if let Some(state) = app.try_state::<Backend>() {
        if let Some(mut child) = state.0.lock().unwrap().take() {
            // The venv launcher spawns the real interpreter as a child: kill the whole tree.
            #[cfg(windows)]
            {
                use std::os::windows::process::CommandExt;
                let _ = Command::new("taskkill")
                    .args(["/PID", &child.id().to_string(), "/T", "/F"])
                    .creation_flags(0x0800_0000)
                    .status();
            }
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

pub fn run() {
    let app = tauri::Builder::default()
        .setup(|app| {
            app.manage(Backend(Mutex::new(spawn_backend())));

            let show = MenuItem::with_id(app, "show", "Открыть Фокус", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Выход", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("Фокус")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, e| match e.id.as_ref() {
                    "show" => show_main(app),
                    "quit" => {
                        stop_backend(app);
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, e| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = e {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;
            Ok(())
        })
        // Closing the window hides it to the tray; background tasks keep running.
        .on_window_event(|w, e| {
            if let WindowEvent::CloseRequested { api, .. } = e {
                api.prevent_close();
                let _ = w.hide();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Фокус");

    app.run(|handle, event| {
        if let RunEvent::Exit = event {
            stop_backend(handle);
        }
    });
}
