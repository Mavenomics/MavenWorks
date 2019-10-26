# `@mavenomics/help`

In-app documentation manager and browser for MavenWorks.

If you write a plugin targetting MavenWorks that adds significant functionality,
you may wish to add documentation for it that the user can refer back to. This
package lets you do that in a clean and concise way.

## Adding a document

In your plugin, add `IHelpDocProvider` as a requirement:

```
+  requires: [IHelpDocProvider]
```

Then, you can add Markdown documents to the Help system using this provider:

```ts
help.addDocument(`# My plugin

My plugin is a very plugin-y plugin that plugins a few plugins to plugin things.

 - Point 1
 - Point 2
 - Point 3

\`\`\`mql
SELECT
    'This is a query example!',
    'In the browser, this will have a "Run this query" button!'
FROM dual
\`\`\`

`);
```

If you'd like to organize your docs into a folder, or specify a custom title,
use a YAML front-matter:

```ts
help.addDocument(`---
title: Note on a thing
path: Plugins/My Plugin
---

# Note on a thing
...
`);
```

This will make your document appear in the help browser under "Plugins > My Plugin > Note on a thing".

## Auto-generated docs

MQL UDFs, Parts, and Layout containers are automatically documented by this
plugin. You do not need to do anything special to document them.
