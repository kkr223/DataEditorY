#[cfg(test)]
pub(crate) fn make_temp_dir(label: &str) -> std::path::PathBuf {
    let unique = format!(
        "dataeditory-{label}-{}-{}",
        std::process::id(),
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    );
    let path = std::env::temp_dir().join(unique);
    std::fs::create_dir_all(&path).unwrap();
    path
}

#[cfg(test)]
pub(crate) fn create_test_cdb(path: &std::path::Path, rows: &[(u32, i64)]) {
    let mut cdb = ygopro_cdb_encode_rs::YgoProCdb::create_at_path(path).unwrap();
    let cards: Vec<ygopro_cdb_encode_rs::CardDataEntry> = rows
        .iter()
        .map(|(id, card_type)| ygopro_cdb_encode_rs::CardDataEntry {
            code: *id,
            type_: *card_type as u32,
            ..Default::default()
        })
        .collect();
    cdb.add_cards(&cards).unwrap();
}
