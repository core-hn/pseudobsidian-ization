// Mock minimal de l'API Obsidian pour Jest (environnement Node, pas navigateur)

export class Plugin {
  app: App = new App();
  async loadData(): Promise<unknown> { return {}; }
  async saveData(_data: unknown): Promise<void> {}
  addSettingTab(_tab: unknown): void {}
}

export class App {}

export class PluginSettingTab {
  app: App;
  containerEl: MockEl;

  constructor(app: App, _plugin: unknown) {
    this.app = app;
    this.containerEl = new MockEl();
  }
}

export class Setting {
  constructor(_containerEl: unknown) {}
  setName(_name: string): this { return this; }
  setDesc(_desc: string): this { return this; }
  addText(_cb: (_t: MockTextInput) => unknown): this {
    _cb(new MockTextInput());
    return this;
  }
  addToggle(_cb: (_t: MockToggle) => unknown): this {
    _cb(new MockToggle());
    return this;
  }
}

class MockEl {
  empty(): void {}
  createEl(_tag: string, _opts?: unknown): MockEl { return new MockEl(); }
}

class MockTextInput {
  setValue(_v: string): this { return this; }
  onChange(_cb: (_v: string) => unknown): this { return this; }
}

class MockToggle {
  setValue(_v: boolean): this { return this; }
  onChange(_cb: (_v: boolean) => unknown): this { return this; }
}
