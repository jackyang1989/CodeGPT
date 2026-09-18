//! Shared immutable vocabulary for detecting secret-like command/process text.

/// Stable non-secret token prefixes shared by redaction consumers.
pub const CODEGPT_SECRET_PREFIXES: &[&str] = &[
    "cg_pat_",
    "cg_agent_",
    "cg_acct_",
    "cg_oat_",
    "cg_ort_",
    "cg_csec_",
    "cg_pair_",
    "cg_boot_",
];

/// Conservative detector used before emitting command/process previews.
pub fn secret_like_value(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    lower.contains("-----begin")
        || lower.contains("bearer ")
        || lower.contains("api_key")
        || lower.contains("token=")
        || lower.contains("id_rsa")
        || lower.contains("id_ed25519")
        || CODEGPT_SECRET_PREFIXES
            .iter()
            .any(|prefix| lower.contains(prefix))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn preserves_shared_secret_detection_vocabulary() {
        for value in [
            "Bearer abc",
            "api_key=value",
            "token=value",
            "-----BEGIN PRIVATE KEY-----",
            "id_rsa",
            "id_ed25519",
            "cg_pat_demo",
            "cg_agent_demo",
            "cg_acct_demo",
            "cg_oat_demo",
            "cg_ort_demo",
            "cg_csec_demo",
            "cg_pair_demo",
            "cg_boot_demo",
        ] {
            assert!(secret_like_value(value), "{value}");
        }
        assert!(!secret_like_value("cargo check -p codegpt"));
    }
}
