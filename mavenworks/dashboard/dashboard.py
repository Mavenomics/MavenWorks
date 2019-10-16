"""Class for implementing a Jupyter Cell Dashboard using Python."""

from .containers import StackPanel
from ..serialization import serialize


class Dashboard:
    """The root of a Cell Dashboard."""

    MIMETYPE = "application/vnd.maven.layout+json"

    def __init__(self):
        """Create a new, empty Dashboard."""
        self.__globals = []
        self.__root = StackPanel()

    @property
    def root(self):
        """Get the root stack panel in a dashboard. Read-only."""
        return self.__root

    def add_global(self, name, type_annotation, default=None):
        """Add a global to the dashboard."""
        self.__globals.append({
            "name": name,
            "type": type_annotation,
            "value": serialize(default, type_annotation)
        })

    def __repr__(self):
        """Return a formatted text string with this dashboard's structure."""
        repr_str = "Dashboard " + super().__repr__() + "\n\nGlobals:"
        for gv in self.__globals:
            repr_str += "\n\t" + gv["name"] + " (" + gv["type"] + ")"
        repr_str += "\nRoot " + repr(self.root)
        return repr_str

    def _repr_mimebundle_(self, include=None, exclude=None):
        root, _ = self.root._as_json()
        parts = self.root._collect_parts()
        parts_repr = {}
        for part in parts:
            part_model, part_id = part._as_part()
            parts_repr[part_id] = part_model

        return {
            "text/plain": "Dashboard Layout (if you see this, check your " +
            " plugin install!)",
            self.MIMETYPE: {
                "layout": root,
                "parts": parts_repr,
                "metadata": {},
                "globals": self.__globals,
                "visual": False
            }
        }, {}
