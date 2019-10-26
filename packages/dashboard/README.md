# `@mavenomics/dashboard`

Dashboard, serializers, and related framework runners.

The Dashboard package provides a top-level Phosphor widget called `Dashboard`.
This can be consumed directly by third-party applications, and is suitable for
embedding dashboards in your app.

### Creating a `Dashboard`

To create a dashboard, you will need some meta-information about your app and
a `PartFactory`:

```ts
// The BaseUrl should point to a location where Parts can load any dependencies,
// such as additional Javascript files or stylesheets.
const baseUrl = "/";
// The BaseViewUrl is used by the SlickGrid to create a dashboard hover- if your
// app doesn't support loading from URLs, you can just set this to the empty
// string.
const baseViewUrl = "/";

const dashboard = new Dashboard({
    partFactory: new PartFactory(),
    baseUrl,
    baseViewUrl
});
```

### Saving and loading

To load a JSON model into a Dashboard:

```ts
await dashboard.loadFromModel(myJsonModel);
```

To serialize a Dashboard to JSON, use the `DashboardSerializer`:

```ts
DashboardSerializer.toJson(dashboard);
```

### Events

Dashboards emit an `OnDirty` signal to notify consumers that their model has
changed. Subscribe to this signal and call `setClean()` to acknowledge the change.

Dashboards also have a property called `shouldNotifyDirty`. This is to distinguish
from minor changes that users might make over the course of interacting with a
dashboard, that they normally wouldn't care to save (such as updating a global).
Use this property for things like "onBeforeUnload" handlers.
