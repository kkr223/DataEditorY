use std::collections::HashMap;

use serde_json::{json, Value};

use super::models::{
    CardRuleOperand, CardSearchExpression, CompareOperator, MaskField, NumericField, TextField,
};

const MAX_ID_VALUE: u64 = 4_294_967_295;
const MAX_ID_DIGITS: usize = 10;
const IN_CHUNK_SIZE: usize = 400;

pub struct CompiledSearch {
    pub clause: String,
    pub params: HashMap<String, Value>,
}

struct SearchCompiler {
    params: HashMap<String, Value>,
    next_param: usize,
}

impl SearchCompiler {
    fn new() -> Self {
        Self {
            params: HashMap::new(),
            next_param: 0,
        }
    }

    fn bind(&mut self, value: Value) -> String {
        let key = format!("q{}", self.next_param);
        self.next_param += 1;
        self.params.insert(key.clone(), value);
        format!(":{key}")
    }

    fn compile(&mut self, expression: &CardSearchExpression) -> Result<String, String> {
        match expression {
            CardSearchExpression::All => Ok("1=1".to_string()),
            CardSearchExpression::And { expressions } => self.compile_group(expressions, "AND"),
            CardSearchExpression::Or { expressions } => self.compile_group(expressions, "OR"),
            CardSearchExpression::Not { expression } => {
                Ok(format!("(NOT {})", self.compile(expression)?))
            }
            CardSearchExpression::TextContains { field, value } => {
                let column = match field {
                    TextField::Name => "texts.name",
                    TextField::Desc => "texts.desc",
                };
                let escaped = value
                    .replace('/', "//")
                    .replace('%', "/%")
                    .replace('_', "/_");
                let parameter = self.bind(json!(format!("%{escaped}%")));
                Ok(format!("({column} LIKE {parameter} ESCAPE '/')"))
            }
            CardSearchExpression::OrderedTextContains { field, values } => {
                let column = match field {
                    TextField::Name => "texts.name",
                    TextField::Desc => "texts.desc",
                };
                let escaped = values
                    .iter()
                    .map(|value| {
                        value
                            .replace('/', "//")
                            .replace('%', "/%")
                            .replace('_', "/_")
                    })
                    .collect::<Vec<_>>();
                if escaped.is_empty() {
                    return Ok("1=1".to_string());
                }
                let parameter = self.bind(json!(format!("%{}%", escaped.join("%"))));
                Ok(format!("({column} LIKE {parameter} ESCAPE '/')"))
            }
            CardSearchExpression::IdPrefix { value } => self.compile_id_prefix(value),
            CardSearchExpression::Compare {
                field,
                operator,
                value,
            } => {
                let column = numeric_column(field);
                let operator = compare_operator(operator);
                let parameter = self.bind(json!(value));
                Ok(format!("({column} {operator} {parameter})"))
            }
            CardSearchExpression::MaskContains { field, value } => {
                let column = mask_column(field);
                let parameter = self.bind(json!(value));
                Ok(format!("(({column} & {parameter}) = {parameter})"))
            }
            CardSearchExpression::MaskExcludes { field, value } => {
                let column = mask_column(field);
                let parameter = self.bind(json!(value));
                Ok(format!("(({column} & {parameter}) = 0)"))
            }
            CardSearchExpression::SetcodeContains { value } => {
                let parameter = self.bind(json!(value & 0xffff));
                Ok(format!(
                    "(((CAST(datas.setcode AS INTEGER) >> 0) & 65535) = {0} \
                    OR ((CAST(datas.setcode AS INTEGER) >> 16) & 65535) = {0} \
                    OR ((CAST(datas.setcode AS INTEGER) >> 32) & 65535) = {0} \
                    OR ((CAST(datas.setcode AS INTEGER) >> 48) & 65535) = {0})",
                    parameter
                ))
            }
            CardSearchExpression::InIds { values } => self.compile_ids(values),
            CardSearchExpression::RuleCompare {
                left,
                operator,
                right,
            } => {
                let left = self.compile_operand(left);
                let right = self.compile_operand(right);
                Ok(format!(
                    "({left} {} {right})",
                    compare_operator(operator)
                ))
            }
            CardSearchExpression::RuleMaskContains { field, operand } => {
                let column = mask_column(field);
                let operand = self.compile_operand(operand);
                Ok(format!("(({column} & {operand}) = {operand})"))
            }
        }
    }

    fn compile_operand(&mut self, operand: &CardRuleOperand) -> String {
        match operand {
            CardRuleOperand::Field { field } => numeric_column(field).to_string(),
            CardRuleOperand::Value { value } => self.bind(json!(value)),
        }
    }

    fn compile_group(
        &mut self,
        expressions: &[CardSearchExpression],
        operator: &str,
    ) -> Result<String, String> {
        if expressions.is_empty() {
            return Ok(if operator == "AND" { "1=1" } else { "1=0" }.to_string());
        }
        let clauses = expressions
            .iter()
            .map(|expression| self.compile(expression))
            .collect::<Result<Vec<_>, _>>()?;
        Ok(format!("({})", clauses.join(&format!(" {operator} "))))
    }

    fn compile_id_prefix(&mut self, value: &str) -> Result<String, String> {
        if value.is_empty()
            || value.len() > MAX_ID_DIGITS
            || !value.bytes().all(|byte| byte.is_ascii_digit())
            || (value.len() > 1 && value.starts_with('0'))
        {
            return Ok("1=0".to_string());
        }
        let prefix = value.parse::<u64>().map_err(|err| err.to_string())?;
        let mut ranges = Vec::new();
        for digits in value.len()..=MAX_ID_DIGITS {
            let multiplier = 10_u64.pow((digits - value.len()) as u32);
            let start = prefix.saturating_mul(multiplier);
            if start > MAX_ID_VALUE {
                break;
            }
            let end = (prefix + 1)
                .saturating_mul(multiplier)
                .saturating_sub(1)
                .min(MAX_ID_VALUE);
            let lower = self.bind(json!(start));
            let upper = self.bind(json!(end));
            ranges.push(format!(
                "(datas.id BETWEEN {lower} AND {upper} OR datas.alias BETWEEN {lower} AND {upper})"
            ));
        }
        Ok(if ranges.is_empty() {
            "1=0".to_string()
        } else {
            format!("({})", ranges.join(" OR "))
        })
    }

    fn compile_ids(&mut self, values: &[u32]) -> Result<String, String> {
        let mut ids = values
            .iter()
            .copied()
            .filter(|value| *value > 0)
            .collect::<Vec<_>>();
        ids.sort_unstable();
        ids.dedup();
        if ids.is_empty() {
            return Ok("1=0".to_string());
        }
        let chunks = ids
            .chunks(IN_CHUNK_SIZE)
            .map(|chunk| {
                let parameters = chunk
                    .iter()
                    .map(|value| self.bind(json!(value)))
                    .collect::<Vec<_>>();
                format!("datas.id IN ({})", parameters.join(", "))
            })
            .collect::<Vec<_>>();
        Ok(format!("({})", chunks.join(" OR ")))
    }
}

pub fn compile_search(expression: &CardSearchExpression) -> Result<CompiledSearch, String> {
    let mut compiler = SearchCompiler::new();
    let clause = compiler.compile(expression)?;
    Ok(CompiledSearch {
        clause,
        params: compiler.params,
    })
}

fn numeric_column(field: &NumericField) -> &'static str {
    match field {
        NumericField::Id => "datas.id",
        NumericField::Alias => "datas.alias",
        NumericField::Atk => "datas.atk",
        NumericField::Def => "datas.def",
        NumericField::Level => "(datas.level & 255)",
        NumericField::Ot => "datas.ot",
        NumericField::Lscale => "((datas.level >> 24) & 255)",
        NumericField::Rscale => "((datas.level >> 16) & 255)",
        NumericField::Attribute => "datas.attribute",
        NumericField::Race => "datas.race",
        NumericField::Type => "datas.type",
        NumericField::LinkMarker => "datas.def",
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::document_host::models::CardRuleOperand;

    #[test]
    fn compiles_rule_operands_without_accepting_sql_text() {
        let compiled = compile_search(&CardSearchExpression::RuleCompare {
            left: CardRuleOperand::Field {
                field: NumericField::Atk,
            },
            operator: CompareOperator::Gte,
            right: CardRuleOperand::Value { value: 2500 },
        })
        .expect("rule comparison should compile");

        assert_eq!(compiled.clause, "(datas.atk >= :q0)");
        assert_eq!(compiled.params.get("q0"), Some(&json!(2500)));
    }

    #[test]
    fn escapes_text_and_chunks_id_filters() {
        let compiled = compile_search(&CardSearchExpression::And {
            expressions: vec![
                CardSearchExpression::TextContains {
                    field: TextField::Name,
                    value: "A%_/B".to_string(),
                },
                CardSearchExpression::InIds {
                    values: vec![2, 1, 2, 0],
                },
            ],
        })
        .expect("search should compile");

        assert!(compiled.clause.contains("LIKE :q0 ESCAPE '/'"));
        assert!(compiled.clause.contains("datas.id IN (:q1, :q2)"));
        assert_eq!(compiled.params.get("q0"), Some(&json!("%A/%/_//B%")));
        assert_eq!(compiled.params.get("q1"), Some(&json!(1)));
        assert_eq!(compiled.params.get("q2"), Some(&json!(2)));
    }
}

fn mask_column(field: &MaskField) -> &'static str {
    match field {
        MaskField::Attribute => "datas.attribute",
        MaskField::Race => "datas.race",
        MaskField::Type => "datas.type",
        MaskField::LinkMarker => "datas.def",
    }
}

fn compare_operator(operator: &CompareOperator) -> &'static str {
    match operator {
        CompareOperator::Eq => "=",
        CompareOperator::Ne => "<>",
        CompareOperator::Gt => ">",
        CompareOperator::Gte => ">=",
        CompareOperator::Lt => "<",
        CompareOperator::Lte => "<=",
    }
}
