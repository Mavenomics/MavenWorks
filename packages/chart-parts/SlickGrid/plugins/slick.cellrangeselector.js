// TODO clean up these comments

(function ($) {
    // register namespace
    $.extend(true, window, {
        "Slick": {
            "CellRangeSelector": CellRangeSelector
        }
    });

    function CellRangeSelector (options) {
        var _grid;
        var _gridOptions;
        var _$activeCanvas;
        var _dragging;
        var _decorator;
        var _self = this;
        var _handler = new Slick.EventHandler();
        var _defaults = {
            selectionCss: {
                "border": "2px dashed blue"
            }
        };

        // Frozen row & column variables
        var _rowOffset;
        var _columnOffset;
        var _isRightCanvas;
        var _isBottomCanvas;

        function init (grid) {
            options = $.extend(true, {}, _defaults, options);
            _decorator = new Slick.CellRangeDecorator(grid, options);
            _grid = grid;
            _gridOptions = _grid.getOptions();
            _handler
                .subscribe(_grid.onDragInit, handleDragInit)
                .subscribe(_grid.onDragStart, handleDragStart)
                .subscribe(_grid.onDrag, handleDrag)
                .subscribe(_grid.onDragEnd, handleDragEnd);
        }

        function destroy () {
            _handler.unsubscribeAll();
        }

        function handleDragInit (e, dd) {
            // Set the active canvas node because the decorator needs to append its
            // box to the correct canvas
            _$activeCanvas = $(_grid.getActiveCanvasNode(e));

            var c = _$activeCanvas.offset();

            _columnOffset = 0;
            _rowOffset = 0;
            _isBottomCanvas = _$activeCanvas.hasClass('grid-canvas-bottom');

            if (_gridOptions.frozenRow > -1 && _isBottomCanvas) {
                _rowOffset = ( _gridOptions.frozenBottom ) ? $('.grid-canvas-bottom').height() : $('.grid-canvas-top').height();
            }

            _isRightCanvas = _$activeCanvas.hasClass('grid-canvas-right');

            if (_gridOptions.frozenColumn > -1 && _isRightCanvas) {
                _columnOffset = $('.grid-canvas-left').width();
            }

            // prevent the grid from cancelling drag'n'drop by default
            e.stopImmediatePropagation();
        }

        function addColumnOffset (position) {
            if (position == null) {
                return undefined;
            }
            var newPos = position;
            newPos.left += _columnOffset;
            return newPos;
        }

        function handleDragStart (e, dd) {
            var cell = _grid.getCellFromEvent(e);
            if (_self.onBeforeCellRangeSelected.notify(cell) !== false) {
                if (_grid.canCellBeSelected(cell.row, cell.cell)) {
                    _dragging = true;
                    e.stopImmediatePropagation();
                }
            }
            if (!_dragging) {
                return;
            }

            _grid.focus();
            dd.range = {start: cell, end: {}};

            //_grid.getSelectionModel().setSelectedRanges([dd.range]);
            _self.onCellRangeSelected.notify({
                range: new Slick.Range(
                    dd.range.start.row,
                    dd.range.start.cell,
                    dd.range.start.row,
                    dd.range.start.cell
                )
            });

            //var box = _grid.getCellNodeBox(cell.row, cell.cell);
            //if (cell.cell > _gridOptions.frozenColumn)
            //    return _decorator.show(_$activeCanvas, addColumnOffset(box));
            //else
            //    return _decorator.show(_$activeCanvas, box);
        }

        function handleDrag (e, dd) {
            if (!_dragging) {
                return;
            }
            e.stopImmediatePropagation();

            var end = _grid.getCellFromPoint(
                e.pageX - _$activeCanvas.offset().left + _columnOffset,
                e.pageY - _$activeCanvas.offset().top + _rowOffset
            );

            if ((!_grid.canCellBeSelected(end.row, end.cell) )
                || ( !_isRightCanvas && ( end.cell > _gridOptions.frozenColumn ) )
                || ( _isRightCanvas && ( end.cell <= _gridOptions.frozenColumn ) )
                || ( !_isBottomCanvas && ( end.row >= _gridOptions.frozenRow ) )
                || ( _isBottomCanvas && ( end.row < _gridOptions.frozenRow ) )
            ) {
                //return;
            }

            dd.range.end = end;

            _self.onCellRangeSelected.notify({
                range: new Slick.Range(
                    dd.range.start.row,
                    dd.range.start.cell,
                    dd.range.end.row,
                    dd.range.end.cell
                )
            });

            var from = _grid.getCellNodeBox(dd.range.start.row, dd.range.start.cell);
            var to = addColumnOffset(_grid.getCellNodeBox(end.row, end.cell));

            if (dd.range.start.cell > _gridOptions.frozenColumn)
                from = addColumnOffset(from);

            if (end.cell > _gridOptions.frozenColumn) {
                to = addColumnOffset(end);
            }

            //_decorator.show(_$activeCanvas, from, to);
        }

        function handleDragEnd (e, dd) {
            if (!_dragging) {
                return;
            }

            _dragging = false;
            e.stopImmediatePropagation();

            //_decorator.hide();
            _self.onCellRangeSelected.notify({
                range: new Slick.Range(
                    dd.range.start.row,
                    dd.range.start.cell,
                    dd.range.end.row,
                    dd.range.end.cell
                )
            });
        }

        $.extend(this, {
            "init": init,
            "destroy": destroy,

            "onBeforeCellRangeSelected": new Slick.Event(),
            "onCellRangeSelected": new Slick.Event()
        });
    }
})
(jQuery);