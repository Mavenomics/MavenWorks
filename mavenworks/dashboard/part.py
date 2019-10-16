"""Provides the Part wrapper for the Textual Declarative API."""

import uuid
from ..serialization import serialize, guess_type
from .bind import Binding
from .helpers import kwargs_to_properties


def serialize_opt(opt):
    """Private helper for serializing a part binding."""
    if isinstance(opt, Binding):
        return opt._as_json()
    return serialize(opt, guess_type(opt))


class Part:
    MIMETYPE = "application/vnd.maven.part+json"

    def __init__(self, name, options, **props):
        self.__name = name
        self.__options = options
        self.__props = props
        self.__uuid = str(uuid.uuid4())
        self.__layout_uuid = str(uuid.uuid4())

    def _as_part(self):
        return {
            "text/plain": self.__name + " Part Model",
            Part.MIMETYPE: {
                "name": self.__name,
                "id": self.__uuid,
                "options": {
                    opt: serialize_opt(value)
                    for opt, value in self.__options.items()
                }
            }
        }, self.__uuid

    def _as_json(self):
        attached_props, layout_props = kwargs_to_properties(self.__props)
        return {
            "guid": self.__uuid,
            "id": self.__layout_uuid,
            "typeName": 1,
            "properties": layout_props
        }, attached_props
