export class WebStore {
  private prefix: string;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = localStorage.getItem(`${this.prefix}:${key}`);
      if (raw === null) return null;
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  async set(key: string, value: unknown): Promise<void> {
    localStorage.setItem(`${this.prefix}:${key}`, JSON.stringify(value));
  }

  async delete(key: string): Promise<void> {
    localStorage.removeItem(`${this.prefix}:${key}`);
  }

  async save(): Promise<void> {
    // localStorage is sync, no-op
  }
}

export async function load(name: string): Promise<WebStore> {
  return new WebStore(name);
}
