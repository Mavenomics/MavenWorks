"""MavenWorks Dashboarding Framework."""

__version__ = "0.1.0"

from .parts import gen_wrapper, KernelPart, name_display_handle,\
    register_part, wrap, Option, OptionsBag
from .serialization import guess_type, serialize, deserialize
from .dashboard import Bind, Dashboard, StackPanel, TabPanel, GridPanel, \
    CanvasPanel, Part
from .services import *  # noqa F401 F403

__all__ = [
    "name_display_handle",
    "register_part",
    "KernelPart",
    "gen_wrapper",
    "wrap",
    "guess_type",
    "serialize",
    "deserialize",
    "Option",
    "OptionsBag",
    "gen_wrapper",
    "Bind",
    "Dashboard",
    "StackPanel",
    "TabPanel",
    "GridPanel",
    "CanvasPanel",
    "Part",
]
