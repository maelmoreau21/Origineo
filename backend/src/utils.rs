use chrono::NaiveDate;
use unicode_normalization::UnicodeNormalization;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::models::DEFAULT_TREE_ID;

pub fn parse_tree_id(tree_id: Option<&str>) -> AppResult<Uuid> {
    let raw = tree_id.unwrap_or(DEFAULT_TREE_ID).trim();
    let raw = if raw.is_empty() { DEFAULT_TREE_ID } else { raw };
    Uuid::parse_str(raw).map_err(|_| AppError::BadRequest(format!("Invalid treeId UUID: {}", raw)))
}

pub fn normalize_text(value: &str) -> String {
    let decomposed: String = value
        .nfd()
        .filter(|c| !unicode_normalization::char::is_combining_mark(*c))
        .collect();

    let mut out = String::with_capacity(decomposed.len());
    let mut last_space = true;

    for ch in decomposed.chars() {
        let lower = ch.to_ascii_lowercase();
        if lower.is_ascii_alphanumeric() {
            out.push(lower);
            last_space = false;
        } else if !last_space {
            out.push(' ');
            last_space = true;
        }
    }

    out.trim().to_string()
}

pub struct NormalizedPersonFields {
    pub given_names_normalized: Option<String>,
    pub surname_normalized: Option<String>,
    pub primary_name_normalized: Option<String>,
    pub birth_year: Option<i32>,
    pub death_year: Option<i32>,
}

pub fn build_normalized_person_fields(
    given_names: &str,
    usage_surname: Option<&str>,
    birth_surname: Option<&str>,
    birth_date: Option<NaiveDate>,
    death_date: Option<NaiveDate>,
) -> NormalizedPersonFields {
    let surname = usage_surname
        .filter(|s| !s.trim().is_empty())
        .or_else(|| birth_surname.filter(|s| !s.trim().is_empty()));

    let given_norm = normalize_text(given_names);
    let surname_norm = surname.map(normalize_text).unwrap_or_default();

    let combined = match (!given_norm.is_empty(), !surname_norm.is_empty()) {
        (true, true) => format!("{} {}", given_norm, surname_norm),
        (true, false) => given_norm.clone(),
        (false, true) => surname_norm.clone(),
        (false, false) => String::new(),
    };

    use chrono::Datelike;

    NormalizedPersonFields {
        given_names_normalized: if given_norm.is_empty() {
            None
        } else {
            Some(given_norm)
        },
        surname_normalized: if surname_norm.is_empty() {
            None
        } else {
            Some(surname_norm)
        },
        primary_name_normalized: if combined.is_empty() {
            None
        } else {
            Some(combined)
        },
        birth_year: birth_date.map(|d| d.year()),
        death_year: death_date.map(|d| d.year()),
    }
}

pub fn parse_optional_date(raw: Option<&str>) -> Option<NaiveDate> {
    let raw = raw?.trim();
    if raw.is_empty() {
        return None;
    }

    // Standard YYYY-MM-DD or ISO datetime prefix
    let date_part = if raw.len() >= 10 { &raw[..10] } else { raw };
    if let Ok(d) = NaiveDate::parse_from_str(date_part, "%Y-%m-%d") {
        return Some(d);
    }

    // GEDCOM style dates: "15 MAR 1920", "ABT 1890", "1920", etc.
    parse_gedcom_date(raw)
}

pub fn parse_gedcom_date(raw: &str) -> Option<NaiveDate> {
    let cleaned = raw
        .trim()
        .to_uppercase();

    // Strip prefixes like ABT, EST, CAL, BEF, AFT, BET ... AND ...
    let cleaned = regex::Regex::new(r"^(ABT|EST|CAL|BEF|AFT|BET|FROM|TO)\s+")
        .ok()?
        .replace(&cleaned, "")
        .to_string();
    let cleaned = regex::Regex::new(r"\s+(AND|TO)\s+.*$")
        .ok()?
        .replace(&cleaned, "")
        .trim()
        .to_string();

    if let Ok(d) = NaiveDate::parse_from_str(&cleaned, "%Y-%m-%d") {
        return Some(d);
    }

    let parts: Vec<&str> = cleaned.split_whitespace().collect();
    let month_num = |m: &str| -> Option<u32> {
        match m {
            "JAN" => Some(1),
            "FEB" | "FEV" => Some(2),
            "MAR" => Some(3),
            "APR" | "AVR" => Some(4),
            "MAY" | "MAI" => Some(5),
            "JUN" | "JUI" => Some(6),
            "JUL" => Some(7),
            "AUG" | "AOU" => Some(8),
            "SEP" => Some(9),
            "OCT" => Some(10),
            "NOV" => Some(11),
            "DEC" => Some(12),
            _ => None,
        }
    };

    match parts.as_slice() {
        [day_s, mon_s, year_s] => {
            let day: u32 = day_s.parse().ok()?;
            let month = month_num(mon_s)?;
            let year: i32 = year_s.parse().ok()?;
            NaiveDate::from_ymd_opt(year, month, day)
        }
        [mon_s, year_s] => {
            let month = month_num(mon_s)?;
            let year: i32 = year_s.parse().ok()?;
            NaiveDate::from_ymd_opt(year, month, 1)
        }
        [year_s] => {
            let year: i32 = year_s.parse().ok()?;
            if (100..=3000).contains(&year) {
                NaiveDate::from_ymd_opt(year, 1, 1)
            } else {
                None
            }
        }
        _ => None,
    }
}

pub fn format_gedcom_date(date: NaiveDate) -> String {
    use chrono::Datelike;
    let months = [
        "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
    ];
    let m = months[(date.month0() as usize).min(11)];
    format!("{} {} {}", date.day(), m, date.year())
}

/// Dice bigram similarity (0.0 to 1.0)
pub fn bigram_similarity(a: &str, b: &str) -> f64 {
    let a = normalize_text(a);
    let b = normalize_text(b);
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }
    if a == b {
        return 1.0;
    }
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    if a_chars.len() < 2 || b_chars.len() < 2 {
        return 0.0;
    }

    let mut a_bigrams = Vec::with_capacity(a_chars.len() - 1);
    for i in 0..a_chars.len() - 1 {
        a_bigrams.push((a_chars[i], a_chars[i + 1]));
    }

    let mut b_bigrams = Vec::with_capacity(b_chars.len() - 1);
    for i in 0..b_chars.len() - 1 {
        b_bigrams.push((b_chars[i], b_chars[i + 1]));
    }

    let total = (a_bigrams.len() + b_bigrams.len()) as f64;
    let mut matches = 0usize;
    let mut used = vec![false; b_bigrams.len()];

    for bg_a in &a_bigrams {
        for (j, bg_b) in b_bigrams.iter().enumerate() {
            if !used[j] && bg_a == bg_b {
                used[j] = true;
                matches += 1;
                break;
            }
        }
    }

    (2.0 * matches as f64) / total
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_normalize_text_strips_accents_and_punctuation() {
        assert_eq!(normalize_text("Hélène-François d'Orléans"), "helene francois d orleans");
        assert_eq!(normalize_text("  Éléonore   Dupré  "), "eleonore dupre");
    }

    #[test]
    fn test_parse_and_format_gedcom_dates() {
        let d1 = parse_gedcom_date("15 MAR 1920").unwrap();
        assert_eq!(d1, NaiveDate::from_ymd_opt(1920, 3, 15).unwrap());
        assert_eq!(format_gedcom_date(d1), "15 MAR 1920");

        let d2 = parse_gedcom_date("ABT 1885").unwrap();
        assert_eq!(d2, NaiveDate::from_ymd_opt(1885, 1, 1).unwrap());
    }

    #[test]
    fn test_bigram_similarity() {
        assert_eq!(bigram_similarity("Moreau", "Moreau"), 1.0);
        assert!(bigram_similarity("Moreau", "Morau") > 0.65);
        assert!(bigram_similarity("Moreau", "Dupont") < 0.25);
    }
}
