import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
// ZIP stores identical source/build assets once. Recreate only missing copies.
const copiesFile = join(root, 'shared-file-copies.json');
if (existsSync(copiesFile)) {
  for (const copy of JSON.parse(readFileSync(copiesFile, 'utf8'))) {
    const source = resolve(root, copy.from), target = resolve(root, copy.to);
    const prefix = root + (process.platform === 'win32' ? '\\' : '/');
    if (!source.startsWith(prefix) || !target.startsWith(prefix)) throw new Error('资源清单路径无效');
    if (existsSync(target)) continue;
    if (createHash('sha256').update(readFileSync(source)).digest('hex') !== copy.sha256) {
      throw new Error(`资源校验失败，请重新解压提交包：${copy.from}`);
    }
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(source, target);
  }
}
const [major, minor] = process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 13)) {
  console.error('请先安装 Node.js 22.13 或更高版本。');
  process.exit(1);
}
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const venvPython = join(root, '.venv-akshare', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python');
const env = { ...process.env, PUPPETEER_SKIP_DOWNLOAD: 'true' };
if (existsSync(venvPython)) {
  env.AKSHARE_PYTHON = venvPython;
  env.ZHIYIN_PYTHON = venvPython;
}
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {
    cwd, env, stdio: 'inherit', shell: process.platform === 'win32' && command === npm,
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
function requireDependencies() {
  if (!existsSync(join(root, 'node_modules/vite/bin/vite.js')) ||
      !existsSync(join(root, 'mobilegym/node_modules/vite/bin/vite.js'))) {
    console.error('首次运行请执行：node scripts/build/competition-launch.mjs install');
    process.exit(1);
  }
}
const action = process.argv[2] || 'start';
if (action === 'install') {
  run(npm, ['ci', '--no-audit', '--no-fund']);
  run(npm, ['ci', '--no-audit', '--no-fund'], join(root, 'mobilegym'));
  console.log('依赖安装完成。执行 node scripts/build/competition-launch.mjs start 启动。');
} else if (action === 'python') {
  const candidates = process.platform === 'win32'
    ? [['py', ['-3']], ['python', []]] : [['python3', []], ['python', []]];
  const selected = candidates.find(([cmd, args]) => spawnSync(cmd, [...args, '--version'], { stdio: 'ignore' }).status === 0);
  if (!selected) {
    console.error('请先安装 Python 3.10 或更高版本，再执行此命令。');
    process.exit(1);
  }
  run(selected[0], [...selected[1], '-c', 'import sys; assert sys.version_info >= (3,10), "Python 3.10+ required"']);
  run(selected[0], [...selected[1], '-m', 'venv', join(root, '.venv-akshare')]);
  run(venvPython, ['-m', 'pip', 'install', '-r', join(root, 'requirements-akshare.txt')]);
  console.log('行情依赖安装完成。请通过本启动脚本启动，让服务自动使用此 Python 环境。');
} else if (action === 'start' || action === 'dev') {
  requireDependencies();
  if (action === 'start' && !existsSync(join(root, 'mobilegym/dist/index.html'))) {
    console.error('缺少编译产物，请先执行 npm run build。');
    process.exit(1);
  }
  console.log('打开 http://127.0.0.1:3000/，在手机桌面点击「知银」。按 Ctrl+C 停止服务。');
  run(npm, ['run', action === 'dev' ? 'phone:dev' : 'phone:preview']);
} else if (action === 'check') {
  requireDependencies();
  run(npm, ['test', '--', '--maxWorkers=2', '--minWorkers=1']);
  run(npm, ['run', 'build']);
} else {
  console.error('可用命令：install | start | dev | python | check');
  process.exit(1);
}
