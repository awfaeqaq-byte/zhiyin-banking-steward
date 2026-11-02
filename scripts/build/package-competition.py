#!/usr/bin/env python3
"""Stage and archive a clean competition edition. Never removes source files."""
import argparse
import hashlib
import json
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
APPS = ['Alipay', 'FoodDelivery', 'Map', 'Railway12306', 'TencentMeeting',
        'Weather', 'Wechat', 'WechatReading', 'Zhiyin']
THEMES = ['88f0097e-a5a4-47c5-82a6-c0eabbc784b9', 'af0f7f90-04fb-417b-941e-ae7b549fe5e5',
          'b8006e83-c497-4642-9815-f674b82842b0', '5a6b76c4-cefa-45d7-8f2d-e39d3c4639f5']
IGNORED = {'.DS_Store', '__pycache__', 'node_modules', '.git', '.pytest_cache'}


def ignored_file(p):
    return (any(part in IGNORED for part in p.parts) or p.suffix == '.pyc'
            or p.name.startswith('.zhiyin-') or p.name.startswith('.sandbox-model')
            or (p.name.startswith('.env') and p.name != '.env.example'))


def copy_item(relative, dest):
    source = ROOT / relative
    if source.is_dir():
        for p in sorted(source.rglob('*')):
            if p.is_file() and not ignored_file(p.relative_to(ROOT)):
                target = dest / p.relative_to(ROOT)
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(p, target)
    elif source.is_file():
        target = dest / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)
    else:
        raise FileNotFoundError(source)


def stage(dest):
    if dest.exists():
        raise SystemExit('Staging path already exists; choose a new empty path.')
    dest.mkdir(parents=True)
    for item in ['src', 'server', 'tests', 'scripts', 'design-system', '.gitignore',
                 'package.json', 'package-lock.json', 'requirements-akshare.txt',
                 'index.html', 'vite.config.ts', 'vitest.config.ts', 'eslint.config.js',
                 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json',
                 'tailwind.config.js', 'postcss.config.js', 'components.json']:
        copy_item(item, dest)
    for item in ['os', 'system', 'sandbox', 'server', 'scripts', 'tests',
                 'package.json', 'package-lock.json', 'index.tsx', 'index.html', 'index.css',
                 'app.css', 'vite.config.ts', 'vitest.config.ts', 'tsconfig.json',
                 'tsconfig.node.json', 'eslint.config.js', '.env.example', '.gitignore',
                 'LICENSE', 'LICENSE-DATA', 'NOTICE', 'DISCLAIMER.md']:
        copy_item('mobilegym/' + item, dest)
    for app in APPS:
        copy_item('mobilegym/apps/' + app, dest)
    for item in ['icons', 'logos', 'ime', 'vendor', 'sdcard', 'tailwind.css']:
        copy_item('mobilegym/public/' + item, dest)
    for item in ['map', 'wallpapers']:
        copy_item('mobilegym/mobilegym-data/' + item, dest)
    for theme in THEMES:
        copy_item('mobilegym/mobilegym-data/themes/' + theme, dest)
    manifest_path = Path('mobilegym/mobilegym-data/themes/manifest.json')
    manifest = json.loads((ROOT / manifest_path).read_text())
    for key in ['themes', 'fonts', 'aod', 'widgets']:
        manifest[key] = [row for row in manifest[key]
                         if row['id'] in THEMES or row.get('themeId') in THEMES]
    manifest['defaultThemeId'] = THEMES[0]
    manifest['_distributionNotice'] = 'Zhiyin competition edition: only bundled theme resources are listed.'
    (dest / manifest_path).write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    entry = dest / 'mobilegym/index.tsx'
    entry.write_text(entry.read_text().replace("import './apps/Spotify/state';",
        '// Competition edition: music application and its media dataset are not bundled.'))
    # Start a fresh judging session in the current conversation UI; keep an existing choice.
    html = dest / 'index.html'
    html.write_text(html.read_text().replace('<div id="root"></div>', '''<div id="root"></div>
    <script>
      try {
        if (localStorage.getItem('zhiyin-mode') === null) {
          localStorage.setItem('zhiyin-mode', JSON.stringify('native'));
        }
      } catch { /* The app handles unavailable browser storage. */ }
    </script>'''))
    # Keep only tests whose app dependencies are present; the 225 Zhiyin tests are all retained.
    omitted_apps = {p.name for p in (ROOT / 'mobilegym/apps').iterdir() if p.is_dir()} - set(APPS)
    skipped_tests = []
    for test in (dest / 'mobilegym/tests').glob('*'):
        if test.is_file() and any('/' + app + '/' in test.read_text() for app in omitted_apps):
            skipped_tests.append(test.name)
            test.unlink()
    shutil.copy2(ROOT / 'scripts/build/competition-guide.md', dest / 'README.md')
    for name, content in {
        '启动.command': '#!/bin/sh\ncd "$(dirname "$0")" || exit 1\nnode scripts/build/competition-launch.mjs start\n',
        '安装依赖.command': '#!/bin/sh\ncd "$(dirname "$0")" || exit 1\nnode scripts/build/competition-launch.mjs install\n',
        '启动.bat': '@echo off\r\nchcp 65001 >nul\r\ncd /d "%~dp0"\r\nnode scripts/build/competition-launch.mjs start\r\npause\r\n',
        '安装依赖.bat': '@echo off\r\nchcp 65001 >nul\r\ncd /d "%~dp0"\r\nnode scripts/build/competition-launch.mjs install\r\npause\r\n',
    }.items():
        (dest / name).write_text(content)
        if name.endswith('.command'):
            (dest / name).chmod(0o755)
    (dest / 'submission-profile.json').write_text(json.dumps({
        'edition': 'Zhiyin competition edition', 'sandbox_apps': APPS,
        'theme_resource_ids': THEMES, 'max_zip_bytes': 300_000_000,
        'excluded': ['personal keys and runtime state', 'node_modules', 'Git history',
                     'RL/benchmark training environment', 'unrelated social/media apps',
                     'old compiled assets', 'technical documents and presentation materials'],
        'omitted_unrelated_sandbox_tests': skipped_tests,
    }, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'stage': str(dest), 'apps': APPS}, ensure_ascii=False))


def archive(dest, output):
    if not (dest / 'mobilegym/dist/index.html').is_file():
        raise SystemExit('Build the staged project first.')
    paths = sorted(p for p in dest.rglob('*') if p.is_file()
                   and not ignored_file(p.relative_to(dest))
                   and '.artifacts' not in p.relative_to(dest).parts
                   and '.venv-akshare' not in p.relative_to(dest).parts)
    paths = [p for p in paths if p.name not in {'file-manifest.json', 'shared-file-copies.json'}]
    manifest = [{'path': str(p.relative_to(dest)), 'bytes': p.stat().st_size,
                 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
                for p in paths]
    seen, copies, packed = {}, [], []
    for p, record in zip(paths, manifest):
        key = (record['bytes'], record['sha256'])
        if record['bytes'] > 1024 and key in seen and record['path'].startswith('mobilegym/'):
            copies.append({'from': seen[key], 'to': record['path'], 'sha256': record['sha256']})
        else:
            packed.append(p)
            seen[key] = record['path']
    (dest / 'shared-file-copies.json').write_text(json.dumps(copies, ensure_ascii=False, indent=2) + '\n')
    (dest / 'file-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    paths = packed + [dest / 'file-manifest.json', dest / 'shared-file-copies.json']
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        raise SystemExit('Output archive exists; choose a new path.')
    partial = output.with_suffix('.partial.zip')
    with zipfile.ZipFile(partial, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for p in paths:
            z.write(p, Path('zhiyin') / p.relative_to(dest))
    size = partial.stat().st_size
    if size >= 300_000_000:
        raise SystemExit(f'Over 300 MB: {size} bytes. Partial archive retained for inspection.')
    with zipfile.ZipFile(partial) as z:
        bad = z.testzip()
        if bad:
            raise SystemExit('Corrupt ZIP entry: ' + bad)
    partial.rename(output)
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    output.with_suffix('.sha256').write_text(f'{digest}  {output.name}\n')
    print(json.dumps({'archive': str(output), 'bytes': size, 'files': len(paths),
                      'identical_files_restored_by_launcher': len(copies),
                      'sha256': digest}, ensure_ascii=False))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['stage', 'archive'])
    parser.add_argument('destination', type=Path)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    if args.action == 'stage':
        stage(args.destination.resolve())
    elif args.output:
        archive(args.destination.resolve(), args.output.resolve())
    else:
        parser.error('archive requires --output')
