const vscode = require('vscode');

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  const startCommand = vscode.commands.registerCommand('openclaude.start', async () => {
    const configured = vscode.workspace.getConfiguration('openclaude');
    const launchCommand = configured.get('launchCommand', 'openclaude');
    const terminalName = configured.get('terminalName', 'OpenClaude');

    const terminal = vscode.window.createTerminal({
      name: terminalName,
      env: {
        CLAUDE_CODE_USE_OPENAI: configured.get('useOpenAIShim', true) ? '1' : undefined,
      },
    });

    terminal.show(true);
    terminal.sendText(launchCommand, true);
  });

  const openDocsCommand = vscode.commands.registerCommand('openclaude.openDocs', async () => {
    await vscode.env.openExternal(vscode.Uri.parse('https://github.com/devNull-bootloader/openclaude'));
  });

  context.subscriptions.push(startCommand, openDocsCommand);
}

function deactivate() {}

module.exports = {
  activate,
  deactivate,
};
