import { promises as fs } from "node:fs";
import path from "node:path";
import type { PersistedState } from "./contracts";


const DEFAULT_STATE: PersistedState = {
  nodes: [],
  activeNodeId: null,
  subscriptions: [],
  processRules: [],
  domainRules: [],
  settings: {
    autoStart: false,
    startMinimized: false,
    autoUpdate: true,
    useTunMode: false,
    killSwitch: false,
    allowTelemetry: false,
    dnsMode: "auto",
    subscriptionUserAgent: "auto",
    runtimePath: "",
    routeMode: "global"
  }
};

type PersistedStatePatch =
  Omit<Partial<PersistedState>, "settings"> & {
    settings?: Partial<PersistedState["settings"]>;
  };

export class StateStore {
  private readonly filePath: string;
  private state: PersistedState = structuredClone(DEFAULT_STATE);

  public constructor(baseDir: string) {
    this.filePath = path.join(baseDir, "egoistshield-state.json");
  }

  public async load(): Promise<PersistedState> {
    try {
      const raw = await fs.readFile(this.filePath, "utf8");
      const parsed = JSON.parse(raw) as Partial<PersistedState>;
      this.state = {
        ...DEFAULT_STATE,
        ...parsed,
        settings: {
          ...DEFAULT_STATE.settings,
          ...(parsed.settings ?? {})
        }
      };
    } catch {
      this.state = structuredClone(DEFAULT_STATE);
    }

    return this.get();
  }

  public get(): PersistedState {
    return structuredClone(this.state);
  }

  public async set(next: PersistedState): Promise<PersistedState> {
    this.state = structuredClone(next);
    await this.save();
    return this.get();
  }

  public async patch(next: PersistedStatePatch): Promise<PersistedState> {
    this.state = {
      ...this.state,
      ...next,
      settings: {
        ...this.state.settings,
        ...(next.settings ?? {})
      }
    };
    await this.save();
    return this.get();
  }

  private async save(): Promise<void> {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.writeFile(this.filePath, JSON.stringify(this.state, null, 2), "utf8");
  }
}
