"""Global settings handler for Jupyter server plugins."""

import os
import json

__all__ = [
    "get_setting",
]

_default_settings = {
    "global_parts_folder": "parts"
}

_local_dir = os.environ.get("CFG_SETTINGS_FILE") or os.path.abspath(
    os.path.dirname(__file__)
)
_settings_file_location = os.path.join(_local_dir, "MavenWorksServerConf.json")
with open(_settings_file_location, "r") as _settings:
    _META_CONFIG = json.load(_settings)


def get_setting(key):
    """Get a particular setting value from the MavenWorksServerConfig."""
    if key in _META_CONFIG:
        return _META_CONFIG[key]
    if key in _default_settings:
        return _default_settings[key]
    return None
