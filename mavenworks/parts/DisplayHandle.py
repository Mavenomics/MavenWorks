"""Module providing a mechanism to use DisplayHandles in Dashboards."""

from IPython.display import DisplayHandle
from typing import Union, Callable, Dict

_new_name_hook: Union[None, Callable] = None
_known_names = {}


def _set_name_hook(cb: Callable):
    global _new_name_hook
    _new_name_hook = cb


def _get_known_names() -> Dict[str, str]:
    return _known_names


def name_display_handle(name: str, handle: DisplayHandle):
    """Mark a DisplayHandle, so that it can be used in a Dashboard.

    Display Handles are simple things you can use to put a cell output into a
    dashboard. If they are named, you can use them in the Visual Designer just
    like any part.

    Display handles are _not_ parts. You won't get overlays, bindings, globals,
    etc. when using them. They are meant for static, or hard-to-integrate,
    visualizations.

    Parameters
    ----------
    name : str
        The name of the region to use. If no name is provided, this display
        handle cannot be used in visual dashboards.
    handle : DisplayHandle
        The handle to name. Once named, the handle can be used in dashboards.

    """
    _known_names[name] = handle.display_id
    if _new_name_hook is not None:
        _new_name_hook(name, handle.display_id)  # pylint: disable=not-callable
