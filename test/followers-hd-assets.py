"""Compatibility entry point for the complete native follower and rider checks."""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).with_name('fox-hd-assets.py')),run_name='__main__')
