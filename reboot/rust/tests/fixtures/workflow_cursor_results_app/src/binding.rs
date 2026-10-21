// Fixture-only mirror of the canonical cursor binding contract, not SDK API.
#[derive(Clone, PartialEq, prost::Message)]
struct CursorBindingContract {
    #[prost(string, tag = "1")]
    method: String,
    #[prost(bytes = "vec", tag = "2")]
    request: Vec<u8>,
    #[prost(string, tag = "3")]
    alias: String,
    #[prost(uint32, tag = "4")]
    version: u32,
    #[prost(uint64, tag = "5")]
    bound: u64,
    #[prost(string, tag = "6")]
    parent_bounds: String,
    #[prost(string, tag = "7")]
    result_type: String,
    #[prost(bytes = "vec", tag = "8")]
    call_contract: Vec<u8>,
}
const CURSOR_BINDING_TYPE: &str = "type.googleapis.com/reboot.rust.workflow.CursorBindingV1";
fn validate_cursor_binding(
    scope: Option<u64>,
    result: &prost_types::Any,
    task: &db::Task,
) -> Result<(), Box<dyn std::error::Error>> {
    if scope.is_some() || result.type_url != CURSOR_BINDING_TYPE {
        return Err("cursor binding must be a root-scoped typed record".into());
    }
    if task.method != "Run" {
        return Err("cursor binding requires canonical Run task".into());
    }
    let expected = CursorBindingContract {
        method: "cursor.v1.AMethods.Run".into(),
        request: task.request.clone(),
        alias: "cursor-proof".into(),
        version: 1,
        bound: 0,
        parent_bounds: String::new(),
        result_type: CURSOR_BINDING_TYPE.into(),
        call_contract: b"reboot.workflow.cursor.v1".to_vec(),
    };
    if result.value != expected.encode_to_vec() {
        return Err("cursor binding bytes differ from fixture declaration/canonical task".into());
    }
    Ok(())
}
#[cfg(test)]
mod binding_tests {
    use super::*;
    #[test]
    fn only_exact_root_binding_is_accepted() {
        let task = db::Task {
            method: "Run".into(),
            request: vec![8, 7],
            ..Default::default()
        };
        let binding = CursorBindingContract {
            method: "cursor.v1.AMethods.Run".into(),
            request: task.request.clone(),
            alias: "cursor-proof".into(),
            version: 1,
            bound: 0,
            parent_bounds: String::new(),
            result_type: CURSOR_BINDING_TYPE.into(),
            call_contract: b"reboot.workflow.cursor.v1".to_vec(),
        };
        let result = prost_types::Any {
            type_url: CURSOR_BINDING_TYPE.into(),
            value: binding.encode_to_vec(),
        };
        validate_cursor_binding(None, &result, &task).unwrap();
        assert!(validate_cursor_binding(Some(0), &result, &task).is_err());
        let mut bad = result.clone();
        bad.type_url = "unknown".into();
        assert!(validate_cursor_binding(None, &bad, &task).is_err());
        let mut changed = binding.clone();
        changed.version = 2;
        let mut bad = result.clone();
        bad.value = changed.encode_to_vec();
        assert!(validate_cursor_binding(None, &bad, &task).is_err());
        let mut bad = result.clone();
        bad.value.push(0);
        assert!(validate_cursor_binding(None, &bad, &task).is_err());
        let mut other_task = task.clone();
        other_task.request.push(1);
        assert!(validate_cursor_binding(None, &result, &other_task).is_err());
    }
}
