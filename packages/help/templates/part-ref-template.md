---
title: <%- name %>
path: /Reference/Parts
---

### <%- name %>

<% if (description != null && description != "") { %>
<%- description %>
<% } %>

<% if (opts.length > 0) {%>
#### Options

<% opts.map(function(i) { %>
- **`<%- i.name %>`: _`<%- i.type.name %>`_** <%-
    (i.value == null || i.value === "") ? "" : "` = " + i.value + "`"
%><%- i.description == null ? "" : "\n\n   " + i.description %>
<% }) %>

<% } %>

<% if (remarks != null) { %>
#### Remarks

<%= remarks %>

<% } %>
