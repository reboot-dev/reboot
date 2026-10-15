//! Dedicated emitted-source coverage; executed by the parent's real crate tests.
use super::*;

fn emit(extra: Option<(&str, DurableKind)>, declared: bool) -> Result<String, String> {
    let method = |name: &str| MethodDescriptorProto {
        name: Some(name.into()),
        input_type: Some(".demo.Q".into()),
        output_type: Some(".demo.R".into()),
        ..Default::default()
    };
    let mut service = ServiceDescriptorProto {
        name: Some("Methods".into()),
        method: vec![
            method("Run"),
            method("Finite"),
            method("Apply"),
            method("Observe"),
        ],
        ..Default::default()
    };
    let mut annotation = DurableService {
        auto_construct: 0,
        state: "demo.State".into(),
        default_constructible: false,
        methods: [
            ("Run".into(), DurableKind::Workflow),
            ("Finite".into(), DurableKind::Workflow),
            (
                "Apply".into(),
                DurableKind::Writer(WriterMetadata { constructor: false }),
            ),
            ("Observe".into(), DurableKind::Reader),
        ]
        .into(),
        declared_errors: if declared {
            [("Run".into(), vec!["Rejected".into()])].into()
        } else {
            HashMap::new()
        },
    };
    if let Some((name, kind)) = extra {
        service.method.push(method(name));
        annotation.methods.insert(name.into(), kind);
    }
    let mut output = String::new();
    emit_workflow_service(
        &mut output,
        &service,
        &annotation,
        "Methods",
        "State",
        "renamed_runtime",
        "demo",
    )?;
    Ok(output)
}

fn emit_pair(methods: &[(&str, DurableKind)]) -> (Result<(), String>, String) {
    let service = ServiceDescriptorProto {
        name: Some("Methods".into()),
        method: methods
            .iter()
            .map(|(name, _)| MethodDescriptorProto {
                name: Some((*name).into()),
                input_type: Some(".demo.Q".into()),
                output_type: Some(".demo.R".into()),
                ..Default::default()
            })
            .collect(),
        ..Default::default()
    };
    let annotation = DurableService {
        auto_construct: 0,
        state: "demo.State".into(),
        default_constructible: false,
        methods: methods
            .iter()
            .map(|(name, kind)| ((*name).into(), *kind))
            .collect(),
        declared_errors: HashMap::new(),
    };
    let mut output = String::new();
    let result = emit_workflow_service(
        &mut output,
        &service,
        &annotation,
        "Methods",
        "State",
        "renamed_runtime",
        "demo",
    );
    (result, output)
}

#[test]
fn complete_handler_namespace_rejects_generated_to_generated_collisions() {
    let writer = || DurableKind::Writer(WriterMetadata { constructor: false });
    for (first, second, symbol, first_origin, second_origin) in [
        (
            ("Run", DurableKind::Workflow),
            ("RunCursor", DurableKind::Workflow),
            "run_cursor_attempt",
            "mutable cursor hook",
            "finite attempt",
        ),
        (
            ("FooAttempt", DurableKind::Workflow),
            ("WorkflowCursorFoo", DurableKind::Workflow),
            "workflow_cursor_foo_attempt",
            "static cursor selector",
            "finite attempt",
        ),
        (
            ("ApplyScheduled", DurableKind::Workflow),
            ("WorkflowCursorApply", writer()),
            "workflow_cursor_apply_scheduled",
            "static cursor selector",
            "scheduled writer hook",
        ),
        (
            ("ObserveWithReaderContext", DurableKind::Workflow),
            ("WorkflowCursorObserve", DurableKind::Reader),
            "workflow_cursor_observe_with_reader_context",
            "static cursor selector",
            "reader context hook",
        ),
    ] {
        for reversed in [false, true] {
            let mut methods = [first, second];
            let (left_origin, right_origin) = if reversed {
                methods.reverse();
                (second_origin, first_origin)
            } else {
                (first_origin, second_origin)
            };
            let expected = format!(
                "Methods: handler item `{symbol}` collision: {} ({left_origin}) collides with {} ({right_origin})",
                methods[0].0, methods[1].0,
            );
            // Repeated generation must not depend on randomized HashMap seeds.
            for _ in 0..3 {
                let (result, output) = emit_pair(&methods);
                assert_eq!(result.unwrap_err(), expected);
                assert!(
                    output.is_empty(),
                    "collision must fail before trait emission"
                );
            }
        }
    }
}

#[test]
fn complete_handler_namespace_rejects_rpc_and_legacy_hook_collisions() {
    for (first, second, symbol) in [
        (
            ("Run", DurableKind::Workflow),
            ("RunAttempt", DurableKind::Reader),
            "run_attempt",
        ),
        (
            (
                "Apply",
                DurableKind::Writer(WriterMetadata { constructor: false }),
            ),
            ("ApplyScheduled", DurableKind::Workflow),
            "apply_scheduled",
        ),
        (
            ("Observe", DurableKind::Reader),
            ("ObserveWithReaderContext", DurableKind::Workflow),
            "observe_with_reader_context",
        ),
        (
            ("Run", DurableKind::Workflow),
            ("run", DurableKind::Reader),
            "run",
        ),
    ] {
        let (result, output) = emit_pair(&[first, second]);
        assert!(
            result
                .unwrap_err()
                .contains(&format!("handler item `{symbol}` collision:"))
        );
        assert!(output.is_empty());
    }
}

#[test]
fn handler_namespace_reserves_only_hooks_actually_emitted_for_each_kind() {
    for methods in [
        [
            ("Run", DurableKind::Reader),
            ("RunCursor", DurableKind::Workflow),
        ],
        [
            (
                "Run",
                DurableKind::Writer(WriterMetadata { constructor: false }),
            ),
            ("RunCursor", DurableKind::Workflow),
        ],
        [
            (
                "Apply",
                DurableKind::Writer(WriterMetadata { constructor: true }),
            ),
            ("ApplyScheduled", DurableKind::Workflow),
        ],
        [
            ("Observe", DurableKind::Workflow),
            ("ObserveWithReaderContext", DurableKind::Workflow),
        ],
    ] {
        let (result, _) = emit_pair(&methods);
        result.unwrap();
    }
}

#[test]
fn cursor_registration_is_explicit_type_level_and_per_method() {
    let output = emit(None, false).unwrap();
    for method in ["run", "finite"] {
        assert!(output.contains(&format!(
            "fn workflow_cursor_{method}() -> Option<(&'static str, u32)> where Self: Sized {{ None }}"
        )));
        assert!(output.contains(&format!("match workflow_cursor_{method} {{Some((alias,version))=>declaration.workflow_cursor(alias,version),None=>declaration.workflow()}}")));
    }
    assert!(!output.contains("fn workflow_cursor_apply("));
    assert!(!output.contains("fn workflow_cursor_observe("));
    assert_eq!(output.matches(".workflow_cursor(alias,version)").count(), 2);
    assert!(output.contains(".workflow_writer_step()"));
    assert!(output.contains(".workflow_reader_wait()"));
    // Neither generated scheduling nor initial admission can opt into nonzero.
    assert_eq!(output.matches("iteration: 0").count(), 2);
    assert!(!output.contains("iteration: 1"));
    assert!(!output.contains("allow_nonzero"));
}

#[test]
fn cursor_dispatch_gets_mutable_context_and_finite_dispatch_is_unchanged() {
    let output = emit(None, false).unwrap();
    assert!(output.contains("async fn run_cursor_attempt(&self, _context: &mut renamed_runtime::one_shot_tasks::WorkflowContext<'_>"));
    assert!(output.contains("cursor workflow handler is not implemented"));
    assert!(output.contains("if self.workflow_cursor_run.is_some() { self.handler.run_cursor_attempt(&mut context, request).await } else { self.handler.run_attempt(&context, request).await }"));
    assert!(output.contains("execute_workflow(&self,mut context:"));
    assert!(output.contains("Err(error)=>return context.body_failed(error).await"));
    assert!(output.contains("context.finish::<StateDurableState,proto::Q,proto::R>"));
    // The existing required finite handler and its attempt wrapper stay intact.
    assert!(output.contains(
        "async fn run(&self, context: &renamed_runtime::one_shot_tasks::WorkflowContext<'_>"
    ));
    assert!(output.contains("self.run(context,request).await.map_err(Into::into)"));
}

#[test]
fn cursor_selection_does_not_drop_typed_payload_or_declared_errors() {
    let output = emit(None, true).unwrap();
    assert!(output.contains("TaskMethodDeclaration::new::<StateDurableState,proto::Q,proto::R>(\"demo.Methods.Run\",\"type.googleapis.com/demo.R\",vec![renamed_runtime::one_shot_tasks::DeclaredTaskError::new::<proto::Rejected>(\"type.googleapis.com/demo.Rejected\")])"));
    assert!(output.contains("MethodsRunError"));
    assert!(output.contains("into_task_handler_error().into()"));
}

#[test]
fn cursor_attempt_hook_collisions_are_rejected_for_every_method_kind() {
    for kind in [
        DurableKind::Workflow,
        DurableKind::Reader,
        DurableKind::Writer(WriterMetadata { constructor: false }),
    ] {
        let error = emit(Some(("RunCursorAttempt", kind)), false).unwrap_err();
        assert!(
            error.contains("handler item `run_cursor_attempt` collision:"),
            "{error}"
        );
    }
}

#[test]
fn cursor_selection_hook_collisions_are_rejected_for_every_method_kind() {
    for kind in [
        DurableKind::Workflow,
        DurableKind::Reader,
        DurableKind::Writer(WriterMetadata { constructor: false }),
    ] {
        let error = emit(Some(("WorkflowCursorRun", kind)), false).unwrap_err();
        assert!(
            error.contains("handler item `workflow_cursor_run` collision:"),
            "{error}"
        );
    }
}

#[test]
fn cursor_selection_is_captured_once_and_shared_by_declaration_and_dispatch() {
    let output = emit(None, false).unwrap();
    assert!(!output.contains("const WORKFLOW_CURSOR_"));
    for method in ["run", "finite"] {
        let hook = format!("workflow_cursor_{method}");
        assert_eq!(output.matches(&format!("H::{hook}()")).count(), 1);
        assert!(output.contains(&format!("let {hook}=H::{hook}();")));
        assert!(output.contains(&format!("match {hook} {{Some((alias,version))")));
        assert!(output.contains(&format!("if self.{hook}.is_some()")));
        assert!(output.contains(&format!("{hook}:Option<(&'static str,u32)>")));
    }
    assert!(output.contains("MethodsWorkflowBinding{handler:self.handler.clone(),workflow_cursor_run,workflow_cursor_finite}"));
    let execution = output.split("async fn execute_workflow").nth(1).unwrap();
    assert!(!execution.contains("H::workflow_cursor_"));
}
