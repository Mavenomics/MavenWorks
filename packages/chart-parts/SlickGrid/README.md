# Notes on the provenance of this fork

Tracking down exactly what came from where is proving to be a bit challenging.
Here's what I've found so far:

 - Most of SlickGrid Core is even with the MLeibman ("base") distribution
 - Frozen row support comes from JLynch7's 2.0-frozenRowsAndColumns branch

The following features have unknown lineage:

 - Column Grouping
 - Header Path Buttons

The following features have partially known lineage:

 - CellRangeDecorators and CellRangeSelectors

Some of this lineage may have been developed in-house, and then forgotten about
(this is the likeliest explanation for the path buttons). The most coherent
upstream is JLynch7/SlickGrid/tree/2.0-frozenRowsAndColumns, but there may be
a 'missing link' between that fork and this fork.
