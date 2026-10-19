use crate::PersistedAppSettings;
use std::collections::HashSet;

pub(crate) fn validate_script_snippets(text: &str) -> Result<(), String> {
    let value: serde_json::Value = serde_json::from_str(text).map_err(|err| err.to_string())?;
    let entries = value.as_object().ok_or("Snippets must be a JSON object")?;
    let mut prefixes = HashSet::new();
    for (name, value) in entries {
        if name.trim().is_empty() {
            return Err("Snippet names cannot be empty".into());
        }
        let item = value.as_object().ok_or("Each snippet must be an object")?;
        let prefix = item
            .get("prefix")
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .trim();
        if prefix.is_empty() || prefix.chars().any(char::is_whitespace) {
            return Err(format!("Snippet {name} needs a prefix without whitespace"));
        }
        if !prefixes.insert(prefix.to_lowercase()) {
            return Err(format!("Duplicate snippet prefix: {prefix}"));
        }
        let body = match item.get("body") {
            Some(serde_json::Value::String(text)) => text.clone(),
            Some(serde_json::Value::Array(lines)) if lines.iter().all(|line| line.is_string()) => {
                lines
                    .iter()
                    .map(|line| line.as_str().unwrap())
                    .collect::<Vec<_>>()
                    .join("\n")
            }
            _ => {
                return Err(format!(
                    "Snippet {name} needs text or an array of text lines"
                ))
            }
        };
        if body.trim().is_empty() {
            return Err(format!("Snippet {name} needs a nonempty body"));
        }
        if item
            .get("description")
            .is_some_and(|value| !value.is_string())
        {
            return Err(format!("Snippet {name} description must be text"));
        }
    }
    Ok(())
}

pub(crate) fn initialize_script_snippets(
    settings: &mut PersistedAppSettings,
    defaults: impl FnOnce() -> Result<String, String>,
) -> Result<bool, String> {
    if let Some(text) = &settings.script_snippets {
        validate_script_snippets(text)?;
        return Ok(false);
    }
    let text = defaults()?;
    validate_script_snippets(&text)?;
    settings.script_snippets = Some(text);
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn imports_legacy_snippets_once_and_keeps_user_edits_across_updates() {
        let mut settings = PersistedAppSettings::default();
        let legacy =
            r##"{"mine":{"prefix":"#mine","body":["-- legacy $1"],"description":"my hint"}}"##;
        assert!(initialize_script_snippets(&mut settings, || Ok(legacy.into())).unwrap());
        let encoded = serde_json::to_string(&settings).unwrap();
        let mut restored: PersistedAppSettings = serde_json::from_str(&encoded).unwrap();
        assert!(!initialize_script_snippets(&mut restored, || panic!(
            "must not read updated defaults"
        ))
        .unwrap());
        assert_eq!(restored.script_snippets.as_deref(), Some(legacy));
        restored.script_snippets = Some("{}".into());
        assert!(!initialize_script_snippets(&mut restored, || panic!(
            "must preserve deliberate deletion"
        ))
        .unwrap());
        assert_eq!(restored.script_snippets.as_deref(), Some("{}"));
    }

    #[test]
    fn validates_shipped_defaults_and_rejects_bad_entries() {
        validate_script_snippets(include_str!("../../../static/resources/snippets.json")).unwrap();
        for invalid in [
            "[]",
            "broken",
            r#"{"x":{"prefix":"","body":"text"}}"#,
            r##"{"a":{"prefix":"#a","body":"one"},"b":{"prefix":"#A","body":"two"}}"##,
            r#"{"x":{"prefix":"x","body":[1]}}"#,
            r#"{"x":{"prefix":"x","body":""}}"#,
        ] {
            assert!(validate_script_snippets(invalid).is_err(), "{invalid}");
        }
    }
}
