# MavenWorks Layout

The MavenWorks layout engine is built off of Phosphor widgets and provides a useful
set of containers for user-editable dashboards. Layout regions have a predefined
set of properties, and use those properties for presentation.

## Getting Started

Import the LayoutManager and whatever containers you might need:

```ts
import { LayoutManager, WidgetLayoutRegion } from "@mavenomics/layout";
```

Then, use that LayoutManager in a Phosphor widget:

```ts
class MyDashboard extends Widget {
    private layoutManager: LayoutManager;

    constructor() {
        this.layout = new BoxLayout();
        this.layoutManager = new LayoutManager();
        this.layout.addWidget(this.layoutManager);
    }
}
```

Finally, to create a dashboard, setup your containers and add them to the layout
root:

```ts
const myPart = new MyCoolWidgetPart();
const myRegion = new WidgetLayoutRegion(this.layoutManager, myPart, "some unique ID");
this.layoutManager.root.addWidget(myRegion);
```

You should now see a dashboard with a single widget and a titlebar!

## Serializing and Deserializing

To save dashboards, you can use the `LayoutSerializer` to convert to/from JSON.

Import it:

```ts
import { LayoutSerializer } from "@mavenomics/layout";
```

And use it in your class:

```ts
// Convert to JSON:
const model = LayoutSerializer.toJson(this.layoutManager.root);
// ...
// Load from JSON:
this.layoutManager.initLayout(model);
```

## Defining your own layout regions

The base class of all layout regions is `DashboardLayoutRegion`, which is
abstract. All regions have set of properties, and may have a `content` widget.

If you want to create a new container, such as a `GridLayoutRegion`, the
`RegionWithChildren` class adds several methods for maintaining a set of
children. The only constraint is that `content` must extend Phosphor's `Panel`
widget.

## Manipulating layout subtrees

To close a region and all it's children, simply `#close()` or `#dispose()` it
and the framework will take care of the rest.

To move a region, either within the same node or to another node, call
`#addWidget()` or `#insertWidget()` on the new parent region. You do not need to
unparent it, the framework will again take care of this.

To iterate over the children of a region, containers expose a `widgets` property
that has all the children as an array.

To get the parent of a layout region, use the `parentRegion` property. If
`parentRegion` is null, that either means that the subtree is unattached or that
the region is the root container.