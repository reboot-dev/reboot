use reboot_rust_schema::{
    proto,
    successful_trailers::{
        ParticipantMetadata, ReturnedParticipants, ReturnedParticipantsError,
        SuccessfulParticipantTrailerLayer, TRANSACTION_PARTICIPANTS_HEADER,
        stage_successful_participants,
    },
};

struct TrailerEcho;

#[tonic::async_trait]
impl proto::echo_methods_server::EchoMethods for TrailerEcho {
    async fn reply(
        &self,
        request: tonic::Request<proto::Text>,
    ) -> Result<tonic::Response<proto::Text>, tonic::Status> {
        if request.get_ref().content == "error" {
            return Err(tonic::Status::invalid_argument("rejected"));
        }
        let mut response = tonic::Response::new(request.into_inner());
        stage_successful_participants(
            &mut response,
            ParticipantMetadata::single("tests.reboot.protoc.Echo", "echo/1").unwrap(),
        );
        Ok(response)
    }

    async fn last_message(
        &self,
        _: tonic::Request<proto::Empty>,
    ) -> Result<tonic::Response<proto::Text>, tonic::Status> {
        Err(tonic::Status::unimplemented("unused"))
    }
}

async fn start_server() -> (String, tokio::task::JoinHandle<()>) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let server = tokio::spawn(async move {
        tonic::transport::Server::builder()
            .layer(SuccessfulParticipantTrailerLayer)
            .add_service(proto::echo_methods_server::EchoMethodsServer::new(
                TrailerEcho,
            ))
            .serve_with_incoming(tokio_stream::wrappers::TcpListenerStream::new(listener))
            .await
            .unwrap();
    });
    (format!("http://{address}"), server)
}

#[tokio::test]
async fn raw_server_streaming_sees_participants_only_in_success_trailers() {
    let (address, server) = start_server().await;
    let channel = tonic::transport::Channel::from_shared(address)
        .unwrap()
        .connect()
        .await
        .unwrap();
    let mut grpc = tonic::client::Grpc::new(channel);
    grpc.ready().await.unwrap();
    let response: tonic::Response<tonic::Streaming<proto::Text>> = grpc
        .server_streaming::<proto::Text, proto::Text, _>(
            tonic::Request::new(proto::Text {
                content: "ok".into(),
            }),
            http::uri::PathAndQuery::from_static("/tests.reboot.protoc.EchoMethods/Reply"),
            tonic::codec::ProstCodec::default(),
        )
        .await
        .unwrap();
    assert!(
        response
            .metadata()
            .get(TRANSACTION_PARTICIPANTS_HEADER)
            .is_none()
    );
    let mut stream = response.into_inner();
    assert_eq!(stream.message().await.unwrap().unwrap().content, "ok");
    let trailers = stream.trailers().await.unwrap().unwrap();
    assert_eq!(trailers.get("grpc-status").unwrap(), "0");
    assert_eq!(
        trailers.get(TRANSACTION_PARTICIPANTS_HEADER).unwrap(),
        r#"{"tests.reboot.protoc.Echo":["echo/1"]}"#
    );
    server.abort();
}

#[tokio::test]
async fn errors_do_not_carry_participants_and_unary_clients_merge_success_trailers() {
    let (address, server) = start_server().await;
    let channel = tonic::transport::Channel::from_shared(address.clone())
        .unwrap()
        .connect()
        .await
        .unwrap();
    let mut grpc = tonic::client::Grpc::new(channel);
    grpc.ready().await.unwrap();
    let error: tonic::Status = grpc
        .server_streaming::<proto::Text, proto::Text, _>(
            tonic::Request::new(proto::Text {
                content: "error".into(),
            }),
            http::uri::PathAndQuery::from_static("/tests.reboot.protoc.EchoMethods/Reply"),
            tonic::codec::ProstCodec::default(),
        )
        .await
        .unwrap_err();
    assert!(
        error
            .metadata()
            .get(TRANSACTION_PARTICIPANTS_HEADER)
            .is_none()
    );

    let mut client = proto::echo_methods_client::EchoMethodsClient::connect(address)
        .await
        .unwrap();
    let response = client
        .reply(proto::Text {
            content: "ok".into(),
        })
        .await
        .unwrap();
    assert_eq!(response.get_ref().content, "ok");
    assert_eq!(
        response
            .metadata()
            .get(TRANSACTION_PARTICIPANTS_HEADER)
            .unwrap(),
        r#"{"tests.reboot.protoc.Echo":["echo/1"]}"#
    );
    server.abort();
}

#[test]
fn returned_participants_decode_all_values_deduplicate_and_sort() {
    let mut metadata = tonic::metadata::MetadataMap::new();
    metadata.append(
        TRANSACTION_PARTICIPANTS_HEADER,
        r#"{"z.type":["z/2","z/1"],"a.type":["a/1"]}"#.parse().unwrap(),
    );
    metadata.append(
        TRANSACTION_PARTICIPANTS_HEADER,
        r#"{"z.type":["z/1"],"b.type":["b/1"]}"#.parse().unwrap(),
    );

    let returned = ReturnedParticipants::from_metadata(&metadata).unwrap();
    assert_eq!(
        returned
            .participants()
            .iter()
            .map(|participant| (&participant.state_type, &participant.state_ref))
            .collect::<Vec<_>>(),
        vec![
            (&"a.type".to_owned(), &"a/1".to_owned()),
            (&"b.type".to_owned(), &"b/1".to_owned()),
            (&"z.type".to_owned(), &"z/1".to_owned()),
            (&"z.type".to_owned(), &"z/2".to_owned()),
        ]
    );
}

#[test]
fn returned_participants_fail_closed_for_missing_or_malformed_values() {
    assert!(matches!(
        ReturnedParticipants::from_metadata(&tonic::metadata::MetadataMap::new()),
        Err(ReturnedParticipantsError::Missing)
    ));

    for value in ["[]", "{}", r#"{"type":[]}"#, r#"{"type":[""]}"#] {
        let mut metadata = tonic::metadata::MetadataMap::new();
        metadata.append(TRANSACTION_PARTICIPANTS_HEADER, value.parse().unwrap());
        assert!(matches!(
            ReturnedParticipants::from_metadata(&metadata),
            Err(ReturnedParticipantsError::InvalidParticipantMetadata(_))
        ));
    }

    let mut metadata = tonic::metadata::MetadataMap::new();
    metadata.append(
        TRANSACTION_PARTICIPANTS_HEADER,
        // This models a malformed remote ASCII metadata value; constructors reject it.
        unsafe {
            tonic::metadata::MetadataValue::<tonic::metadata::Ascii>::from_shared_unchecked(
                bytes::Bytes::from_static(b"\xff"),
            )
        },
    );
    assert!(matches!(
        ReturnedParticipants::from_metadata(&metadata),
        Err(ReturnedParticipantsError::InvalidMetadataValue)
    ));
}
