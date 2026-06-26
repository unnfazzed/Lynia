import type { SecretsProvider } from "./secrets.interface";

/** Reads deploy-injected env. Portable across Azure Container Apps and GCP Cloud Run. */
export class EnvSecrets implements SecretsProvider {
  constructor(private readonly source: NodeJS.ProcessEnv = process.env) {}

  get(name: string): string | undefined {
    return this.source[name];
  }

  require(name: string): string {
    const value = this.source[name];
    if (!value) throw new Error(`Missing required secret: ${name}`);
    return value;
  }
}
