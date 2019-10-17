---
title: Architechture
path: /Developers
---

# High Level Architectural Overview

## `Dashboard`

The `Dashboard` class represents a complete dashboard. The `Dashboard` manages
the dashboard model, owns the various services required by a dashboard, and
exposes methods for setting the model and signalling model dirtiness.

`Dashboard` uses the following classes:
 - [`PartManager`](##PartManager) (1:1)
 - [`LayoutManager`](##LayoutManager) (1:1)
 - [`PartFactory`](##PartFactory) (1:1, derived from a higher level factory)
 - [`GlobalsService`](##GlobalsService) (1:1)
 - [`BindingsProvider`](##BindingsProvider) (1:1)

`Dashboard` works with the following classes:
 - [`IRenderMimeRegistry`](http://jupyterlab.github.io/jupyterlab/rendermime/interfaces/irendermimeregistry.html)
    - Optional
    - Renders arbitrary MIME blobs as would be sent by a Jupyter kernel.
    - Some parts require this service to function, such as any type of
    KernelPart.
 - [`IClientSession`](http://jupyterlab.github.io/jupyterlab/apputils/modules/iclientsession.html)
    - Optional
    - Exposes channels for sending Kernel messages, connecting to Jupyter Comms,
    etc.
    - Some parts require this service to function, such as any type of
    KernelPart.
 - `IExpressionEvaluator`
    - Optional
    - Communicate with a binding evaluator that executes outside of the
    dashboard's control (such as a Python kernel).
    - This is required for Python Eval bindings.
 - `IExternalPartRenderer`
    - Optional
    - A renderer that can take arbitrary data and turn it into a widget.
    - Also exposes metadata about available data blobs, if there are any.

## Layout Engine

The Layout engine is one of the most important components of a Dashboard, along
with the PartManager. The Engine is built using [Phosphor](http://phosphorjs.github.io),
and thus uses Phosphor constructs extensively.

It uses a top-down approach, where constraints are evaluated at the root and
then passed down to solve the whole tree. This approach works well for
dashboards, as it greatly simplifies the framework and enables analytical,
linear-time algorithms for otherwise-complex layout schemes.

The engine also includes a drag-n'-drop docking framework. This framework is
largely bolt-on, and exposes ways for regions to customize docking behavior.
Note that while PhosphorJS includes a DockPanel, the DockPanel is insufficient
for dashboards. DockPanels lack the flexibility demanded of comprehensive,
production-ready dashboards and are designed instead for an IDE dock layout.

### `LayoutManager`

The `LayoutManager` handles the visual layout of the dashboard. Parts are
organized into a tree of containers, such as a Stack Panel or a Tab Panel.
The `LayoutManager` exposes some basic facilities for working with these
regions, while `LayoutActions` exposes tree manipulation helpers.

The `LayoutManager` also tracks the UX state of the layout. For instane, it will
track which region most recently had focus, and report that as the focused
region.

The `LayoutManager` can be used independently of a dashboard, it just needs
a part provider and some factory for creating new parts.

One caveat is that the `LayoutManager` must always have a root region. This must
be a [`RegionWithChildren`](##RegionWithChildren),

`LayoutManager` uses the following classes:
 - [`DockPreview`](##DockPreview) (1:1)

`LayoutManager` works with the following classes:
 - `LayoutManager.IPartManager`
    - An interface for getting parts by a string GUID.
    - The `LayoutManager` does not require `Part` instances, just
    [`Widget`](http://phosphorjs.github.io/phosphor/api/widgets/classes/widget.html)
    instances.
 - `LayoutManager.IFactory`
    - An interface for instantiating new "parts" (see above) and adding them to
    the `LayoutManager.IPartManager`, as well as describing the types of "parts"
    available to instantiate.
 - `LayoutSerializer`
    - The `LayoutSerializer` instantiates a Layout tree from a given JSON model,
    and serializes a given layout tree back to JSON.
 - `LayoutActions`
    - Exposes methods for manipulating the layout tree
    - Used by the docking API
 - `DockingPreview

### `DashboardLayoutRegion`

The `DashboardLayoutRegion` is the base class for all layout regions used by the
`LayoutManager`. A layout region implementation must subclass this class, and
may override the following methods:

 - `public static GetMetadata()`
    - This method describes all the known properties of this region.
    - Call `super.GetMetadata()` to get a metadata object pre-populated with the
    superclass layout properties.
 - `public sizeContentToFit(bounds)`
    - Calculate the values of derived layout properties, and retrieve the values
    of layout properties.
    - Implementations must _not_ apply any properties to the DOM in this method!
    - Implementations _must_ call the superclass implementation!
    - This method is called during the layout lifecycle.
 - `public updateFromProperties()`
    - Given the properties retrived during `sizeContentToFit`, apply them to the
    DOM.
    - Implementations _must_ call the superclass implementation!
    - This method is called during the layout lifecycle.
 - `onBeforeFocus`/`onAfterFocus`
    - Lifecycle functions called when this region is focused by the framework.
    - This can happen either due to user action or from the framework.
 - `onBeforeBlur`/`onAfterBlur`
    - Lifecycle functions called when this region has lost focus.

By convention, layout properties are described with two brackets in the
documentation (eg, `[[showOverlays]]`).

### `RegionWithChildren`

`RegionWithChildren` is a subclass of `DashboardLayoutRegion` that implements
methods for working with children.

In addition to the methods exposed by `DashboardLayoutRegion`,
`RegionWithChildren` subclassers may override the following methods:

 - `public layoutChildren()`
    - Implementors _must_ override this function.
    - Arrange the children of this region synchronously, changing DOM properties
    as required.
    - This method is called during the layout lifecycle.
 - `public createDragShadow(child, clientX, clientY)`
    - Optional.
    - Override this method if you wish to provide a custom drag shadow for use
    in docking.
 - `onChildRegionAdded`/`onChildRegionRemoved`
    - Override this method if you need to update the layout when children are
    added or removed.

Some layout properties are per-child, but do not make sense globally.
Subclassers can define "Attached Properties" for these cases, to define a
per-part property that is only respected by a particular `RegionWithChildren`
subclass. Eg, `[[StackPanelLayoutRegion.FixedSize]]`. Declare the existence of
these properties in `GetMetadata()`, using `metadata#addAttachedMetdata()`.

Regions may also have `Chroming`; These are widgets added by the parent layout
to children, and are cleared whenever the widget is moved in the tree. Use these
for things like resizer-grips.

## Parts

Parts are the bread-and-butter of Maven dashboards, and comprise an [execution
framework](##PartManager) and a [view](##Part). Views communicate using a set
of "Options", which are managed by the `PartManager` and can be bound together
using [bindings](##Bindings).

### `PartManager`

The `PartManager` controls the instantiation and execution of `Part` instances.

`PartManager` works with the following classes:
    - [`PartFactory`](##PartFactory)
        - Used to instantiate new parts
    - [`GlobalsService`](##GlobalsService)
        - Used to enable 2-way bindings via globals
    - [`BindingsProvider`](##BindingsProvider)
        - Used to evaluate all other types of bindings

The flow of execution is as follows:

 - `addPart`
    - Instantiate a new part of the given type
    - set the options to a given model (if any)
    - Wire up callbacks:
        - `RefreshRequested` -> `cancelPartEvaluations`, `evaluateOrWaitForUser`
        - `CancelRequested` -> `cancelPart`
        - `disposed` -> `onPartDisposed`
        - `OnOptionChanged` -> `evaluateOrWaitForUser`
    - Initalize the part with `initializePart`
 - `trySetOption`
    - Set the given option to the given value in the part's option bag
    - Handle various interactions between the option and bindings
 - `initializePart`
    - Try
        - Send lifecycle message BeforeInitialize
        - Call `part#initialize()`
        - Send lifecycle message AfterInitialize
    - Catch
        - Send lifecycle message `init-error` and bail.
    - Call `evaluateOrWaitForUser`
 - `evaluateOrWaitForUser`
    - Check if `[[WaitForUser]]` is true and that the user wasn't the one to
    trigger the refresh:
        - If so, show the WaitForUser overlay on the part and bail.
    - Call `evaluateOptions`
 - `evaluateOptions`
    - Check if the bag is stale
        - If not, call `renderPart` and bail.
    - Check if there are any evaluating options.
        - If not, send lifecycle message `BeforeCalculate`.
    - For each stale option:
        - If there was a previous evaluation for that option, cancel it.
        - Set a new eval token
        - Call `evaluateOptionForPart`, then `handleOptionFinished`
 - `evaluateOptionForPart`
    - Send a `before-option-calc` lifecycle message
    - Determine if the option change will result in a changed model
        - If so, set model dirtiness now
    - If the part does not have a binding, return with the new value
    - Otherwise, fetch the evaluator for that binding
    - Try
        - Setup callbacks for cancellation
        - Evaluate the option
        - If the binding was a global:
            - Set the global value if the option value changed the global
        - Otherwise, call `OptionsBag#setBindingValue`.
    - Catch
        - If the evaluation was cancelled, return.
        - Send an `option-error` lifecycle message, and report the error to the
        console.
 - `handlePartFinished`
    - If the part is fresh and did not error
        - Send `AfterCalculate` lifecycle message.
        - Set the option bag fresh.
    - Call `renderPart`.
 - `renderPart`
    - Assert that the part is idle, initialized, wasn't cancelled, and lacks any
    errors.
    - Aquire a render mutex for this part.
    - Try
        - Send `BeforeRender` lifecycle message.
        - Call `part#render()`
        - Send `AfterRender` lifecycle message
    - Catch
        - Send `render-error` lifecycle message
        - Report the error to the console.
    - Release the render mutex.

### `PartFactory`

A PartFactory is where part constructors are registered. Parts are associated
with a string name that is used in serialization. Consumers of `PartFactory`
can retrieve all the registered parts, and use that information to do things
like populating lists in UI designers.

Part factories are hierarchal- there is a global `PartFactory` that all built-in
parts are registered to. Each Dashboard's part factory derives from a given
`PartFactory`, which is used for Local Parts (UDPs that are saved alongside the
dashboard). Implementations may define whatever levels of hierarchy between the
global factory and the one provided to the Dashboard. (Eg, The JupyterLab plugin
leverages this to scope KernelParts to a given kernel)

### `Part`

A Part represents an individual view in a Dashboard. Parts do not interact with
the rest of the dashboard, and are isolated from one another. They instead
use Options, which the framework will manage. When these options change, the
part will be re-rendered.

Part options are declared by overwriting the static method `GetMetadata()`, in
a similar fashion to layout regions. Options named "Input Table" are special-
cased in the UI, and recieve additional integrations (such as a binding editor
and a "Copy/Paste Table Binding" command).

Parts primarily consist of two methods:

 - `initialize`
    - Setup the initial state of the view and pre-fetch any
    dependencies.
    - The value of the part's options are undefined during this method, they
    are not provided to the part.
 - `render`
    - Update the view using the values of the part options.

It's good practice to front-load as much work onto `initialize` as possible-
the more lightweight you can make `render`, the snappier the view will be.

`Part` may be subclassed directly, which will work for most implementations. For
views using React, you may find the `ReactPart` subclass helpful.

The `Part` base class manages some lifecycle methods, and handles the stateful
part overlay that appears over the part when the part is calculating options,
rendering, initalizing, or awaiting a command from the user to refresh.

## Bindings

Bindings define how part options interact with each other. They glue a dashboard
together into a cohesive, maintainable unit.

Dashboards normally have the following types of bindings:

 - `None`: A dummy binding that does nothing (default)
 - `Global`: A two-way binding to a named global
 - `Mql`: A binding to the result of an MQL query
 - `Javascript`: A binding to the result of a Javascript function
 - `Eval`: A binding to the result of a kernel function (only in JupyterLab)

### `BindingsProvider`

The `BindingsProvider` manages the binding evaluators, and owns the shared
thread pool that the MQL and JS binding evaluators use. It offers a layer of
indirection to the binding types, so that in the future we can make this more
dynamic and pluggable.

`BindingsProvider` uses the following class:
    - `MqlWorkerPool` (1:1)
        - Hard-coded 8 threads, with a cancel timeout of 15 seconds.

`BindingsProvider` works with the following classes:
    - [`GlobalsService`](#globalsservice)
        - The globals service is provided to all binding evaluators, so that
        they can retrieve the globals referenced in a binding just prior to
        evaluation.
    - `IExpressionEvaluator`
        - Optional.
        - If provided, an EvalBindingsEvaluator will be added to the evaluators
        list and made available to consumers.

### `GlobalsService`

The GlobalsService tracks changes in dashboard-level global variables, and
includes methods for manipulating and retrieving the globals. It also exposes
an Observable for global deltas, so that consumers can react to new globals,
updated globals, renamed globals, and deleted globals.

Globals are typed using the serializer's annotation system. It does _not_ check
type validity, it merely exposes the types for consumers to check against. A
future update may add type validity checking to `GlobalsService#set`.
