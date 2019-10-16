"""Private utilities for translating kwargs to proper layout props."""

__attached_properties__ = [
    "Fixed Size (px)",
    "Stretch",
    "Canvas Panel.Rectangle",
    "Grid Panel.Column",
    "Grid Panel.Column Span",
    "Grid Panel.Row",
    "Grid Panel.Row Span",
]

__kwarg_to_property_map__ = {
    # kwarg name                real name
    "border_width":             "borderWidth.px",
    "border_color":             "borderColor",
    "background_color":         "backgroundColor",
    "padding":                  "padding.px",
    "show_title":               "showTitle",
    "show_region":              "showRegion",
    "caption":                  "caption",
    "caption_color":            "captionColor",
    "caption_background":       "captionBackground",

    # WidgetLayoutRegion
    "show_overlays":            "showOverlays",

    # StackPanel
    "horizontal":               "horizontal",
    "show_splitters":           "showSplitters",
    "splitter_width":           "splitterWidth.px",

    # Grid
    "n_rows":                   "nRows",
    "n_cols":                   "nCols",
    "grid_spacing":             "spacing.px",

    # TabPanel
    "foreground_index":         "ForegroundIndex",

    # Attached properties
    "Stack_FixedSize":          "Fixed Size (px)",
    "Stack_Stretch":            "Stretch",
    "Canvas_Rectangle":         "Canvas Panel.Rectangle",
    "Grid_Column":              "Grid Panel.Column",
    "Grid_ColSpan":             "Grid Panel.Column Span",
    "Grid_Row":                 "Grid Panel.Row",
    "Grid_RowSpan":             "Grid Panel.Row Span",
}


def kwargs_to_properties(kwargs):
    """Translate the given kwargs to a set of attached and layout props.

    The layout props can be directly inserted to the layout region's properties
    in the JSON model. The attached properties must be passed up to the region
    parent.
    """
    _attached_props = {}
    _layout_props = {}

    for key, value in kwargs.items():
        real_key = __kwarg_to_property_map__[key]
        if real_key in __attached_properties__:
            _attached_props[real_key] = value
        else:
            _layout_props[real_key] = value

    return _attached_props, _layout_props
