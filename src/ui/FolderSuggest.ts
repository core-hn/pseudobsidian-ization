import { AbstractInputSuggest, App, TFolder } from 'obsidian';

/**
 * Autocomplete sur les dossiers du vault.
 * Usage :
 *   new FolderSuggest(app, inputEl).onFolderSelect(folder => { ... });
 */
export class FolderSuggest extends AbstractInputSuggest<TFolder> {
  private folderSelectCallback: ((folder: TFolder) => void) | null = null;

  constructor(app: App, inputEl: HTMLInputElement) {
    super(app, inputEl);
  }

  onFolderSelect(cb: (folder: TFolder) => void): this {
    this.folderSelectCallback = cb;
    return this;
  }

  getSuggestions(query: string): TFolder[] {
    const lower = query.toLowerCase();
    const results: TFolder[] = [];
    const traverse = (folder: TFolder) => {
      if (folder.path.toLowerCase().contains(lower)) results.push(folder);
      for (const child of folder.children) {
        if (child instanceof TFolder) traverse(child);
      }
    };
    traverse(this.app.vault.getRoot());
    return results.slice(0, 20);
  }

  renderSuggestion(folder: TFolder, el: HTMLElement): void {
    el.setText(folder.isRoot() ? '/' : folder.path);
  }

  selectSuggestion(folder: TFolder): void {
    this.setValue(folder.isRoot() ? '/' : folder.path);
    this.folderSelectCallback?.(folder);
    this.close();
  }
}
