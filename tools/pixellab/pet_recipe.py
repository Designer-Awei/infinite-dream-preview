"""Query selected pet recipes and losslessly extract their approved runtime pixels.

Offline only. Dependencies: Pillow for check/export; list/show need Python only.
"""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
LIBRARY = ROOT/'docs/references/pet-animation-recipes.json'


def read_library(root=ROOT):
    return json.loads((root/'docs/references/pet-animation-recipes.json').read_text(encoding='utf-8'))


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def frames_for(root, recipe):
    from PIL import Image
    runtime = recipe['runtime']
    path = (root/runtime['atlas']).resolve()
    if not path.is_relative_to((root/'web/assets/pets').resolve()):
        raise ValueError('Atlas must be in web/assets/pets')
    with Image.open(path) as image:
        image = image.convert('RGBA')
        frames = []
        for (x, y), expected in zip(runtime['coordinates'], runtime['frame_rgba_sha256'], strict=True):
            w, h = runtime['cw'], runtime['ch']
            if not (0 <= x <= image.width-w and 0 <= y <= image.height-h):
                raise ValueError('Atlas coordinate is out of bounds')
            frame = image.crop((x, y, x+w, y+h))
            if hashlib.sha256(frame.tobytes()).hexdigest() != expected:
                raise ValueError(f'Runtime pixels no longer match recipe: {recipe["id"]}')
            frames.append(frame)
    return frames


def validate(root=ROOT):
    data = read_library(root)
    catalog = json.loads((root/'art/references/catalog.json').read_text(encoding='utf-8'))
    originals = {}
    hashes = set()
    for item in catalog['files']:
        path = (root/item['file']).resolve()
        assert path.is_relative_to((root/'art/references').resolve())
        assert path.stat().st_size == item['bytes'] and sha(path) == item['sha256'], item['file']
        assert item['sha256'] not in hashes, 'Duplicate canonical original'
        hashes.add(item['sha256'])
        originals[item['file']] = item
    for file, info in data['atlases'].items():
        assert sha(root/file) == info['sha256'], file
        assert max(info['size']) <= 4096
    samples = 0
    ids = set()
    for recipe in data['recipes']:
        assert recipe['id'] not in ids
        ids.add(recipe['id'])
        assert recipe['prompt_id'] in data['prompts']
        assert all(source in originals for source in recipe['originals'])
        assert recipe['request']['frame_count'] == 12
        assert recipe['runtime']['cw'] == recipe['runtime']['ch'] == 256
        frames = frames_for(root, recipe)
        assert len(frames) == 13
        assert frames[0].tobytes() == frames[-1].tobytes(), recipe['id']
        samples += len(frames)
    return {'originals':len(originals), 'recipes':len(ids), 'unique_prompts':len(data['prompts']), 'frame_samples':samples}


def export(recipe, output, root=ROOT):
    from PIL import Image
    root = root.resolve()
    output = output if output.is_absolute() else root/output
    output = output.resolve()
    allowed = [(root/'art').resolve(), (root/'.cache').resolve()]
    if not any(output.is_relative_to(base) and output != base for base in allowed):
        raise ValueError('Export must stay under this repository art/ or .cache/')
    if output.is_relative_to((root/'art/references').resolve()):
        raise ValueError('Do not export derived art into canonical references')
    frames = frames_for(root, recipe)
    names = ['reference-256.png', 'selected-strip.png', 'recipe.json']
    output.mkdir(parents=True, exist_ok=True)
    paths = [output/name for name in names]
    if any(p.exists() or p.is_symlink() for p in paths):
        raise FileExistsError('Export destination already contains output; choose a new directory')
    strip = Image.new('RGBA', (256*len(frames),256))
    for i, frame in enumerate(frames):
        strip.paste(frame, (256*i,0))
    frames[0].save(paths[0])
    strip.save(paths[1])
    paths[2].write_text(json.dumps(recipe, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    return {'output':str(output), 'frames':len(frames), 'native_resolution':256}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument('--list', action='store_true')
    action.add_argument('--show', metavar='ID')
    action.add_argument('--export', metavar='ID')
    action.add_argument('--check', action='store_true')
    parser.add_argument('--filter', default='')
    parser.add_argument('--limit', type=int, default=10)
    parser.add_argument('--output', type=Path)
    args = parser.parse_args()
    data = read_library()
    if args.check:
        result = validate()
    elif args.list:
        matches = [r for r in data['recipes'] if args.filter.casefold() in r['id'].casefold()]
        result = {'total':len(matches), 'ids':[r['id'] for r in matches[:max(0,args.limit)]]}
    else:
        key = args.show or args.export
        recipe = next((r for r in data['recipes'] if r['id']==key), None)
        if recipe is None:
            parser.error('Unknown recipe ID; use --list')
        recipe = dict(recipe, prompt=data['prompts'][recipe['prompt_id']])
        if args.export:
            result = export(recipe, args.output or Path('art/work/pet-exports')/key)
        else:
            result = recipe
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
