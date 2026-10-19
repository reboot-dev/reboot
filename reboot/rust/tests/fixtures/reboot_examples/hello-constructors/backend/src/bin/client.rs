use reboot::ExternalContext;
use upstream_hello_constructors::{generated, proto};
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<String> = std::env::args().collect();
    let command = args.get(1).ok_or("missing command")?;
    let reference = reboot::state_ref::StateRef::from_id(
        "hello_constructors.v1.Hello",
        args.get(2).map(String::as_str).unwrap_or("testing-hello"),
    )?;
    let context = ExternalContext::new(reference.to_string());
    let channel = tokio::time::timeout(
        std::time::Duration::from_secs(3),
        context.connect(std::env::var("RBT_RUST_URL")?),
    )
    .await??;
    if command == "health" {
        let response = tonic_health::pb::health_client::HealthClient::new(channel.clone())
            .check(tonic::Request::new(tonic_health::pb::HealthCheckRequest {
                service: String::new(),
            }))
            .await?
            .into_inner();
        if response.status != tonic_health::pb::health_check_response::ServingStatus::Serving as i32
        {
            return Err("not ready".into());
        }
        // Canonical host health alone does not prove Database liveness. This
        // read-only request crosses the real engine and initialization barrier.
        let reference =
            reboot::state_ref::StateRef::from_id("hello_constructors.v1.Hello", "reboot-hello")?;
        let context = ExternalContext::new(reference.to_string());
        let response = tokio::time::timeout(
            std::time::Duration::from_secs(2),
            generated::HelloMethodsExternalClient::new(channel, context)
                .messages(proto::MessagesRequest {}),
        )
        .await??;
        if response.into_inner().messages.len() < 2 {
            return Err("initializer incomplete".into());
        }
        println!("SERVING_ENGINE_BACKED");
        return Ok(());
    }
    let mut client = generated::HelloMethodsExternalClient::new(channel, context);
    let key_base = uuid::Uuid::parse_str(&std::env::var("RBT_TEST_CONSTRUCTOR_KEY_BASE")?)?;
    assert_eq!(key_base.get_version_num(), 7);
    let key = |n| uuid::Uuid::from_u128(key_base.as_u128() + n);
    match command.as_str() {
        "scenario" => {
            let request = proto::CreateRequest {
                initial_message: "first message".into(),
            };
            client.create_with_key(request.clone(), key(1)).await?;
            client.create_with_key(request, key(1)).await?;
            let request = proto::SendRequest {
                message: "second message".into(),
            };
            client.send_with_key(request.clone(), key(2)).await?;
            client.send_with_key(request, key(2)).await?;
        }
        "initialize" => {
            client
                .create_with_key(
                    proto::CreateRequest {
                        initial_message: "Welcome! This message was sent by a constructor.".into(),
                    },
                    key(3),
                )
                .await?;
            client
                .send_with_key(
                    proto::SendRequest {
                        message: "This message was sent after construction!".into(),
                    },
                    key(4),
                )
                .await?;
        }
        "missing" => {
            let error = client
                .messages(proto::MessagesRequest {})
                .await
                .unwrap_err();
            assert_eq!(error.code(), tonic::Code::Aborted);
            let rich = reboot::declared_error_details(&error)?.ok_or("missing rich error")?;
            assert_eq!(
                rich.details[0].type_url,
                "type.googleapis.com/rbt.v1alpha1.StateNotConstructed"
            );
            use prost::Message;
            assert!(
                !reboot::database_proto::StateNotConstructed::decode(
                    rich.details[0].value.as_slice()
                )?
                .requires_constructor
            );
            println!("MISSING_REJECTED");
            return Ok(());
        }
        "verify" => {}
        _ => return Err("unknown command".into()),
    }
    let messages = client
        .messages(proto::MessagesRequest {})
        .await?
        .into_inner()
        .messages;
    let expected = if args.get(2).map(String::as_str) == Some("reboot-hello") {
        vec![
            "Welcome! This message was sent by a constructor.",
            "This message was sent after construction!",
        ]
    } else {
        vec!["first message", "second message"]
    };
    assert_eq!(messages, expected);
    println!("EXACT_MESSAGES {:?}", messages);
    Ok(())
}
