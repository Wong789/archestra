import ngrok from "@ngrok/ngrok";
import config from "@/config";
import logger from "@/logging";
import SecretModel from "@/models/secret";
import { secretManager } from "@/secrets-manager";
import type { SecretValue } from "@/types";

const NGROK_SECRET_NAME = "ngrok-auth-token";
const FORCE_DB = true;

class NgrokTunnel {
  private listener: ngrok.Listener | null = null;
  private session: ngrok.Session | null = null;

  get url(): string | null {
    return this.listener?.url() ?? null;
  }

  get domain(): string | null {
    const url = this.url;
    if (!url) return null;
    try {
      return new URL(url).hostname;
    } catch {
      return null;
    }
  }

  get isRunning(): boolean {
    return this.listener !== null;
  }

  async start(authToken: string, domain?: string): Promise<string> {
    if (this.listener) {
      return this.listener.url() ?? "";
    }

    const port = config.api.port;

    this.session = await new ngrok.SessionBuilder()
      .authtoken(authToken)
      .connect();

    const endpoint = this.session.httpEndpoint();
    if (domain) {
      endpoint.domain(domain);
    }
    this.listener = await endpoint.listenAndForward(`localhost:${port}`);

    const url = this.listener.url() ?? "";
    logger.info(`ngrok tunnel started: ${url} -> localhost:${port}`);

    await this.saveConfig(authToken, domain);

    return url;
  }

  async stop(): Promise<void> {
    if (this.listener) {
      try {
        await this.listener.close();
      } catch (err) {
        logger.warn({ err }, "Error closing ngrok listener");
      }
      this.listener = null;
    }
    if (this.session) {
      try {
        await this.session.close();
      } catch (err) {
        logger.warn({ err }, "Error closing ngrok session");
      }
      this.session = null;
    }
    logger.info("ngrok tunnel stopped");
  }

  async getSavedConfig(): Promise<{
    authToken: string;
    domain?: string;
  } | null> {
    const secretRow = await SecretModel.findByName(NGROK_SECRET_NAME);
    if (!secretRow) return null;

    const secret = await secretManager().getSecret(secretRow.id);
    if (!secret?.secret) return null;

    const data = secret.secret as unknown as {
      authToken?: string;
      domain?: string;
    };
    if (!data.authToken) return null;
    return { authToken: data.authToken, domain: data.domain };
  }

  async hasToken(): Promise<boolean> {
    const saved = await this.getSavedConfig();
    return saved !== null;
  }

  async getSavedDomain(): Promise<string | undefined> {
    const saved = await this.getSavedConfig();
    return saved?.domain;
  }

  private async saveConfig(authToken: string, domain?: string): Promise<void> {
    const value = { authToken, domain } as unknown as SecretValue;
    const existing = await SecretModel.findByName(NGROK_SECRET_NAME);

    if (existing) {
      await secretManager().updateSecret(existing.id, value);
    } else {
      await secretManager().createSecret(value, NGROK_SECRET_NAME, FORCE_DB);
    }
    logger.info("ngrok config saved to DB");
  }
}

export const ngrokTunnel = new NgrokTunnel();
