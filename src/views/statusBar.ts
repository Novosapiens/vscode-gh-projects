import * as vscode from 'vscode';

/** "$(project) 2 in progress": my items in the configured column of the last opened project. */
export class StatusBarCounter implements vscode.Disposable {
  private readonly item = vscode.window.createStatusBarItem('ghProjects.inProgress', vscode.StatusBarAlignment.Left, 50);

  constructor() {
    this.item.name = 'GitHub Projects: my items in progress';
    this.item.command = 'ghProjects.openLastBoard';
  }

  show(count: number, column: string, projectTitle: string): void {
    this.item.text = `$(project) ${count} ${column.toLowerCase()}`;
    this.item.tooltip = `${count} item${count === 1 ? '' : 's'} assigned to you in "${column}" on ${projectTitle}. Click to open the board.`;
    this.item.accessibilityInformation = { label: this.item.tooltip };
    this.item.show();
  }

  hide(): void {
    this.item.hide();
  }

  get text(): string {
    return this.item.text;
  }

  dispose(): void {
    this.item.dispose();
  }
}
