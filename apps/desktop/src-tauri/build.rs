fn main() {
    // the .exe icon is embedded at build time: rebuild resources when icons change
    println!("cargo:rerun-if-changed=icons");
    tauri_build::build()
}
