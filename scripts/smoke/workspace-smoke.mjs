// Isolated component + backend integration smoke. No live accounts, credentials or UI automation.
import {execFileSync} from 'node:child_process';
execFileSync('npm',['test','--','tests/components/steward-workspaces.test.tsx','tests/lib/workspace-integration.test.ts'],{
  stdio:'inherit',env:{...process.env,DEBUG_PRINT_LIMIT:'800'},
});
console.log('PASS: continuous home conversation, isolated task contexts, AA bookkeeping, clarification, safe failure and pending plans.');
