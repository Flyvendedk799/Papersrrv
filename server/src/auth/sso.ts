/**
 * SSO Integration Stubs — SAML/OIDC enterprise auth.
 *
 * To enable SSO (Phase 12):
 *   1. `pnpm add passport-saml openid-client`
 *   2. Implement SAML/OIDC strategy below
 *   3. Configure SSO_PROVIDER, SSO_ISSUER, SSO_CALLBACK_URL in environment
 *
 * Currently returns placeholder configuration for frontend display.
 */
import { logger } from "../middleware/logger.js";

export interface SSOConfig {
  enabled: boolean;
  provider: "saml" | "oidc" | "none";
  issuer?: string;
  callbackUrl?: string;
  metadata?: string;
}

export function getSSOConfig(): SSOConfig {
  const provider = (process.env.SSO_PROVIDER ?? "none") as SSOConfig["provider"];
  return {
    enabled: provider !== "none",
    provider,
    issuer: process.env.SSO_ISSUER,
    callbackUrl: process.env.SSO_CALLBACK_URL,
    metadata: process.env.SSO_METADATA_URL,
  };
}

// Placeholder SAML handler - implement when passport-saml is available
// export function createSAMLStrategy(config: SSOConfig) {
//   const SamlStrategy = require("passport-saml").Strategy;
//   return new SamlStrategy({
//     entryPoint: config.issuer,
//     callbackUrl: config.callbackUrl,
//     issuer: "paperclip",
//   }, (profile: any, done: any) => {
//     // Map SAML attributes to user
//     done(null, { email: profile.email, name: profile.displayName });
//   });
// }

// Placeholder OIDC handler
// export function createOIDCStrategy(config: SSOConfig) {
//   const { Issuer, Strategy } = require("openid-client");
//   // ... configure OIDC discovery, client, strategy
// }
