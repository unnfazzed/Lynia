/**
 * Secrets seam (D7). We read secrets from injected env rather than Azure Key Vault managed-identity
 * (which has no line-for-line GCP equal), so the secret source is identical on both clouds.
 */
export interface SecretsProvider {
  get(name: string): string | undefined;
  require(name: string): string;
}

export const SECRETS = Symbol("SECRETS_PROVIDER");
