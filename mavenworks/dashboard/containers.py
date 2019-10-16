from .part import Part
from .helpers import kwargs_to_properties


class Container:
    def __init__(self, container_type, *children, **properties):
        self.__type = container_type
        self.__children = children or []
        self.__properties = properties or {}
        self._name = "Container"

    def add(self, *children):
        self.__children += children

    @property
    def properties(self):
        return self.__properties

    def __repr__(self):
        repr_str = self._name + ":"
        idx = 0
        for child in self.__children:
            idx += 1
            child_repr = repr(child)
            repr_str += "\n+ Child[" + str(idx) + "]:"
            repr_str += "\n|".join(
                map(lambda i: "\t" + i, child_repr.split("\n"))
            )
        return repr_str

    def _collect_parts(self):
        parts = []
        for child in self.__children:
            if isinstance(child, Part):
                parts.append(child)
            elif isinstance(child, Container):
                parts += child._collect_parts()
        return parts

    def _as_json(self):
        child_attached_props = []
        children = []
        attached_props, layout_props = kwargs_to_properties(self.__properties)
        for child in self.__children:
            representation, child_props = child._as_json()
            children.append(representation)
            child_attached_props.append(child_props)

        return {
            "properties": layout_props,
            "attachedProperties": child_attached_props,
            "typeName": self.__type,
            "children": children
        }, attached_props


class StackPanel(Container):
    def __init__(self, *children, **properties):
        super().__init__(0, *children, **properties)


class TabPanel(Container):
    def __init__(self, *children, **properties):
        super().__init__(2, *children, **properties)


class CanvasPanel(Container):
    def __init__(self, *children, **properties):
        super().__init__(3, *children, **properties)


class GridPanel(Container):
    def __init__(self, *children, **properties):
        super().__init__(4, *children, **properties)
