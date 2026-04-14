import { c as _c } from "react-compiler-runtime";
import * as React from 'react';
import { handlePlanModeTransition } from '../../bootstrap/state.js';
import type { LocalJSXCommandContext } from '../../commands.js';
import { Box, Text } from '../../ink.js';
import type { LocalJSXCommandOnDone } from '../../types/command.js';
import { getExternalEditor } from '../../utils/editor.js';
import { toIDEDisplayName } from '../../utils/ide.js';
import { applyPermissionUpdate } from '../../utils/permissions/PermissionUpdate.js';
import { clearPlanSlug } from '../../utils/plans.js';
import { prepareContextForPlanMode } from '../../utils/permissions/permissionSetup.js';
import { getPlan, getPlanContextPackFilePath, getPlanFilePath, getPlanSidecarFilePath, readPlanSidecar } from '../../utils/plans.js';
import { editFileInEditor } from '../../utils/promptEditor.js';
import { renderToString } from '../../utils/staticRender.js';
function PlanDisplay(t0) {
  const $ = _c(13);
  const {
    planContent,
    planPath,
    editorName,
    contextPath
  } = t0;
  let t1;
  if ($[0] === Symbol.for("react.memo_cache_sentinel")) {
    t1 = <Text bold={true}>Current Plan</Text>;
    $[0] = t1;
  } else {
    t1 = $[0];
  }
  let t2;
  if ($[1] !== planPath) {
    t2 = <Text dimColor={true}>{planPath}</Text>;
    $[1] = planPath;
    $[2] = t2;
  } else {
    t2 = $[2];
  }
  let t3;
  if ($[3] !== planContent) {
    t3 = <Box marginTop={1}><Text>{planContent}</Text></Box>;
    $[3] = planContent;
    $[4] = t3;
  } else {
    t3 = $[4];
  }
  let t4;
  if ($[5] !== editorName || $[6] !== contextPath) {
    t4 = editorName && <Box marginTop={1} flexDirection="column"><Box><Text dimColor={true}>"/plan open"</Text><Text dimColor={true}> to edit this plan in </Text><Text bold={true} dimColor={true}>{editorName}</Text></Box>{contextPath ? <Box><Text dimColor={true}>"/plan open context"</Text><Text dimColor={true}> to open the context pack</Text></Box> : null}</Box>;
    $[5] = editorName;
    $[6] = contextPath;
    $[7] = t4;
  } else {
    t4 = $[7];
  }
  let t5;
  if ($[8] !== t2 || $[9] !== t3 || $[10] !== t4) {
    t5 = <Box flexDirection="column">{t1}{t2}{t3}{t4}</Box>;
    $[8] = t2;
    $[9] = t3;
    $[10] = t4;
    $[11] = t5;
  } else {
    t5 = $[11];
  }
  return t5;
}
export async function call(onDone: LocalJSXCommandOnDone, context: LocalJSXCommandContext, args: string): Promise<React.ReactNode> {
  const {
    getAppState,
    setAppState
  } = context;
  const appState = getAppState();
  const currentMode = appState.toolPermissionContext.mode;

  // If not in plan mode, enable it
  if (currentMode !== 'plan') {
    handlePlanModeTransition(currentMode, 'plan');
    setAppState(prev => ({
      ...prev,
      toolPermissionContext: applyPermissionUpdate(prepareContextForPlanMode(prev.toolPermissionContext), {
        type: 'setMode',
        mode: 'plan',
        destination: 'session'
      })
    }));
    const description = args.trim();
    if (description && description !== 'open') {
      onDone('Enabled plan mode', {
        shouldQuery: true
      });
    } else {
      onDone('Enabled plan mode');
    }
    return null;
  }

  // Already in plan mode - show the current plan
  const planContent = getPlan();
  const planPath = getPlanFilePath();
  if (!planContent) {
    onDone('Already in plan mode. No plan written yet.');
    return null;
  }

  // If user typed "/plan open", open in editor
  const argList = args.trim().split(/\s+/);
  if (argList[0] === 'open') {
    const targetPath = argList[1] === 'context'
      ? getPlanContextPackFilePath()
      : argList[1] === 'sidecar'
        ? getPlanSidecarFilePath()
        : planPath;
    const result = await editFileInEditor(targetPath);
    if (result.error) {
      onDone(`Failed to open plan in editor: ${result.error}`);
    } else {
      onDone(`Opened plan in editor: ${targetPath}`);
    }
    return null;
  }

  // /plan reset
  if (argList[0] === 'reset') {
    clearPlanSlug();
    onDone('Reset plan slug for this session. Re-enter /plan to start fresh.');
    return null;
  }

  // /plan status
  if (argList[0] === 'status') {
    const sidecar = readPlanSidecar();
    if (!sidecar?.runbook) {
      onDone('No runbook state found in plan sidecar yet.');
      return null;
    }
    const current =
      sidecar.runbook.steps.find(s => s.status === 'in_progress') ??
      sidecar.runbook.steps.find(s => s.status === 'pending');
    const task = current?.taskId ? ` (Task #${current.taskId})` : '';
    onDone(
      `Runbook: ${sidecar.runbook.state}` +
        (current?.title ? ` · ${current.title}${task}` : ''),
    );
    return null;
  }
  const editor = getExternalEditor();
  const editorName = editor ? toIDEDisplayName(editor) : undefined;
  const contextPath = getPlanContextPackFilePath();
  const display = <PlanDisplay planContent={planContent} planPath={planPath} editorName={editorName} contextPath={contextPath} />;

  // Render to string and pass to onDone like local commands do
  const output = await renderToString(display);
  onDone(output);
  return null;
}
