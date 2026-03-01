---
name: notion
description: Search, read, create, and update pages and databases in Notion. Use this skill to find pages by title or content, read page content, create new pages, append content to existing pages, query databases, add database entries, update page properties, and read or post comments. All operations require the user to have connected their Notion workspace via OAuth.
allowed-tools: Bash(curl:*)
---

# Notion API Skill

## Auth & Conventions

All requests require two headers:
- `Authorization: Bearer $BEARER_TOKEN`
- `Notion-Version: 2022-06-28`

Use `tool_bash` with `required_provider_auth='notion'` to inject `$BEARER_TOKEN`.

**Base URL:** `https://api.notion.com/v1`

**Rate limit:** 3 requests per second. If you receive a 429, wait briefly and retry.

**Pagination:** Paginated endpoints return `has_more` (bool) and `next_cursor` (string). Pass `start_cursor` in the next request body to fetch additional pages. Default page size is 10; max is 100 — set `page_size: 100` for efficiency.

**IDs:** All Notion IDs are UUIDs. They appear in URLs as 32-char hex strings (no dashes). The API accepts both formats.

---

## 1. Search

The most useful starting point. Searches all pages and databases the integration has access to by title.

```bash
# Search by title keyword
curl -s -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  "https://api.notion.com/v1/search" \
  -d '{
    "query": "roadmap",
    "page_size": 20
  }'
```

**Filter to pages only:**
```bash
curl -s -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  "https://api.notion.com/v1/search" \
  -d '{
    "query": "roadmap",
    "filter": { "value": "page", "property": "object" },
    "sort": { "direction": "descending", "timestamp": "last_edited_time" },
    "page_size": 20
  }'
```

**Filter to databases only:**
```bash
curl -s -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  "https://api.notion.com/v1/search" \
  -d '{
    "filter": { "value": "database", "property": "object" },
    "page_size": 20
  }'
```

**Response fields to note:**
- `results[].id` — page or database ID for subsequent calls
- `results[].object` — `"page"` or `"database"`
- `results[].url` — canonical Notion URL
- `results[].properties.title` — page title (pages)
- `results[].title` — database title (databases)
- `has_more` / `next_cursor` — pagination

**Limitations:** Only matches page/database titles, not body content. Results are limited to items explicitly shared with the integration.

---

## 2. Read Page Content

Page content is a tree of blocks. Retrieve the top-level children first, then recurse into any block where `has_children: true`.

### Get top-level blocks of a page
```bash
curl -s -G \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Notion-Version: 2022-06-28" \
  --data-urlencode "page_size=100" \
  "https://api.notion.com/v1/blocks/{PAGE_ID}/children"
```

**Response structure:**
```
results[]
  .id           — block ID (use for nested reads or appending after)
  .type         — "paragraph", "heading_1", "bulleted_list_item", "to_do", "code", "image", etc.
  .has_children — true if this block has nested children
  .[type]       — type-specific object, usually containing rich_text[]
```

### Extract text from rich_text blocks
Each block contains a `rich_text` array. Text content is at `rich_text[].plain_text`.

```bash
# Fetch and extract plain text with python
curl -s -G \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Notion-Version: 2022-06-28" \
  --data-urlencode "page_size=100" \
  "https://api.notion.com/v1/blocks/{PAGE_ID}/children" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for block in data['results']:
    btype = block['type']
    rich = block.get(btype, {}).get('rich_text', [])
    text = ''.join(r['plain_text'] for r in rich)
    if text:
        print(f'[{btype}] {text}')
"
```

### Read nested children (recurse when has_children is true)
```bash
curl -s -G \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Notion-Version: 2022-06-28" \
  --data-urlencode "page_size=100" \
  "https://api.notion.com/v1/blocks/{BLOCK_ID}/children"
```

### Get page metadata (title, properties, last edited)
```bash
curl -s \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Notion-Version: 2022-06-28" \
  "https://api.notion.com/v1/pages/{PAGE_ID}"
```

### Read page as markdown (public integrations only)
```bash
curl -s \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Notion-Version: 2022-06-28" \
  "https://api.notion.com/v1/pages/{PAGE_ID}/markdown"
```

---

## 3. Create a Page

Pages can be created inside another page (as a child) or inside a database (as a new row).

### Create a page inside another page
```bash
curl -s -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  "https://api.notion.com/v1/pages" \
  -d '{
    "parent": { "type": "page_id", "page_id": "{PARENT_PAGE_ID}" },
    "properties": {
      "title": {
        "title": [{ "type": "text", "text": { "content": "My New Page" } }]
      }
    },
    "children": [
      {
        "object": "block",
        "type": "heading_1",
        "heading_1": {
          "rich_text": [{ "type": "text", "text": { "content": "Introduction" } }]
        }
      },
      {
        "object": "block",
        "type": "paragraph",
        "paragraph": {
          "rich_text": [{ "type": "text", "text": { "content": "Page body goes here." } }]
        }
      }
    ]
  }'
```

### Create from markdown (public integrations only)
```bash
curl -s -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  "https://api.notion.com/v1/pages" \
  -d '{
    "parent": { "type": "page_id", "page_id": "{PARENT_PAGE_ID}" },
    "markdown": "# My Page\n\nThis is the **body** of the page.\n\n- Item one\n- Item two"
  }'
```

The first H1 heading becomes the page title automatically.

---

## 4. Append Content to an Existing Page

Use `PATCH /v1/blocks/{block_id}/children` to append blocks at the end of a page or after a specific block.

### Append blocks to end of page
```bash
curl -s -X PATCH \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  "https://api.notion.com/v1/blocks/{PAGE_ID}/children" \
  -d '{
    "children": [
      {
        "object": "block",
        "type": "heading_2",
        "heading_2": {
          "rich_text": [{ "type": "text", "text": { "content": "New Section" } }]
        }
      },
      {
        "object": "block",
        "type": "paragraph",
        "paragraph": {
          "rich_text": [{ "type": "text", "text": { "content": "New content here." } }]
        }
      },
      {
        "object": "block",
        "type": "bulleted_list_item",
        "bulleted_list_item": {
          "rich_text": [{ "type": "text", "text": { "content": "First bullet" } }]
        }
      }
    ]
  }'
```

### Append after a specific block (insert in the middle)
Add `"after": "{BLOCK_ID}"` to the request body to insert after a specific block rather than at the end.

### Append markdown content (public integrations only)
```bash
curl -s -X PATCH \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  "https://api.notion.com/v1/pages/{PAGE_ID}/markdown" \
  -d '{
    "commands": [
      {
        "type": "insert_content",
        "position": "end",
        "markdown": "## New Section\n\nAppended content."
      }
    ]
  }'
```

---

## 5. Block Types Reference

Use these in `children` arrays when creating or appending content.

```json
// Paragraph
{ "type": "paragraph", "paragraph": { "rich_text": [{ "type": "text", "text": { "content": "..." } }] } }

// Headings (heading_1, heading_2, heading_3)
{ "type": "heading_1", "heading_1": { "rich_text": [{ "type": "text", "text": { "content": "..." } }] } }

// Bulleted list item
{ "type": "bulleted_list_item", "bulleted_list_item": { "rich_text": [{ "type": "text", "text": { "content": "..." } }] } }

// Numbered list item
{ "type": "numbered_list_item", "numbered_list_item": { "rich_text": [{ "type": "text", "text": { "content": "..." } }] } }

// To-do checkbox
{ "type": "to_do", "to_do": { "rich_text": [{ "type": "text", "text": { "content": "..." } }], "checked": false } }

// Code block
{ "type": "code", "code": { "rich_text": [{ "type": "text", "text": { "content": "print('hello')" } }], "language": "python" } }

// Quote
{ "type": "quote", "quote": { "rich_text": [{ "type": "text", "text": { "content": "..." } }] } }

// Callout
{ "type": "callout", "callout": { "rich_text": [{ "type": "text", "text": { "content": "..." } }], "icon": { "emoji": "💡" } } }

// Divider
{ "type": "divider", "divider": {} }
```

**Rich text with formatting:**
```json
{ "type": "text", "text": { "content": "bold text" }, "annotations": { "bold": true } }
{ "type": "text", "text": { "content": "linked text", "link": { "url": "https://..." } } }
```

---

## 6. Databases

### Query a database (list all entries)
```bash
curl -s -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  "https://api.notion.com/v1/databases/{DATABASE_ID}/query" \
  -d '{ "page_size": 100 }'
```

### Query with filter and sort
```bash
curl -s -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  "https://api.notion.com/v1/databases/{DATABASE_ID}/query" \
  -d '{
    "filter": {
      "property": "Status",
      "select": { "equals": "In Progress" }
    },
    "sorts": [
      { "property": "Last edited time", "direction": "descending" }
    ],
    "page_size": 100
  }'
```

**Common filter types:**
```json
// Text property
{ "property": "Name", "rich_text": { "contains": "keyword" } }

// Select property
{ "property": "Status", "select": { "equals": "Done" } }

// Checkbox property
{ "property": "Complete", "checkbox": { "equals": true } }

// Date property
{ "property": "Due Date", "date": { "on_or_before": "2026-03-01" } }

// Number property
{ "property": "Priority", "number": { "greater_than": 3 } }
```

### Get database schema (understand property types)
```bash
curl -s \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Notion-Version: 2022-06-28" \
  "https://api.notion.com/v1/databases/{DATABASE_ID}"
```

Response includes `properties` object describing each column's type and configuration.

### Create a database entry (new row)
```bash
curl -s -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  "https://api.notion.com/v1/pages" \
  -d '{
    "parent": { "database_id": "{DATABASE_ID}" },
    "properties": {
      "Name": {
        "title": [{ "text": { "content": "New Task" } }]
      },
      "Status": {
        "select": { "name": "In Progress" }
      },
      "Due Date": {
        "date": { "start": "2026-03-15" }
      }
    }
  }'
```

### Update page properties (edit an existing entry)
```bash
curl -s -X PATCH \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  "https://api.notion.com/v1/pages/{PAGE_ID}" \
  -d '{
    "properties": {
      "Status": {
        "select": { "name": "Done" }
      }
    }
  }'
```

**Property value shapes by type:**
```json
// Title
"Name": { "title": [{ "text": { "content": "..." } }] }

// Rich text (multi-line text column)
"Notes": { "rich_text": [{ "text": { "content": "..." } }] }

// Select
"Status": { "select": { "name": "In Progress" } }

// Multi-select
"Tags": { "multi_select": [{ "name": "Bug" }, { "name": "Frontend" }] }

// Date
"Due Date": { "date": { "start": "2026-03-15" } }

// Checkbox
"Complete": { "checkbox": true }

// Number
"Priority": { "number": 3 }

// URL
"Link": { "url": "https://..." }
```

---

## 7. Comments

### Read comments on a page
```bash
curl -s -G \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Notion-Version: 2022-06-28" \
  --data-urlencode "block_id={PAGE_ID}" \
  --data-urlencode "page_size=100" \
  "https://api.notion.com/v1/comments"
```

Response includes `discussion_id` — use this to reply to an existing thread.

### Add a top-level comment to a page
```bash
curl -s -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  "https://api.notion.com/v1/comments" \
  -d '{
    "parent": { "page_id": "{PAGE_ID}" },
    "rich_text": [{ "type": "text", "text": { "content": "Comment text here." } }]
  }'
```

### Reply to an existing discussion thread
```bash
curl -s -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  "https://api.notion.com/v1/comments" \
  -d '{
    "discussion_id": "{DISCUSSION_ID}",
    "rich_text": [{ "type": "text", "text": { "content": "Reply text here." } }]
  }'
```

**Note:** You can reply to existing inline comment threads, but you cannot start a new inline discussion via the API.

---

## 8. Common Workflows

### Workflow: Find a page and read its full content
```bash
# Step 1 — search for the page
curl -s -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  "https://api.notion.com/v1/search" \
  -d '{ "query": "Q1 Roadmap", "filter": { "value": "page", "property": "object" } }' \
  | python3 -c "
import sys, json
results = json.load(sys.stdin)['results']
for r in results:
    title = r.get('properties', {}).get('title', {}).get('title', [{}])
    print(r['id'], ''.join(t.get('plain_text','') for t in title))
"

# Step 2 — read its blocks (replace PAGE_ID with result from step 1)
curl -s -G \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Notion-Version: 2022-06-28" \
  --data-urlencode "page_size=100" \
  "https://api.notion.com/v1/blocks/{PAGE_ID}/children" \
  | python3 -c "
import sys, json
data = json.load(sys.stdin)
for block in data['results']:
    btype = block['type']
    rich = block.get(btype, {}).get('rich_text', [])
    text = ''.join(r['plain_text'] for r in rich)
    if text:
        print(f'[{btype}] {text}')
    if block['has_children']:
        print(f'  (has nested children — fetch block {block[\"id\"]} to read them)')
"
```

### Workflow: Add a new entry to a database
```bash
# Step 1 — find the database
curl -s -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  "https://api.notion.com/v1/search" \
  -d '{ "query": "Tasks", "filter": { "value": "database", "property": "object" } }'

# Step 2 — inspect the schema to understand property names and types
curl -s \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Notion-Version: 2022-06-28" \
  "https://api.notion.com/v1/databases/{DATABASE_ID}"

# Step 3 — create the entry using the correct property names from the schema
curl -s -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Notion-Version: 2022-06-22" \
  -H "Content-Type: application/json" \
  "https://api.notion.com/v1/pages" \
  -d '{
    "parent": { "database_id": "{DATABASE_ID}" },
    "properties": {
      "Name": { "title": [{ "text": { "content": "New entry title" } }] }
    }
  }'
```

---

## Known Gotchas

**Always fetch the database schema before writing.** Property names are user-defined and case-sensitive. `"status"` and `"Status"` are different properties. Inspect the schema first with `GET /v1/databases/{id}`.

**Search only matches titles.** The search endpoint does not scan page body content — only page and database names. If you need to find content within a page, you must read the page blocks directly.

**`has_children` requires a second API call.** Notion's block API is not recursive. When a block has `has_children: true`, you must explicitly fetch `GET /v1/blocks/{block_id}/children` to get the nested content.

**Markdown read endpoint is public-integration-only.** `GET /v1/pages/{id}/markdown` only works for public OAuth integrations, which this app uses. Internal integrations cannot access this endpoint.

**Rich text array limit.** Arrays in rich text fields are capped at 100 items. Chunking long text across multiple blocks is required for large content.

**Page size default is 10.** Always set `"page_size": 100` explicitly to avoid missing results on any paginated endpoint.
