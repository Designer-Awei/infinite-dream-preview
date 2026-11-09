"""Replace generated website files while preserving authored references and rules."""
from pathlib import Path
import shutil
import sys

ROOT = Path(__file__).resolve().parents[1]
PRESERVE = {'references', 'rules'}


def linked(path):
    return path.is_symlink() or getattr(path, 'is_junction', lambda: False)()


def publish():
    source, target = ROOT / 'dist', ROOT / 'docs'
    assert source.is_dir() and target.resolve().parent == ROOT.resolve()
    assert not linked(target)
    assert not any((source / name).exists() for name in PRESERVE), 'Runtime conflicts with authored docs'
    target.mkdir(exist_ok=True)
    for child in target.iterdir():
        if child.name in PRESERVE:
            continue
        assert child.resolve().is_relative_to(target.resolve())
        assert not linked(child)
        if child.is_dir():
            assert not any(linked(p) for p in child.rglob('*'))
            shutil.rmtree(child)
        else:
            child.unlink()
    shutil.copytree(source, target, dirs_exist_ok=True)


if __name__ == '__main__':
    publish()
