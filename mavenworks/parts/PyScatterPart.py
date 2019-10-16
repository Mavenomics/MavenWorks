"""A short and sweet part to demonstrate the Python Part API."""
from matplotlib import pyplot as plt
from .KernelPart import KernelPart, register_part
import pandas as pd


@register_part()
class PyScatterPart(KernelPart):
    """A simple KernelPart.

    PyScatterPart takes the following options:

        - Input Data {Table} The data to plot in a scatterplot
        - X Column {String} The column of the above table to use as x-coord
        - Y Column {String} Same, but for the y-coord
    """

    @classmethod
    def get_metadata(cls):
        """Return metadata describing the options this part has."""
        metadata = super().get_metadata()
        df = pd.DataFrame(data={"x": [1, 2, 3], "y": [3, 2, 1]})
        metadata.add_option("Input Data", df, "Table")
        metadata.add_option("X Column", "x", "String")
        metadata.add_option("Y Column", "y", "String")
        return metadata

    def render(self, opts):
        """Render this part.

        :param opts: An OptionsBag containing the data we need to render
        """
        data = opts["Input Data"]
        fig = plt.figure()
        plt.scatter(data[opts["X Column"]], data[opts["Y Column"]])
        plt.close()
        # technically we can also display() it, or just output it using pyplot
        return fig
