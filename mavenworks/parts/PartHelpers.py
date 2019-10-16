"""PartHelpers - MavenWorks internal module.

A set of helpers that support kernel parts. These should not be directly
used by user code, with the exception of :class:PartMetadata.
"""

from collections import OrderedDict
from itertools import islice
from typing import NamedTuple, List
from rx.subjects import Subject


class Option(NamedTuple):
    """Internal data model for options."""

    name: str
    value: any
    type: str


class PartMetadata:
    """A class that describes the metadata about a part.

    This is normally used in :class:KernelPart.get_metadata().
    """

    def __init__(self):
        """Create a new PartMetadata.

        Normally, you would get this by calling super().get_metadata(),
        but if you want to ignore the options defined by a superclass
        and replace them all, then instantiate a new PartMetadata instead.
        """
        # TODO: Format for option metadata
        self.options_bag: List[Option] = []

    def add_option(self, name, default_value=None, type_annotation="Any"):
        self.options_bag.append(Option(name, default_value, type_annotation))

    def __repr__(self):
        return "PartMetadata" + str([
            f'Name={opt.name}, Type={opt.type_annotation}'
            for opt in self.options_bag
        ])


class OptionsBag:
    def __init__(self, metadata: PartMetadata, model=None):
        self.options_bag = OrderedDict()
        self.is_stale = True
        self.OnStale = Subject()
        for opt in metadata.options_bag:
            if model is not None and opt.name in model['options']:
                value = model['options'][opt.name]
            else:
                value = opt.value
            self.options_bag[opt.name] = value
        self.is_stale = False

    def __getitem__(self, item):
        if isinstance(item, int):
            item = next(islice(self.options_bag.keys(), item, item + 1))
        return self.options_bag[item]

    def __setitem__(self, key, value):
        # hack: We allow these sets for now just to keep things working
        if isinstance(key, int):
            key = next(islice(self.options_bag.keys(), key, key + 1))
        self.options_bag[key] = value
        self.set_stale(key, value)

    def __iter__(self):
        return iter(self.options_bag)

    def __del__(self):
        self.OnStale.on_completed()
        del self.options_bag

    def set_stale(self, name, value):
        if self.is_stale:
            return
        self.is_stale = True
        self.OnStale.on_next((name, value))

    def set_fresh(self):
        self.is_stale = False
