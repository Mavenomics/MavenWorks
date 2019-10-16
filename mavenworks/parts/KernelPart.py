"""Kernel Parts."""

from uuid import uuid4
from .PartHelpers import PartMetadata
from typing import Union, Callable, ItemsView

registry = {}
cb = None


def _set_new_part_hook(callback: Union[Callable, None]):
    global cb
    cb = callback


def _get_all_parts() -> ItemsView:
    return registry.items()


def register_part(name=None):
    """Register a KernelPart with MavenWorks.

    :param name: A name for this part, defaults to class name
    :type name: str, optional

    :Example:

    >>> @register_part()
    ... class MyCoolPart(KernelPart):
    ...    pass
    """
    def register(f):
        # fun fact: this is only sort of a closure because of how it's called
        # so we need the nonlocal keyword to tell Python that this is a closure
        nonlocal name
        if name is None:
            name = f.__name__
        registry[name] = f
        if cb is not None:
            cb(name, f)
        return f
    return register


class KernelPart():
    """Abstract base class for KernelParts.

    :Example:

    >>> import time
    >>> @register_part()
    ... class MyPart(KernelPart):
    ...     @classmethod()
    ...     def get_metadata(cls):
    ...         metadata = super().get_metadata()
    ...         metadata.add_option("NumberToSquare", "Number", 42)
    ...         return metadata
    ...     def initialize(self):
    ...         display("Hello, world!")
    ...     def render(self, opts):
    ...         number_to_square = opts["NumberToSquare"]
    ...         # The user will see a 'Rendering' overlay while ``render``
    ...         # runs, unless [[showOverlays]] is false.
    ...         time.sleep(1)
    ...         display(number_to_square ** 2)
    ...

    """

    @staticmethod
    def Create(name):
        """Do not use. Internal method for the KernelPartManager."""
        part = registry[name]()
        return part

    @classmethod
    def get_metadata(cls):
        """Describe this part's metadata.

        ..note::
            KernelParts should override this method to add options.

        :Example:

        >>> class MyPart(KernelPart):
        ...     @classmethod
        ...     def get_metadata(cls):
        ...         metadata = super().get_metadata()
        ...         metadata.add_option("MyFooOption", "Number", 42)
        ...         return metadata
        """
        return PartMetadata()

    def __init__(self):
        """Part constructor."""
        self.uuid = str(uuid4())
        self.is_disposed = False

    def initialize(self):
        """Initialize this part, performing any necessary setup.

        .. note::
            ``initialize`` is called by the framework after everything on the
            client is setup. Use this method for long-running tasks that only
            need to run once, such as fetching dependencies or setting up
            initial view state.
        """
        pass

    def render(self, options):
        """Render this part.

        :param options: An OptionsBag holding the values of this parts options
        :type options: OptionsBag

        .. note::
            ``render`` is called by the framework after an option has changed.
            This means it can be called frequently, and therefore should be
            as fast as possible.

        .. note::
            Anything ``display()``'d or ``return``'d from this method will be
            displayed on the client. Part writers do not need to worry about
            how the output will be displayed.
            If there is no output, then ``stdout`` and ``stderr`` will be
            displayed instead.
        """
        pass

    def dispose(self):
        """Clean up any resources this part held.

        .. note::
            This method is recommended over ``__del__`` since the framework
            calls it explicitly upon part deconstruction, and will not
            introduce the harmful GC loops that ``__del__`` can.
        """
        if self.is_disposed:
            return
        self.is_disposed = True
