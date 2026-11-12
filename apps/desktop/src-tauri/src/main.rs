// Hide the extra console window in release builds on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    focus_lib::run()
}
