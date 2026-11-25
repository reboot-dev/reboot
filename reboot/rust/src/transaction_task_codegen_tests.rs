#[cfg(test)]
mod canonical_transaction_task_codegen_tests {
    use super::*;
    #[test]
    fn ordinary_writer_transaction_adapter_retains_canonical_schedule_rejection() {
        for writer in [false, true] {
            let mut code=String::new();
            emit_exclusive_transaction_method(&mut code,TransactionFlow {
                method:"apply",request:"Request",response:"Response",method_identity:"rpc.Methods.Apply",
                state:"State",declaration:"StateDurableState",runtime_module:"reboot",mode:"Exclusive",
                factory:false,default_root:false,declared_error:false,writer,inbound:TransactionInbound::Dynamic,
                shared_root_ownership_seam:false,authorize_after_load:true,
            });
            assert!(code.contains("without_declared_transaction_ack"));
            assert_eq!(code.contains("canonical transaction task requires registered owner"),!writer);
            assert_eq!(code.contains("canonical task admission is unsupported by transaction adapters"),writer);
        }
    }
    #[test]
    fn canonical_transaction_tasks_are_coordinator_calls_not_writer_handlers() {
        let method = |name: &str, ty: &str| MethodDescriptorProto {
            name: Some(name.into()), input_type: Some(ty.into()), output_type: Some(ty.into()), ..Default::default()
        };
        let service = ServiceDescriptorProto { name: Some("Methods".into()), method: vec![method("Apply",".google.protobuf.Empty"),method("Local",".rpc.Empty"),method("Factory",".rpc.Empty"),method("Shared",".rpc.Empty"),method("Declared",".rpc.Empty")], ..Default::default() };
        let metadata = |factory,mode| DurableKind::Transaction(TransactionMetadata { factory,mode });
        let annotation = DurableService {
            state: "other.State".into(), methods: [
                ("Apply".into(),metadata(false,TransactionMode::Exclusive)),
                ("Local".into(),metadata(false,TransactionMode::Exclusive)),
                ("Factory".into(),metadata(true,TransactionMode::Exclusive)),
                ("Shared".into(),metadata(false,TransactionMode::Shared)),
                ("Declared".into(),metadata(false,TransactionMode::Exclusive)),
            ].into(),declared_errors:[("Declared".into(),vec!["Error".into()])].into(),..Default::default()
        };
        let mut code=String::new();
        emit_transaction_tasks(&mut code,&service,&annotation,"State","reboot","vec![]","rpc");
        assert!(code.contains("MethodsWorkflowTransactionRef"));
        assert!(code.contains("mut self,store:reboot::runtime::DatabaseActorStore,"));
        assert!(code.contains("self.participant.validate_task_owner(&store"));
        assert!(code.contains("self.coordinator.sidecar().database_endpoint()!=Some(store.database_endpoint())"));
        assert!(!code.contains("ReaderTaskBinding<H>"));
        assert!(!code.contains("self.store"));
        assert!(code.contains("pure transaction requires coordinator execution"));
        assert!(code.contains(".transaction()"));
        assert!(code.contains("\"rpc.Methods.Apply\""));
        assert!(code.contains("google.protobuf.Empty"));
        assert!(code.contains("proto::Empty"));
        assert!(!code.contains("execute_writer"));
        assert!(!code.contains("handler.apply"));
        assert!(code.contains("invoke_transaction_declared"));
        assert!(code.contains("is_durable_declared_transaction_error"));
        assert!(code.contains("WorkflowBodyError::Declared"));
        assert!(code.contains("DeclaredTaskError::new::<proto::Error>"));
        for forbidden in ["\"Factory\" =>","\"Shared\" =>"] { assert!(!code.contains(forbidden)); }
    }
}
