---
title: <%- funcName %>
path: /Reference/MQL
---

### <%- funcName %>

<% if (description != null && description != "") { %>
<%= description %>
<% } %>

#### Usage

`<%- signature %>`

<% if (arguments.length > 0 || repeatingArgs.length > 0) {%>
#### Parameters

<% arguments.map(function(i) { %>
- **`<%- i.name %>`: _`<%- i.typeName %>`_**<%-
    i.description == null ? "" : "\n\n   " + i.description
%>
<% }) %>
<%- repeatingArgs.length > 0 ? "- **Repeating args**:" : "" %>
<% repeatingArgs.map(function(i) { %>
   - **`<%- i.name %>`: _`<%- i.typeName %>`_**<%-
    i.description == null ? "" : "\n\n      " + i.description
%>
<% }) %>

<% } %>
#### Returns

- `<%- returnType.name %>`: <%- returnDescription %>

<% if (examples != null && examples.length > 0) { %>
#### Examples

<% for (const example of examples) { %>
```mql
<%= example %>
```
<% } %>

<% } %>

<% if (remarks != null && remarks !== "") { %>
#### Remarks

<%= remarks %>

<% } %>
