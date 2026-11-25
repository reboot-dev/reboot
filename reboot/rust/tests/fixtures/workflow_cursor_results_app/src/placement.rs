fn plan(port: u16) -> reboot::legacy_placement::PlanOnlyLegacyPlacement {
    use reboot::placement_proto as p;
    let plan = reboot::legacy_placement::PlanOnlyLegacyPlacement::new();
    plan.install(p::ListenForPlanResponse {
        plan: Some(p::Plan {
            version: 1,
            applications: vec![p::plan::Application {
                id: "cursor-app".into(),
                services: vec![
                    p::plan::application::Service {
                        full_name: "cursor.v1.BMethods".into(),
                        state_type_full_name: "cursor.v1.B".into(),
                    },
                    p::plan::application::Service {
                        full_name: "cursor.v1.AMethods".into(),
                        state_type_full_name: "cursor.v1.A".into(),
                    },
                    p::plan::application::Service {
                        full_name: "rbt.v1alpha1.Tasks".into(),
                        state_type_full_name: "cursor.v1.A".into(),
                    },
                ],
                shards: vec![p::plan::application::Shard {
                    id: "s000000000".into(),
                    range: Some(p::plan::application::shard::KeyRange { first_key: vec![] }),
                    server_id: "server".into(),
                    replica_index: 0,
                }],
            }],
        }),
        servers: vec![p::Server {
            id: "server".into(),
            application_id: "cursor-app".into(),
            address: Some(p::server::Address {
                host: "127.0.0.1".into(),
                port: i32::from(port),
            }),
            ..Default::default()
        }],
    })
    .unwrap();
    plan
}
