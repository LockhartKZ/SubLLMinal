/// Read a subtitle the user picked, auto-detecting its text encoding and
/// returning UTF-8.
///
/// Subtitles arrive in many encodings (UTF-8, UTF-8/UTF-16 with a BOM,
/// Windows-1256 for Arabic, Windows-1251 for Cyrillic, etc.). We honour a BOM
/// when present and otherwise let `chardetng` guess, then decode to UTF-8 with
/// `encoding_rs`. Invalid bytes become the replacement character rather than
/// failing the whole file. We use a custom command (instead of the fs plugin)
/// so any path the user explicitly chooses works without fs-scope globs.
fn decode_to_utf8(bytes: &[u8]) -> String {
    let mut detector = chardetng::EncodingDetector::new();
    detector.feed(bytes, true);
    // `decode` re-checks for a BOM and overrides the guess if one is present.
    let guess = detector.guess(None, true);
    let (text, _encoding, _had_errors) = guess.decode(bytes);
    text.into_owned()
}

#[tauri::command]
fn read_text_file(path: String) -> Result<String, String> {
    let bytes = std::fs::read(&path).map_err(|e| format!("Could not read {path}: {e}"))?;
    Ok(decode_to_utf8(&bytes))
}

/// Write UTF-8 text to the path the user picked via the save dialog.
#[tauri::command]
fn write_text_file(path: String, contents: String) -> Result<(), String> {
    std::fs::write(&path, contents).map_err(|e| format!("Could not write {path}: {e}"))
}

/// Open Windows Explorer with the given file selected.
#[tauri::command]
fn reveal_in_explorer(path: String) -> Result<(), String> {
    std::process::Command::new("explorer")
        .arg(format!("/select,{path}"))
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("Could not open Explorer: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            write_text_file,
            reveal_in_explorer
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::decode_to_utf8;

    #[test]
    fn plain_utf8_is_unchanged() {
        assert_eq!(decode_to_utf8("Hello مرحبا".as_bytes()), "Hello مرحبا");
    }

    #[test]
    fn utf8_bom_is_stripped() {
        let mut bytes = vec![0xEF, 0xBB, 0xBF];
        bytes.extend_from_slice("Hi".as_bytes());
        assert_eq!(decode_to_utf8(&bytes), "Hi");
    }

    #[test]
    fn utf16le_bom_is_decoded() {
        // "Hi" encoded UTF-16LE with a byte-order mark.
        let bytes = [0xFF, 0xFE, b'H', 0x00, b'i', 0x00];
        assert_eq!(decode_to_utf8(&bytes), "Hi");
    }

    #[test]
    fn windows_1256_arabic_is_decoded() {
        // A full Windows-1256 line gives the detector enough to guess correctly.
        // Bytes below are "السلام عليكم" in Windows-1256.
        let bytes = [
            0xC7, 0xE1, 0xD3, 0xE1, 0xC7, 0xE3, 0x20, 0xDA, 0xE1, 0xED, 0xE3,
        ];
        let decoded = decode_to_utf8(&bytes);
        assert!(decoded.contains('ا') && decoded.contains('م'), "got {decoded:?}");
    }
}
