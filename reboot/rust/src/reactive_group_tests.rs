#[cfg(test)]
mod reader_group_tests {
    use super::*;
    struct Binding {
        store: DatabaseActorStore,
        id: Arc<()>,
        names: &'static [&'static str],
        value: u8,
    }
    #[tonic::async_trait]
    impl ReaderBinding for Binding {
        fn validate_owner(&self, owner: &LocalReaderOwner) -> Result<(), Status> {
            owner.validate_generated_store(&self.store, "Group")
        }
        fn unary_binding_id(&self) -> Option<Arc<()>> {
            Some(self.id.clone())
        }
        fn reader_method_names(&self) -> &'static [&'static str] {
            self.names
        }
        async fn read(&self, _: Request<wire::Query>) -> Result<Vec<u8>, Status> {
            Ok(vec![self.value])
        }
    }
    fn service(
        store: &DatabaseActorStore,
        names: &'static [&'static str],
        value: u8,
        actor: &str,
    ) -> LocalReaderService<Binding> {
        let reference = crate::state_ref::StateRef::from_id("Group", actor)
            .unwrap()
            .to_string();
        let owner = LocalReaderOwner::for_generated_actor(store, "Group", &reference).unwrap();
        LocalReaderService::new(
            Binding {
                store: store.clone(),
                id: Arc::new(()),
                names,
                value,
            },
            owner,
        )
        .unwrap()
    }
    #[tokio::test]
    async fn grouped_methods_preserve_identity_and_exact_routing() {
        let store = DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap();
        let a = service(&store, &["A.Read"], 1, "root");
        let id = a.binding.id.clone();
        let mut group = LocalReaderGroup::new(a).unwrap();
        group.add(service(&store, &["B.Read"], 2, "root")).unwrap();
        assert!(group.supports_unary_binding(&id));
        assert!(group.matches_unary_methods(&id, &["A.Read"]));
        assert!(!group.matches_unary_methods(&id, &["B.Read"]));
        assert!(!group.matches_unary_methods(&id, &[]));
        assert!(!group.supports_unary_binding(&Arc::new(())));
        for (method, value) in [("A.Read", 1), ("B.Read", 2)] {
            assert_eq!(
                group
                    .read(Request::new(wire::Query {
                        method: method.into(),
                        request: vec![]
                    }))
                    .await
                    .unwrap(),
                vec![value]
            );
        }
        assert_eq!(
            group
                .read(Request::new(wire::Query {
                    method: "Unknown.Read".into(),
                    request: vec![]
                }))
                .await
                .unwrap_err()
                .code(),
            tonic::Code::Unimplemented
        );
    }
    #[tokio::test]
    async fn rejected_group_additions_leave_routes_and_identity_unchanged() {
        let store = DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap();
        let mut group = LocalReaderGroup::new(service(&store, &["A.Read"], 1, "root")).unwrap();
        assert_eq!(
            group
                .add(service(&store, &["B.Read"], 2, "other"))
                .unwrap_err()
                .code(),
            tonic::Code::FailedPrecondition
        );
        let other = DatabaseActorStore::connect_lazy("http://127.0.0.1:2").unwrap();
        assert_eq!(
            group
                .add(service(&other, &["B.Read"], 2, "root"))
                .unwrap_err()
                .code(),
            tonic::Code::FailedPrecondition
        );
        assert_eq!(
            group
                .add(service(&store, &["B.Read", "A.Read"], 2, "root"))
                .unwrap_err()
                .code(),
            tonic::Code::AlreadyExists
        );
        assert_eq!(group.methods.len(), 1);
        assert_eq!(group.identities.len(), 1);
        assert_eq!(
            group
                .add(service(&store, &[], 2, "root"))
                .unwrap_err()
                .code(),
            tonic::Code::ResourceExhausted
        );
        assert!(group.route("B.Read").is_err());
    }
    #[cfg(feature = "test-support")]
    #[tokio::test]
    async fn already_serving_inputs_cannot_install_a_second_group_owner() {
        let store = DatabaseActorStore::connect_lazy("http://127.0.0.1:1").unwrap();
        let service = service(&store, &["A.Read"], 1, "root");
        let (cancel, _) = RecoveryCancellation::test_host();
        service
            .owner
            .start(&mut tokio::task::JoinSet::new(), cancel)
            .await
            .unwrap();
        assert_eq!(
            LocalReaderGroup::new(service).err().unwrap().code(),
            tonic::Code::FailedPrecondition
        );
    }
}
