---
name: notion
description: >
  Search, read, create, and update pages and databases in Notion. Use when
  finding pages by title, reading page content, creating new pages, querying
  databases, adding entries, or updating page properties.
allowed-tools: Bash(curl:*)
---

# Notion API Skill

## Authentication

All requests require two headers:
- `Authorization: Bearer $BEARER_TOKEN`
- `Notion-Version: 2022-06-28`

`BEARER_TOKEN` is pre-injected into the environment.

**Base URL:** `https://api.notion.com/v1`

**Rate limit:** 3 requests per second. If you receive a 429, wait briefly and retry.

**Always check write responses.** Never discard responses from POST/PATCH. Use `curl -s -w "\nHTTP_STATUS:%{http_code}"` and verify status is `200`.

---

## 1. Search

The most useful starting point. Searches page and database titles.

```bash
# Search by title keyword
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

# Search databases only
curl -s -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  "https://api.notion.com/v1/search" \
  -d '{"filter": {"value": "database", "property": "object"}, "page_size": 20}'
```

**Note:** Search only matches titles, not page body content.

---

## 2. Read Page Content

Page content is a tree of blocks. Retrieve top-level children first, then recurse into blocks where `has_children: true`.

```bash
# Get page blocks + extract plain text
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
    if block['has_children']:
        print(f'  (has nested children — fetch /blocks/{block[\"id\"]}/children)')
"
```

---

## 3. Create a Page

```bash
# Create page inside another page
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
        "heading_1": { "rich_text": [{ "type": "text", "text": { "content": "Introduction" } }] }
      },
      {
        "object": "block",
        "type": "paragraph",
        "paragraph": { "rich_text": [{ "type": "text", "text": { "content": "Body here." } }] }
      }
    ]
  }'

# Create from markdown (public OAuth integrations only)
curl -s -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  "https://api.notion.com/v1/pages" \
  -d '{
    "parent": { "type": "page_id", "page_id": "{PARENT_PAGE_ID}" },
    "markdown": "# My Page\n\nThis is the **body**.\n\n- Item one\n- Item two"
  }'
```

---

## 4. Append Content to a Page

```bash
# Append to end of page
curl -s -X PATCH \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  "https://api.notion.com/v1/blocks/{PAGE_ID}/children" \
  -d '{
    "children": [
      {
        "object": "block",
        "type": "paragraph",
        "paragraph": { "rich_text": [{ "type": "text", "text": { "content": "New content." } }] }
      }
    ]
  }'
```

**Common mistake:** `PATCH /blocks/{BLOCK_ID}/children` adds content as a *nested child* of that block. Always use the PAGE_ID in the URL to append at the page level.

---

## 5. Block Types Reference

```json
// Paragraph
{ "type": "paragraph", "paragraph": { "rich_text": [{ "type": "text", "text": { "content": "..." } }] } }

// Headings
{ "type": "heading_1", "heading_1": { "rich_text": [{ "type": "text", "text": { "content": "..." } }] } }

// Bulleted list item
{ "type": "bulleted_list_item", "bulleted_list_item": { "rich_text": [{ "type": "text", "text": { "content": "..." } }] } }

// Numbered list item
{ "type": "numbered_list_item", "numbered_list_item": { "rich_text": [{ "type": "text", "text": { "content": "..." } }] } }

// Divider
{ "type": "divider", "divider": {} }

// Callout
{ "type": "callout", "callout": { "rich_text": [{ "type": "text", "text": { "content": "..." } }], "icon": { "emoji": "💡" } } }
```

---

## 6. Databases

```bash
# Query all entries
curl -s -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  "https://api.notion.com/v1/databases/{DATABASE_ID}/query" \
  -d '{ "page_size": 100 }'

# Query with filter and sort
curl -s -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  "https://api.notion.com/v1/databases/{DATABASE_ID}/query" \
  -d '{
    "filter": { "property": "Status", "select": { "equals": "In Progress" } },
    "sorts": [{ "property": "Last edited time", "direction": "descending" }],
    "page_size": 100
  }'

# Get database schema (understand property names and types)
curl -s \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Notion-Version: 2022-06-28" \
  "https://api.notion.com/v1/databases/{DATABASE_ID}"

# Create a database entry
curl -s -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Notion-Version: 2022-06-28" \
  -H "Content-Type: application/json" \
  "https://api.notion.com/v1/pages" \
  -d '{
    "parent": { "database_id": "{DATABASE_ID}" },
    "properties": {
      "Name": { "title": [{ "text": { "content": "New Entry" } }] },
      "Status": { "select": { "name": "In Progress" } }
    }
  }'
```

**Always fetch the database schema before writing** — property names are case-sensitive and user-defined.

---

## Known Gotchas

- **Search only matches titles.** To find content within a page, read the page blocks directly.
- **`has_children` requires a second API call.** When `has_children: true`, fetch `/blocks/{block_id}/children` explicitly.
- **Always set `page_size: 100`** — default is 10.
- **Property names are case-sensitive.** `"status"` ≠ `"Status"`. Check the schema first.
