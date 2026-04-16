use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine};
use rand::RngCore;
use sha2::{Digest, Sha256};
use std::fs;
use tauri::AppHandle;

use crate::{APP_IDENTIFIER, CIPHER_KEY_FILE_NAME, SECRET_VERSION_PREFIX};

/// Returns a persistent random cipher key, creating one on first use.
/// This replaces the old environment-variable-based derivation so that
/// the key remains stable even if USERNAME, COMPUTERNAME, etc. change.
pub(crate) fn get_or_create_cipher_key(app: &AppHandle) -> Result<[u8; 32], String> {
    let key_path = crate::ensure_app_config_dir(app)?.join(CIPHER_KEY_FILE_NAME);

    if key_path.exists() {
        let bytes = fs::read(&key_path).map_err(|e| e.to_string())?;
        if bytes.len() == 32 {
            let mut key = [0u8; 32];
            key.copy_from_slice(&bytes);
            return Ok(key);
        }
        // File is corrupt / wrong size 鈥?regenerate below.
    }

    let mut key = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut key);
    fs::write(&key_path, key).map_err(|e| e.to_string())?;
    Ok(key)
}

/// Legacy key derivation (pre-stable-key migration).  Kept only so that
/// secrets encrypted before the migration can still be decrypted once.
fn legacy_cipher_key(app: &AppHandle) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update("DataEditorY::secret-key");
    hasher.update(APP_IDENTIFIER.as_bytes());
    hasher.update(app.package_info().name.as_bytes());

    for key in [
        "COMPUTERNAME",
        "HOSTNAME",
        "USERNAME",
        "USER",
        "APPDATA",
        "HOME",
    ] {
        if let Ok(value) = std::env::var(key) {
            hasher.update(value.as_bytes());
        }
    }

    let digest = hasher.finalize();
    let mut output = [0u8; 32];
    output.copy_from_slice(&digest[..32]);
    output
}

fn encrypt_with_key(key: &[u8; 32], secret_key: &str) -> Result<String, String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|err| err.to_string())?;
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, secret_key.as_bytes())
        .map_err(|err| err.to_string())?;

    Ok(format!(
        "{SECRET_VERSION_PREFIX}:{}:{}",
        BASE64_STANDARD.encode(nonce_bytes),
        BASE64_STANDARD.encode(ciphertext)
    ))
}

fn decrypt_with_key(key: &[u8; 32], encrypted_secret_key: &str) -> Result<String, String> {
    let parts: Vec<&str> = encrypted_secret_key.splitn(3, ':').collect();
    if parts.len() != 3 || parts[0] != SECRET_VERSION_PREFIX {
        return Err("Unsupported secret key format".to_string());
    }

    let nonce_bytes = BASE64_STANDARD
        .decode(parts[1])
        .map_err(|err| err.to_string())?;
    let ciphertext = BASE64_STANDARD
        .decode(parts[2])
        .map_err(|err| err.to_string())?;

    let cipher = Aes256Gcm::new_from_slice(key).map_err(|err| err.to_string())?;
    let plaintext = cipher
        .decrypt(Nonce::from_slice(&nonce_bytes), ciphertext.as_ref())
        .map_err(|err| err.to_string())?;

    String::from_utf8(plaintext).map_err(|err| err.to_string())
}

pub(crate) fn encrypt_secret_key(app: &AppHandle, secret_key: &str) -> Result<String, String> {
    let key = get_or_create_cipher_key(app)?;
    encrypt_with_key(&key, secret_key)
}

/// Tries the stable cipher key first; falls back to the legacy
/// environment-variable-based key for transparent migration.
pub(crate) fn decrypt_secret_key(
    app: &AppHandle,
    encrypted_secret_key: &str,
) -> Result<String, String> {
    let stable_key = get_or_create_cipher_key(app)?;
    if let Ok(plaintext) = decrypt_with_key(&stable_key, encrypted_secret_key) {
        return Ok(plaintext);
    }

    // Legacy fallback 鈥?the secret was encrypted before the migration.
    decrypt_with_key(&legacy_cipher_key(app), encrypted_secret_key)
}
