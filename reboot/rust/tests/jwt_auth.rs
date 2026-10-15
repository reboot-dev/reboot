#![cfg(feature = "jwt-auth")]
use jsonwebtoken::{Algorithm, EncodingKey, Header};
use reboot_rust_schema::{RebootHeaders, auth::AuthorizationPolicy, jwt_auth::JwtTokenVerifier};
use serde_json::{Value, json};
use std::{
    process::Command,
    sync::Arc,
    time::{SystemTime, UNIX_EPOCH},
};

// Runtime-only keys: no reusable signing credentials checked into the repository.
fn keys() -> (EncodingKey, Vec<u8>) {
    let (key, public, _) = keys_for_bits("2048");
    (key, public)
}
fn keys_for_bits(bits: &str) -> (EncodingKey, Vec<u8>, Vec<u8>) {
    let temp = tempfile::tempdir().unwrap();
    let private = temp.path().join("private.pem");
    let public = temp.path().join("public.pem");
    let result = Command::new("openssl")
        .args([
            "genpkey",
            "-algorithm",
            "RSA",
            "-pkeyopt",
            &format!("rsa_keygen_bits:{bits}"),
            "-out",
        ])
        .arg(&private)
        .output()
        .expect("JWT acceptance requires openssl");
    assert!(result.status.success());
    assert!(
        Command::new("openssl")
            .args(["pkey", "-pubout", "-in"])
            .arg(&private)
            .arg("-out")
            .arg(&public)
            .output()
            .unwrap()
            .status
            .success()
    );
    (
        EncodingKey::from_rsa_pem(&std::fs::read(private).unwrap()).unwrap(),
        std::fs::read(public).unwrap(),
        std::fs::read(temp.path().join("private.pem")).unwrap(),
    )
}
fn claims() -> Value {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();
    json!({"iss":"https://issuer.example", "aud":"reboot-app", "sub":"owner", "exp":now+3600, "nbf":now-60, "user_id":"forged"})
}
fn sign(key: &EncodingKey, claims: &Value) -> String {
    jsonwebtoken::encode(&Header::new(Algorithm::RS256), claims, key).unwrap()
}
fn policy(public: &[u8]) -> AuthorizationPolicy {
    AuthorizationPolicy::new(
        Some(Arc::new(
            JwtTokenVerifier::rs256(public, "https://issuer.example", "reboot-app").unwrap(),
        )),
        None,
    )
    .for_declaration::<Account>()
}
struct Account;
impl reboot_rust_schema::runtime::DurableStateDeclaration for Account {
    type State = reboot_rust_schema::proto::Empty;
    const STATE_TYPE: &'static str = "example.Account";
    const AUTO_CONSTRUCT: i32 = 1;
}
async fn verify(
    policy: &AuthorizationPolicy,
    token: Option<String>,
) -> Result<
    (
        reboot_rust_schema::auth::AuthorizationContext,
        Option<reboot_rust_schema::auth::Auth>,
    ),
    tonic::Status,
> {
    let mut headers = RebootHeaders::new("example.Account:owner");
    headers.bearer_token = token;
    policy
        .verify(headers, "example.Account", "example.AccountMethods.Get")
        .await
}
#[tokio::test]
async fn signed_identity_reaches_owner_policy_without_trusting_payload_identity() {
    let (key, public) = keys();
    let p = policy(&public);
    let (context, auth) = verify(&p, Some(sign(&key, &claims()))).await.unwrap();
    assert_eq!(auth.as_ref().unwrap().user_id(), Some("owner"));
    assert_eq!(auth.as_ref().unwrap().payload()["user_id"], "forged");
    p.authorize(&context, auth.as_ref(), None, &[])
        .await
        .unwrap();
    let mut other = context.clone();
    other.headers = RebootHeaders::new("example.Account:forged");
    assert_eq!(
        p.authorize(&other, auth.as_ref(), None, &[])
            .await
            .unwrap_err()
            .code(),
        tonic::Code::PermissionDenied
    );
    other = context;
    other.method = "example.AccountMethods.SetClaims".into();
    assert_eq!(
        p.authorize(&other, auth.as_ref(), None, &[])
            .await
            .unwrap_err()
            .code(),
        tonic::Code::PermissionDenied
    );
}
#[tokio::test]
async fn malformed_wrong_key_algorithm_and_claims_fail_closed() {
    let (key, public) = keys();
    let (wrong_key, _) = keys();
    let p = policy(&public);
    for token in [
        None,
        Some(String::new()),
        Some("unsigned".into()),
        Some("x".repeat(16385)),
        Some(sign(&wrong_key, &claims())),
        Some(
            jsonwebtoken::encode(
                &Header::new(Algorithm::HS256),
                &claims(),
                &EncodingKey::from_secret(b"public-key-confusion"),
            )
            .unwrap(),
        ),
    ] {
        assert_eq!(
            verify(&p, token).await.unwrap_err().code(),
            tonic::Code::Unauthenticated
        );
    }
    for (name, value) in [
        ("iss", json!("other")),
        ("iss", json!(["other", "https://issuer.example"])),
        ("nbf", json!("future")),
        ("nbf", json!(null)),
        ("nbf", json!(-1)),
        ("nbf", json!({"time":0})),
        ("exp", json!(9999999999.5)),
        ("aud", json!("other")),
        ("exp", json!(1)),
        ("nbf", json!(u64::MAX / 2)),
        ("sub", json!("")),
        ("sub", json!(" ")),
        ("sub", json!(123)),
    ] {
        let mut c = claims();
        c[name] = value;
        assert_eq!(
            verify(&p, Some(sign(&key, &c))).await.unwrap_err().code(),
            tonic::Code::Unauthenticated,
            "{name}"
        );
    }
    let alternate = jsonwebtoken::encode(&Header::new(Algorithm::RS512), &claims(), &key).unwrap();
    assert!(verify(&p, Some(alternate)).await.is_err());
    use base64::Engine;
    let unsigned = format!(
        "eyJhbGciOiJub25lIn0.{}.",
        base64::engine::general_purpose::URL_SAFE_NO_PAD
            .encode(serde_json::to_vec(&claims()).unwrap())
    );
    assert!(verify(&p, Some(unsigned)).await.is_err());
    for name in ["iss", "aud", "exp", "sub"] {
        let mut c = claims();
        c.as_object_mut().unwrap().remove(name);
        assert_eq!(
            verify(&p, Some(sign(&key, &c))).await.unwrap_err().code(),
            tonic::Code::Unauthenticated,
            "missing {name}"
        );
    }
}
#[tokio::test]
async fn maximum_supported_modulus_verifies_both_public_pem_forms() {
    use rsa::{pkcs1::EncodeRsaPublicKey, pkcs8::DecodePublicKey};
    let (key, spki, _) = keys_for_bits("4096");
    let public =
        rsa::RsaPublicKey::from_public_key_pem(std::str::from_utf8(&spki).unwrap()).unwrap();
    let pkcs1 = public.to_pkcs1_pem(rsa::pkcs1::LineEnding::LF).unwrap();
    let credential = sign(&key, &claims());
    for pem in [spki.as_slice(), pkcs1.as_bytes()] {
        let p = policy(pem);
        let (context, auth) = verify(&p, Some(credential.clone())).await.unwrap();
        assert_eq!(auth.as_ref().unwrap().user_id(), Some("owner"));
        p.authorize(&context, auth.as_ref(), None, &[])
            .await
            .unwrap();
    }
}

#[test]
fn invalid_host_configuration_is_rejected() {
    assert!(JwtTokenVerifier::rs256(b"invalid", "issuer", "audience").is_err());
    let (_, public) = keys();
    for (issuer, audience) in [("", "a"), ("i", ""), (" ", "a"), ("i", " ")] {
        assert!(JwtTokenVerifier::rs256(&public, issuer, audience).is_err());
    }
    let temp = tempfile::tempdir().unwrap();
    let ec_private = temp.path().join("ec-private.pem");
    let ec_public = temp.path().join("ec-public.pem");
    assert!(
        Command::new("openssl")
            .args([
                "genpkey",
                "-algorithm",
                "EC",
                "-pkeyopt",
                "ec_paramgen_curve:P-256",
                "-out"
            ])
            .arg(&ec_private)
            .output()
            .unwrap()
            .status
            .success()
    );
    assert!(
        Command::new("openssl")
            .args(["pkey", "-pubout", "-in"])
            .arg(&ec_private)
            .arg("-out")
            .arg(&ec_public)
            .output()
            .unwrap()
            .status
            .success()
    );
    assert!(
        JwtTokenVerifier::rs256(&std::fs::read(ec_public).unwrap(), "issuer", "audience").is_err()
    );
    let (_, small_public, private) = keys_for_bits("1024");
    assert!(JwtTokenVerifier::rs256(&small_public, "issuer", "audience").is_err());
    assert!(JwtTokenVerifier::rs256(&private, "issuer", "audience").is_err());
    assert!(
        JwtTokenVerifier::rs256(
            b"-----BEGIN RSA PUBLIC KEY-----\nMAA=\n-----END RSA PUBLIC KEY-----",
            "issuer",
            "audience"
        )
        .is_err()
    );
}
