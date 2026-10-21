"""Build a self-contained design preview and a distributable zip. No image edits."""
from pathlib import Path
import base64
import re
import zipfile

root = Path(__file__).resolve().parents[1]
docs = root / 'docs'
html = (docs / 'index.html').read_text(encoding='utf-8')
css = (docs / 'styles.css').read_text(encoding='utf-8')
html = html.replace('<link rel="stylesheet" href="./styles.css">', '<style>' + css + '</style>')
for name in ['config.js', 'api.js', 'app.js']:
    html = html.replace(f'  <script defer src="./{name}"></script>\n', '')
scripts = '\n'.join((docs / name).read_text(encoding='utf-8') for name in ['config.js','api.js','app.js'])
# A portable preview must never accidentally issue live tickets.
scripts = re.sub(r"endpoint:\s*'[^']*'", "endpoint: ''", scripts, count=1)
html = html.replace('</body>', '<script>' + scripts + '</script>\n</body>')
image = base64.b64encode((docs/'assets/ticket-original.png').read_bytes()).decode('ascii')
html = html.replace('./assets/ticket-original.png', 'data:image/png;base64,' + image)
favicon = base64.b64encode((docs/'assets/favicon.svg').read_bytes()).decode('ascii')
html = html.replace('./assets/favicon.svg','data:image/svg+xml;base64,'+favicon)
(root/'PREVIEW.html').write_text(html,encoding='utf-8')
out = root.parent/'JUKEBOX-ticket-web.zip'
with zipfile.ZipFile(out,'w',compression=zipfile.ZIP_DEFLATED) as z:
    for file in sorted(root.rglob('*')):
        if file.is_file() and not any(p in {'.git','node_modules','__pycache__'} for p in file.relative_to(root).parts):
            z.write(file, str(Path('jukebox-ticket')/file.relative_to(root)))
print(str(out))
print('Files:',len(zipfile.ZipFile(out).namelist()))
print('Bytes:',out.stat().st_size)
