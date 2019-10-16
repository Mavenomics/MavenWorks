---
title: <%- name %>
path: /Reference/Layout
---

### <span class="<%- iconClass %>"><%- iconText %></span> <%- name %>

<% if (description != null && description != "") { %>
<%- description %>
<% } %>

<% if (props.length > 0) {%>
#### Layout Properties

<% props.map(function([name, i]) { %>
- **<%- i.prettyName %>: _`<%- i.type.name %>`_** <%-
    (i.default == null || i.default === "") ? "" : "` = " + i.default + "`"
%>

   <%= i.documentation %>
<% }) %>

<% } %>

<% if (attachedProps.length > 0) {%>
#### Attached Properties

<% attachedProps.map(function([name, i]) { %>
- **<%- name %>: _`<%- i.type.name %>`_** <%-
    (i.default == null || i.default === "") ? "" : "` = " + i.default + "`"
%>

   <%= i.documentation %>
<% }) %>

<% } %>

<% if (remarks !== "") { %>
#### Remarks

<%= remarks %>

<% } %>
