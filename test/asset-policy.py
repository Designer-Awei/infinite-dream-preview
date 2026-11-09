"""Check source-only checkout asset policy, with no local generation history."""
import importlib.util
import json
from pathlib import Path
import subprocess
import shutil
import uuid
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('pet_recipe', ROOT/'tools/pixellab/pet_recipe.py')
recipe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recipe)
report = recipe.validate(ROOT)
catalog = json.loads((ROOT/'art/references/catalog.json').read_text(encoding='utf-8'))
expected_art = {'art/references/catalog.json'} | {row['file'] for row in catalog['files']}
actual_art = {p.relative_to(ROOT).as_posix() for p in (ROOT/'art/references').rglob('*') if p.is_file()}
assert actual_art == expected_art
if (ROOT/'.git').exists():
    git = 'C:/Program Files/Git/cmd/git.exe' if Path('C:/Program Files/Git/cmd/git.exe').exists() else 'git'
    tracked = subprocess.check_output([git,'ls-files','-z','art'],cwd=ROOT).decode().split('\0')
    assert {p for p in tracked if p} == expected_art, 'Generated art must not be tracked'
mirrors = 0
text_extensions = {'.html','.js','.css','.json','.webmanifest','.txt','.md','.svg'}
for path in (ROOT/'web/assets').rglob('*'):
    if path.is_file():
        deployed = ROOT/'docs/assets'/path.relative_to(ROOT/'web/assets')
        assert deployed.is_file(), path
        source_bytes, deployed_bytes = path.read_bytes(), deployed.read_bytes()
        # manifest.py normalizes published text to LF; image bytes must match exactly.
        if path.suffix in text_extensions:
            source_bytes = source_bytes.replace(b'\r\n',b'\n')
            deployed_bytes = deployed_bytes.replace(b'\r\n',b'\n')
        assert source_bytes == deployed_bytes, path
        mirrors += 1
cache = ROOT/'.cache'
cache.mkdir(exist_ok=True)
data = recipe.read_library(ROOT)
directory = cache/('asset-policy-'+uuid.uuid4().hex)
directory.mkdir()
try:
    output = directory/'export'
    first = data['recipes'][0]
    recipe.export(first,output,ROOT)
    with Image.open(output/'reference-256.png') as ref, Image.open(output/'selected-strip.png') as strip:
        assert ref.size==(256,256) and strip.size==(3328,256)
        assert ref.tobytes()==strip.crop((0,0,256,256)).tobytes()
    try:
        recipe.export(first,output,ROOT)
        raise AssertionError('Overwriting an export must be rejected')
    except FileExistsError:
        pass
    for bad in [ROOT.parent/'outside-export', ROOT/'art/references/derived-export']:
        try:
            recipe.export(first,bad,ROOT)
            raise AssertionError('Invalid export path accepted')
        except ValueError:
            pass
finally:
    assert directory.resolve().parent == cache.resolve() and not directory.is_symlink()
    shutil.rmtree(directory)
print(json.dumps(dict(report, runtime_asset_mirrors=mirrors, standalone_checkout=True)))
