//! Guard the two mixed adapter construction paths and ordinary API compatibility.
#[test]
fn transaction_task_owners_use_the_actual_participant_carrier() {
    let source = include_str!("codegen.rs");
    let mixed = source
        .lines()
        .find(|line| {
            line.contains("output.push_str(&format!(\"impl<H, P, C, R, F>")
                && line.contains("with_one_shot_reader_tasks")
        })
        .unwrap();
    assert_eq!(
        mixed
            .matches("OneShotTasks::new_with_participant_declarations")
            .count(),
        2
    );
    assert_eq!(
        mixed
            .matches("ParticipantBoundTaskBinding::new(self.participant.clone(), {binding}")
            .count(),
        2
    );
    assert!(!mixed.contains("OneShotTasks::new_with_declarations"));
    let ordinary = source
        .lines()
        .find(|line| line.contains("pub fn with_one_shot_{name}_tasks"))
        .unwrap();
    assert!(ordinary.contains("OneShotTasks::new_with_declarations"));
    assert!(!ordinary.contains("ParticipantBoundTaskBinding"));
}
