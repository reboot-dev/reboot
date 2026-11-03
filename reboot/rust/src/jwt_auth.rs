//! Opt-in signed JWT authentication. No OAuth minting, automatic User
//! construction, discovery, key refresh or trusted internal-call authority.
use crate::auth::{Auth, AuthorizationContext, TokenVerification, TokenVerifier, VerifyFuture};
use jsonwebtoken::{Algorithm, DecodingKey, Validation};
use rsa::{
    RsaPublicKey, pkcs1::DecodeRsaPublicKey, pkcs8::DecodePublicKey, traits::PublicKeyParts,
};
use std::time::{SystemTime, UNIX_EPOCH};

/// Host-owned verifier with exactly one pinned RSA algorithm and verification key.
/// Identity is the verified, nonempty `sub`, never a caller-supplied `user_id`.
pub struct JwtTokenVerifier {
    key: DecodingKey,
    validation: Validation,
    issuer: String,
}

impl JwtTokenVerifier {
    /// Configure RS256 with a trusted RSA public PEM, exact issuer and audience.
    /// No clock leeway is granted. `exp`, `iss`, `aud`, and `sub` are required;
    /// `nbf`, when present, is enforced. Key rotation requires replacing the verifier.
    pub fn rs256(public_pem: &[u8], issuer: &str, audience: &str) -> Result<Self, String> {
        if issuer.trim().is_empty() || audience.trim().is_empty() {
            return Err("JWT issuer and audience must be nonempty".into());
        }
        let pem =
            std::str::from_utf8(public_pem).map_err(|_| "invalid RSA public PEM".to_string())?;
        let public = RsaPublicKey::from_public_key_pem(pem)
            .or_else(|_| RsaPublicKey::from_pkcs1_pem(pem))
            .map_err(|_| "expected RSA public verification key".to_string())?;
        if !(2048..=4096).contains(&public.n().bits()) {
            return Err("RSA public key must be 2048..4096 bits".into());
        }
        let key = DecodingKey::from_rsa_pem(public_pem)
            .map_err(|_| "invalid RSA verification key".to_string())?;
        let mut validation = Validation::new(Algorithm::RS256);
        validation.set_issuer(&[issuer]);
        validation.set_audience(&[audience]);
        validation.set_required_spec_claims(&["exp", "iss", "aud", "sub"]);
        validation.validate_nbf = true;
        validation.leeway = 0;
        Ok(Self {
            key,
            validation,
            issuer: issuer.to_owned(),
        })
    }

    // Restrict NumericDate to nonnegative integral seconds, without rounding.
    // The signature library alone accepts malformed optional nbf/issuer arrays.
    fn valid_registered_claims(&self, claims: &serde_json::Value, now: u64) -> bool {
        claims.get("iss").and_then(|v| v.as_str()) == Some(self.issuer.as_str())
            && claims
                .get("exp")
                .and_then(|v| v.as_u64())
                .is_some_and(|exp| exp > now)
            && claims
                .get("nbf")
                .is_none_or(|v| v.as_u64().is_some_and(|nbf| nbf <= now))
    }

    fn authenticate(&self, token: Option<&str>) -> TokenVerification {
        let reject = || TokenVerification::Unauthenticated {
            message: "invalid or missing signed bearer credential".into(),
        };
        let Some(token) = token.filter(|s| !s.is_empty() && s.len() <= 16384) else {
            return reject();
        };
        let Ok(data) =
            jsonwebtoken::decode::<serde_json::Value>(token, &self.key, &self.validation)
        else {
            return reject();
        };
        let Ok(now) = SystemTime::now().duration_since(UNIX_EPOCH) else {
            return reject();
        };
        if !self.valid_registered_claims(&data.claims, now.as_secs()) {
            return reject();
        }
        let Some(subject) = data.claims.get("sub").and_then(|s| s.as_str()) else {
            return reject();
        };
        if subject.trim().is_empty() {
            return reject();
        }
        let subject = subject.to_owned();
        TokenVerification::Authenticated(Auth::new(data.claims).with_user_id(subject))
    }
}

impl TokenVerifier for JwtTokenVerifier {
    fn verify<'a>(
        &'a self,
        _: &'a AuthorizationContext,
        token: Option<&'a str>,
    ) -> VerifyFuture<'a> {
        Box::pin(async move { self.authenticate(token) })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn integral_date_boundaries_without_leeway_or_rounding() {
        let verifier = JwtTokenVerifier {
            key: DecodingKey::from_secret(b"unused"),
            validation: Validation::new(Algorithm::RS256),
            issuer: "issuer".into(),
        };
        assert!(verifier.valid_registered_claims(
            &serde_json::json!({"iss":"issuer","exp":101,"nbf":100}),
            100
        ));
        for claims in [
            serde_json::json!({"iss":"issuer","exp":100}),
            serde_json::json!({"iss":"issuer","exp":101,"nbf":101}),
            serde_json::json!({"iss":"issuer","exp":100.5}),
            serde_json::json!({"iss":"issuer","exp":101,"nbf":99.5}),
        ] {
            assert!(!verifier.valid_registered_claims(&claims, 100), "{claims}");
        }
    }
}
