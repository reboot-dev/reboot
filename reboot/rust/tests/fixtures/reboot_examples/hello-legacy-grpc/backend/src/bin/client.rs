use reboot::ExternalContext;
mod inspect;
use upstream_hello_legacy_grpc::{SALUTATIONS, actor, generated, proto};
#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let args: Vec<_> = std::env::args().collect();
    let command = args.get(1).map(String::as_str).ok_or("missing command")?;
    if command == "inspect" {
        return inspect::run(args.get(2).ok_or("missing task UUID")?).await;
    }
    if command == "observe" {
        return inspect::observe(
            args.get(2).ok_or("missing task UUID")?,
            args.get(3).ok_or("missing expected task status")?,
            args.get(4).ok_or("missing expected checkpoint phase")?,
        )
        .await;
    }
    let channel = tonic::transport::Endpoint::from_shared(std::env::var("RBT_RUST_URL")?)?
        .connect()
        .await?;
    if command == "health" {
        let response = tonic_health::pb::health_client::HealthClient::new(channel)
            .check(tonic_health::pb::HealthCheckRequest {
                service: String::new(),
            })
            .await?
            .into_inner();
        if response.status != tonic_health::pb::health_check_response::ServingStatus::Serving as i32
        {
            return Err("not ready".into());
        }
        println!("SERVING");
        return Ok(());
    }
    let timeout = std::time::Duration::from_secs(10);
    tokio::time::timeout(timeout, async {
        match command {
            "deprecated" => {
                let mut client =
                    proto::deprecated_greeter_client::DeprecatedGreeterClient::new(channel);
                let salutation = client.get_salutation(()).await?.into_inner().salutation;
                assert!(SALUTATIONS.contains(&salutation.as_str()));
                let response = client
                    .greet(proto::GreetRequest {
                        name: "Legacy".into(),
                    })
                    .await?
                    .into_inner();
                assert!(
                    SALUTATIONS
                        .iter()
                        .any(|s| response.message == format!("{s}, Legacy!"))
                );
                println!("DEPRECATED {}", response.message);
            }
            "proxy" => {
                let mut client = proto::proxy_greeter_client::ProxyGreeterClient::new(channel);
                let mut plain = false;
                let mut reboot = false;
                for _ in 0..64 {
                    let response = client
                        .greet(proto::GreetRequest {
                            name: "Proxy".into(),
                        })
                        .await?
                        .into_inner();
                    assert!(
                        SALUTATIONS
                            .iter()
                            .any(|s| response.message.starts_with(&format!("{s}, Proxy!")))
                    );
                    if response.message.ends_with("by the Reboot service.") {
                        reboot = true;
                    } else {
                        plain = true;
                    }
                    println!("PROXY {}", response.message);
                    if plain && reboot {
                        break;
                    }
                }
                assert!(
                    plain && reboot,
                    "both random proxy branches must appear within 64 calls"
                );
                println!("PROXY_BOTH_BRANCHES");
            }
            "greet" | "greet-replay" => {
                let mut client = generated::RebootGreeterMethodsExternalClient::new(
                    channel,
                    ExternalContext::new(actor()?),
                );
                let key = uuid::Uuid::parse_str(args.get(2).ok_or("missing writer key")?)?;
                let input = proto::GreetRequest {
                    name: args.get(3).cloned().unwrap_or_else(|| "Reboot".into()),
                };
                let first = client
                    .greet_with_key(input.clone(), key)
                    .await?
                    .into_inner();
                if command == "greet-replay" {
                    let replay = client.greet_with_key(input, key).await?.into_inner();
                    assert_eq!(first, replay);
                }
                println!("REBOOT {}", first.message);
            }
            "salutation" => {
                let mut client = generated::RebootGreeterMethodsExternalClient::new(
                    channel,
                    ExternalContext::new(actor()?),
                );
                let response = client.get_salutation(()).await?.into_inner();
                assert!(SALUTATIONS.contains(&response.salutation.as_str()));
                println!("SALUTATION {}", response.salutation);
            }
            "direct-workflow-denied" => {
                let result =
                    proto::reboot_greeter_methods_client::RebootGreeterMethodsClient::new(channel)
                        .initialize(())
                        .await
                        .unwrap_err();
                assert_eq!(result.code(), tonic::Code::PermissionDenied);
                println!("DIRECT_WORKFLOW_DENIED");
            }
            _ => return Err("unknown command".into()),
        }
        Ok::<_, Box<dyn std::error::Error>>(())
    })
    .await??;
    Ok(())
}
