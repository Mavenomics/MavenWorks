"""A wrapper generator for IPyWidgets, allows interop with MavenWorks."""

from .KernelPart import KernelPart, register_part
from ..serialization import traitlet_to_type
import ipywidgets as widgets
import traitlets
from IPython.core.display import display


def gen_wrapper(widget_cls, trait_names):
    """Generate a widget wrapper and register it immediately.

    :param widget_cls: The Widget to wrap into a Part
    :param trait_names: A list of widget properties that should become part
    options
    """
    @register_part(widget_cls.__name__ + "Part")  # pylint: disable=W0612
    class WrapperPart(KernelPart):
        @classmethod
        def get_metadata(cls):
            metadata = super().get_metadata()
            traits = widget_cls.class_traits()
            for opt in trait_names:
                trait = traits[opt]
                default = trait.default_value
                if default is traitlets.Undefined:
                    default = None
                type_annotation = traitlet_to_type(trait)
                metadata.add_option(opt, default, type_annotation)
            return metadata

        def initialize(self):
            self.widget = widget_cls()
            self.bag = None
            self.widget.observe(self._on_widget_updated, names=trait_names)

        def _on_widget_updated(self, change):
            if self.bag is None:
                return

            self.bag[change["name"]] = change["new"]

        def render(self, opts):
            self.bag = None
            for opt in opts:
                setattr(self.widget, opt, opts[opt])
            self.bag = opts
            display(self.widget)


# An example
gen_wrapper(widgets.IntSlider, [
    "value",
    "min",
    "max",
    "step",
    "description",
    "readout",
    "readout_format"
])
