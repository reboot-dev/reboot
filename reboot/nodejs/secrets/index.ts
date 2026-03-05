import * as os from "os";
import * as path from "path";
import { promises as fs } from "fs";

export const ENVVAR_RBT_SECRETS_DIRECTORY = "RBT_SECRETS_DIRECTORY";

abstract class SecretSource {
  abstract get(secretName: string): Promise<Buffer>;
}

export class Secrets {
  private static _staticSecretSource: SecretSource | null = null;

  private _secretCache: { [key: string]: _CachedSecret } = {};
  private _secretSource: SecretSource;

  constructor() {
    if (Secrets._staticSecretSource) {
      this._secretSource = Secrets._staticSecretSource;
      return;
    }

    const secretsDirectory = process.env[ENVVAR_RBT_SECRETS_DIRECTORY];

    if (secretsDirectory) {
      this._secretSource = new DirectorySecretSource(
        path.resolve(secretsDirectory)
      );
    } else {
      this._secretSource = new EnvironmentSecretSource();
    }
  }

  static setSecretSource(secretSource: SecretSource | null): void {
    Secrets._staticSecretSource = secretSource;
  }

  get secretSource(): SecretSource {
    return this._secretSource;
  }

  async get(
    secretName: string,
    { ttlSecs = 15.0 }: { ttlSecs?: number } = {}
  ): Promise<Buffer> {
    const now = Date.now();
    const cachedSecret = this._secretCache[secretName];
    if (cachedSecret && cachedSecret.cachedAt + ttlSecs > now) {
      return cachedSecret.value;
    }

    const value = await this._secretSource.get(secretName);
    this._secretCache[secretName] = new _CachedSecret(value, now);
    return value;
  }
}

export class SecretNotFoundException extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretNotFoundException";
  }
}

export class DirectorySecretSource extends SecretSource {
  constructor(public directory: string) {
    super();
  }

  async get(secretName: string): Promise<Buffer> {
    const secretPath = path.join(this.directory, secretName);
    try {
      return await fs.readFile(secretPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new SecretNotFoundException(
          `No secret is stored for secretName=${secretName} (at \`${secretPath}\`).`
        );
      }
      throw error;
    }
  }
}

export class EnvironmentSecretSource extends SecretSource {
  ENVIRONMENT_VARIABLE_PREFIX = "RBT_SECRET_";

  async get(secretName: string): Promise<Buffer> {
    const environmentVariableName = `${
      this.ENVIRONMENT_VARIABLE_PREFIX
    }${secretName.toUpperCase().replace(/-/g, "_")}`;

    const value = process.env[environmentVariableName];
    if (value === undefined) {
      throw new SecretNotFoundException(
        `No environment variable was set for secretName=${secretName}; ` +
          `expected \`${environmentVariableName}\` to be set`
      );
    }
    return Buffer.from(value);
  }
}

export class MockSecretSource extends SecretSource {
  constructor(public secrets: { [key: string]: Buffer }) {
    super();
  }

  async get(secretName: string): Promise<Buffer> {
    const value = this.secrets[secretName];
    if (value === undefined) {
      throw new SecretNotFoundException(
        `No mock secret was stored for secretName=${secretName}.`
      );
    }
    return value;
  }
}

class _CachedSecret {
  constructor(public value: Buffer, public cachedAt: number) {}
}
