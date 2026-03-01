---
name: google-docs
description: Create, read, and edit Google Docs via the Google Docs REST API using cURL. Use when creating new documents, reading document content, making structured edits (insert/delete text, format, tables, lists, find-and-replace, named ranges), or managing documents in Drive folders. If you need to locate a file in Drive for any reason — by name, content, type, date, owner, or any other criteria — use the google-drive skill first to get the file ID.
---

# Google Docs API Skill

> **Don't have a document ID?** Use the **google-drive** skill to locate the file first. The Docs API requires a document ID for all operations — you cannot look up files directly. The google-drive skill can search by name, file content, type, date, owner, folder, and more.

## Auth & Conventions

All requests require a Bearer token injected as `$BEARER_TOKEN`. Use `tool_bash` with `required_provider_auth='google'`.

**Base URLs:**
- Docs API: `https://docs.googleapis.com/v1/documents`
- Drive API (copy/move): `https://www.googleapis.com/drive/v3/files`

**GET requests** — use `-G --data-urlencode` so parameters are sent as query string:
```bash
curl -s -G --compressed \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Accept-Encoding: gzip" \
  -H "User-Agent: agent (gzip)" \
  --data-urlencode "fields=FIELDS" \
  "https://docs.googleapis.com/v1/documents/{DOC_ID}"
```

**POST requests** — use `-X POST` with a JSON body:
```bash
curl -s -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  "https://docs.googleapis.com/v1/documents/{DOC_ID}:batchUpdate" \
  -d '{ "requests": [...] }'
```

**When you need to fetch JSON and then process it, use one of these patterns in a single tool_bash call:**

Pattern A — pipe curl directly to python3 in one command:
```bash
curl -s -G --compressed \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Accept-Encoding: gzip" \
  -H "User-Agent: agent (gzip)" \
  --data-urlencode "fields=documentId,revisionId,body(content(startIndex,endIndex,paragraph(elements(textRun(content)))))" \
  "https://docs.googleapis.com/v1/documents/{DOC_ID}" | python3 -c "
import sys, json
doc = json.load(sys.stdin)
# process doc here and print what you need
print(doc['revisionId'])
"
```

Pattern B — use subprocess inside Python when you need the Bearer token from the environment or multi-step logic:
```bash
python3 - <<'PY'
import json, os, subprocess, sys

raw = subprocess.check_output([
  'curl', '-s', '-G', '--compressed',
  '-H', f'Authorization: Bearer {os.environ["BEARER_TOKEN"]}',
  '-H', 'Accept-Encoding: gzip',
  '-H', 'User-Agent: agent (gzip)',
  '--data-urlencode', 'fields=documentId,revisionId,body(content(startIndex,endIndex,paragraph(elements(textRun(content)))))',
  'https://docs.googleapis.com/v1/documents/{DOC_ID}'
], text=True)
doc = json.loads(raw)

# Always check for API errors before accessing fields.
# Any bad field mask, auth issue, or API error returns {"error": {...}} with no document fields.
if 'error' in doc:
    print(f"API error {doc['error']['code']}: {doc['error']['message']}", file=sys.stderr)
    print(f"Raw response: {raw}", file=sys.stderr)
    sys.exit(1)

# process and print results
print(doc['revisionId'])
PY
```

---

## Performance Rules (always follow)

1. **Always use `fields=`** on every GET request — never fetch the full document resource.
2. **Batch all edits** into a single `batchUpdate` call — never send multiple sequential batchUpdate requests when one will do.
3. **Edit in descending index order** within a batch — insert/delete at the highest index first so earlier indexes remain stable.
4. **Use gzip on reads** — always pass `--compressed` alongside the gzip headers so curl decompresses the response automatically. Without `--compressed`, the raw binary gzip bytes are returned and cannot be parsed as JSON.
5. **Use `writeControl`** on collaborative documents to guard against concurrent edits (see WriteControl section).
6. **Use legacy mode by default** — do not use `includeTabsContent=true` unless the document has multiple tabs or you need to target a specific tab. Legacy mode (`document.body`) is simpler, has fewer failure points, and works correctly for the vast majority of documents. See section 5 for when and how to use tabs.

---

## 1. Read a Document

Fetch only what you need. The full document body can be large — use `fields` aggressively.

### Minimal read (title + revision only)
```bash
curl -s -G --compressed \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Accept-Encoding: gzip" \
  -H "User-Agent: agent (gzip)" \
  --data-urlencode "fields=documentId,title,revisionId" \
  "https://docs.googleapis.com/v1/documents/{DOC_ID}"
```

### Style analysis read (do this before inserting any formatted content)
Before writing anything, fetch the document's paragraph styles and text content so you understand its conventions. This is a compact read — it skips textStyle, character-level indexes, and non-paragraph elements.

```bash
curl -s -G --compressed \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Accept-Encoding: gzip" \
  -H "User-Agent: agent (gzip)" \
  --data-urlencode "fields=documentId,title,revisionId,body(content(startIndex,endIndex,paragraph(paragraphStyle(namedStyleType),elements(textRun(content)))))" \
  "https://docs.googleapis.com/v1/documents/{DOC_ID}"
```

From the response, build a mental map of what `namedStyleType` the document uses for each content level — e.g. which style is used for section headers, which for subheadings, which for body paragraphs. Use those observed styles when inserting new content. See the style guidance in section 3a.

**Response structure (legacy mode):**
```
document.body.content[]     — array of structural elements
  .startIndex / .endIndex   — paragraph boundaries (reuse for batchUpdate)
  .paragraph.paragraphStyle.namedStyleType  — e.g. HEADING_1, HEADING_2, NORMAL_TEXT
  .paragraph.elements[].textRun.content     — paragraph text (to identify sections)
document.revisionId         — capture this for writeControl
```

### Read document body with character-level indexes
Use this when you need exact element-level `startIndex`/`endIndex` for targeted insertions or deletions within a paragraph.
```bash
curl -s -G --compressed \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Accept-Encoding: gzip" \
  -H "User-Agent: agent (gzip)" \
  --data-urlencode "fields=documentId,title,revisionId,body(content(startIndex,endIndex,paragraph(paragraphStyle(namedStyleType),elements(startIndex,endIndex,textRun(content)))))" \
  "https://docs.googleapis.com/v1/documents/{DOC_ID}"
```

### Read named ranges
```bash
curl -s -G --compressed \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Accept-Encoding: gzip" \
  -H "User-Agent: agent (gzip)" \
  --data-urlencode "fields=documentId,title,revisionId,namedRanges" \
  "https://docs.googleapis.com/v1/documents/{DOC_ID}"
```

### Field mask syntax reference
- Comma-separated: `title,revisionId`
- Nested: `body(content(paragraph(elements(textRun(content)))))`
- Multiple subfields from same type: `body(content,headers,footers)`
- Avoid `*` wildcard — it fetches everything and may break on API updates.
- **No spaces allowed in field masks.** A space anywhere in the mask (e.g. `content)) )`) makes the mask invalid and the API returns an error with no document fields. Always verify your parentheses are balanced and space-free before sending.

### Suggestions view mode (optional)
Append to GET URL to control how tracked changes appear:
- `suggestionsViewMode=SUGGESTIONS_INLINE` — shows pending inserts/deletes (use this when you need correct indexes for batchUpdate)
- `suggestionsViewMode=PREVIEW_WITH_SUGGESTIONS_ACCEPTED` — preview with all suggestions accepted
- `suggestionsViewMode=PREVIEW_WITHOUT_SUGGESTIONS` — preview with all suggestions rejected

```bash
curl -s -G --compressed \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Accept-Encoding: gzip" \
  -H "User-Agent: agent (gzip)" \
  --data-urlencode "suggestionsViewMode=SUGGESTIONS_INLINE" \
  --data-urlencode "fields=documentId,revisionId,body(content(startIndex,endIndex,paragraph(elements(startIndex,endIndex,textRun(content)))))" \
  "https://docs.googleapis.com/v1/documents/{DOC_ID}"
```

---

## 2. Create a Document

### Create a blank document
Creates in the user's Drive root. Returns the new document's `documentId`.
```bash
curl -s -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  "https://docs.googleapis.com/v1/documents" \
  -d '{"title": "My New Document"}'
```

**Response:** Full Document resource including `documentId`, `title`, `revisionId`.

### Copy an existing document (Drive API)
Use this to create a document from a template. Returns the new file's `id` (same as `documentId`).
```bash
curl -s -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  "https://www.googleapis.com/drive/v3/files/{SOURCE_DOC_ID}/copy" \
  -d '{"name": "New Document Title"}'
```

**Note:** Cannot copy published documents. After copying, use `batchUpdate` with `replaceAllText` to fill in template placeholders.

---

## 3. Folder Operations (Drive API)

The Docs API always creates documents in the user's Drive root — there is no way to specify a destination folder at creation time via the Docs API. Use the Drive API to create folders and move files.

### Create a folder
```bash
curl -s -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  "https://www.googleapis.com/drive/v3/files?fields=id,name" \
  -d '{
    "name": "My Folder",
    "mimeType": "application/vnd.google-apps.folder"
  }'
```
**Response:** `{ "id": "FOLDER_ID", "name": "My Folder" }`

### Create a document directly inside a folder
Use the Drive API `files.create` with `parents` instead of the Docs API `documents.create`. This is preferred over creating then moving when the destination folder is known upfront.
```bash
curl -s -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  "https://www.googleapis.com/drive/v3/files?fields=id,name,parents" \
  -d '{
    "name": "My Document",
    "mimeType": "application/vnd.google-apps.document",
    "parents": ["FOLDER_ID"]
  }'
```
**Response:** `{ "id": "DOC_ID", "name": "My Document", "parents": ["FOLDER_ID"] }`

The returned `id` is the `documentId` used in all subsequent Docs API calls.

**Constraint:** A file can only have one parent folder. Specifying multiple parents is not supported.

### Move an existing document to a folder
Moving requires two steps: first get the current parent, then update with `addParents` and `removeParents`.

**Step 1 — get the current parent:**
```bash
curl -s -G \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  --data-urlencode "fields=parents" \
  "https://www.googleapis.com/drive/v3/files/{DOC_ID}"
```
**Response:** `{ "parents": ["CURRENT_PARENT_ID"] }`

**Step 2 — move to the new folder:**
```bash
curl -s -X PATCH \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  "https://www.googleapis.com/drive/v3/files/{DOC_ID}?addParents={DESTINATION_FOLDER_ID}&removeParents={CURRENT_PARENT_ID}&fields=id,parents"
```
**Response:** `{ "id": "DOC_ID", "parents": ["DESTINATION_FOLDER_ID"] }`

**Notes:**
- `removeParents` must include the current parent, otherwise the file ends up in both locations.
- If `CURRENT_PARENT_ID` is the Drive root, it will appear as `"root"` in the response but must be passed as its actual folder ID. Re-read with `fields=parents` to get the real ID.
- Folder nesting limit: 100 levels deep. Folders support up to 500,000 items (excluding root).

### Workflow: create a doc and immediately place it in a folder
```bash
# Step 1 — create doc directly in folder via Drive API
DOC_ID=$(curl -s -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  "https://www.googleapis.com/drive/v3/files?fields=id" \
  -d '{
    "name": "Q1 Roadmap",
    "mimeType": "application/vnd.google-apps.document",
    "parents": ["FOLDER_ID"]
  }' | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

# Step 2 — populate the document via Docs API batchUpdate
curl -s -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  "https://docs.googleapis.com/v1/documents/$DOC_ID:batchUpdate" \
  -d '{
    "requests": [
      {
        "insertText": {
          "location": { "index": 1 },
          "text": "Q1 2026 Roadmap\n"
        }
      },
      {
        "updateParagraphStyle": {
          "range": { "startIndex": 1, "endIndex": 16 },
          "paragraphStyle": { "namedStyleType": "HEADING_1" },
          "fields": "namedStyleType"
        }
      }
    ]
  }'
```

---

## 4. batchUpdate — All Edits

All document edits go through `batchUpdate`. Combine as many requests as needed into one call.

**Endpoint:**
```
POST https://docs.googleapis.com/v1/documents/{DOC_ID}:batchUpdate
```

**Envelope:**
```json
{
  "requests": [
    { /* request 1 */ },
    { /* request 2 */ }
  ],
  "writeControl": {
    "requiredRevisionId": "REVISION_ID"
  }
}
```

- `requests` are processed in order — top to bottom.
- If any request is invalid, the entire batch fails and no changes are applied.
- Each batch counts as one API request toward usage limits.
- `writeControl` is optional but recommended for collaborative documents (see WriteControl section).

---

### 3a. Insert Text

Inserts text at a specific index. All indexes are measured in UTF-16 code units.

```bash
curl -s -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  "https://docs.googleapis.com/v1/documents/{DOC_ID}:batchUpdate" \
  -d '{
    "requests": [
      {
        "insertText": {
          "location": {
            "index": 1,
            "tabId": "TAB_ID"
          },
          "text": "Hello, world!\n"
        }
      }
    ]
  }'
```

**Tips:**
- Index `1` is the start of the document body (index `0` is reserved).
- Use `\n` to insert paragraph breaks.
- To append to end of document, first read the document to find the last content index, then insert there.
- When batching multiple inserts, order them from highest index to lowest so earlier indexes stay stable.

**Google Docs does not use markdown — critical:** Text inserted via `insertText` is plain text only. Markdown syntax has no effect and renders as literal characters:
- `**bold**` → displays as `**bold**` with asterisks visible
- `### Heading` → displays as `### Heading` with hash marks visible
- `- item` → displays as a literal hyphen, not a bullet

To apply formatting, use separate requests in the same batchUpdate: `updateTextStyle` for character formatting (bold, italic, font, color) and `updateParagraphStyle` for paragraph-level styling (headings, normal text, spacing). See sections 3e and 3f.

**Paragraph style inheritance — important:** New paragraphs created by inserting `\n` inherit the paragraph style of the paragraph they are inserted into or adjacent to. Do not rely on this — always be explicit about the style you want.

**Match the document's style conventions:** Do the style analysis read (section 1) before inserting content. From the response, identify what `namedStyleType` each content level uses — section headers, subheadings, body text, etc. Apply those same styles to your insertions so new content blends with the existing document.

If the document doesn't have a clear precedent for a content type, use semantic judgment: apply the style that fits the content's role — headings for titles and section labels, `NORMAL_TEXT` for body paragraphs, list styles for enumerated items. Prefer matching existing patterns over introducing new ones.

Do not apply character-level bold or italic to entire paragraphs as a substitute for paragraph styles. If something should look like a heading, make it a heading with `namedStyleType` — not a bolded `NORMAL_TEXT` paragraph.

Always include an `updateParagraphStyle` in the same batchUpdate as your `insertText`. The range must cover the full span of inserted text — calculate `endIndex = insert_index + len(inserted_text)`.

```bash
# Insert text AND explicitly set its paragraph style in one batchUpdate
curl -s -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  "https://docs.googleapis.com/v1/documents/{DOC_ID}:batchUpdate" \
  -d '{
    "requests": [
      {
        "insertText": {
          "location": { "index": 50 },
          "text": "First paragraph.\nSecond paragraph.\n"
        }
      },
      {
        "updateParagraphStyle": {
          "range": { "startIndex": 50, "endIndex": 86 },
          "paragraphStyle": { "namedStyleType": "NORMAL_TEXT" },
          "fields": "namedStyleType"
        }
      }
    ]
  }'
```

---

### 3b. Delete Text

Removes all content within a range (inclusive of startIndex, exclusive of endIndex).

```bash
curl -s -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  "https://docs.googleapis.com/v1/documents/{DOC_ID}:batchUpdate" \
  -d '{
    "requests": [
      {
        "deleteContentRange": {
          "range": {
            "startIndex": 10,
            "endIndex": 24,
            "tabId": "TAB_ID"
          }
        }
      }
    ]
  }'
```

---

### 3c. Move Text

No direct move operation exists. Implement as a batch with delete + insert, ordered high-to-low:

```bash
curl -s -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  "https://docs.googleapis.com/v1/documents/{DOC_ID}:batchUpdate" \
  -d '{
    "requests": [
      {
        "insertText": {
          "location": { "index": 50, "tabId": "TAB_ID" },
          "text": "Moved text here.\n"
        }
      },
      {
        "deleteContentRange": {
          "range": { "startIndex": 10, "endIndex": 27, "tabId": "TAB_ID" }
        }
      }
    ]
  }'
```

**Important:** Insert at the destination first (higher index), then delete from the source (lower index) — this keeps all indexes consistent within a single batch.

---

### 3d. Find & Replace Text (Merge / Templates)

Replaces all occurrences of a placeholder string across the document. Ideal for mail merge and template filling.

```bash
curl -s -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  "https://docs.googleapis.com/v1/documents/{DOC_ID}:batchUpdate" \
  -d '{
    "requests": [
      {
        "replaceAllText": {
          "containsText": {
            "text": "{{customer_name}}",
            "matchCase": true
          },
          "replaceText": "Acme Corp"
        }
      },
      {
        "replaceAllText": {
          "containsText": {
            "text": "{{date}}",
            "matchCase": true
          },
          "replaceText": "2026-02-28"
        }
      }
    ]
  }'
```

**Notes:**
- By default, `replaceAllText` applies across all tabs. To limit to specific tabs:
  ```json
  "tabsCriteria": { "tabIds": ["TAB_ID_1", "TAB_ID_2"] }
  ```
- Multiple replacements can be batched in one call.
- Existing formatting around the placeholder is preserved.
- Recommended pattern: copy a template doc first (`files.copy`), then fill placeholders on the copy.

---

### 3e. Format Text (Character Style)

Changes font, size, color, bold, italic, or hyperlink on a text range.

```bash
curl -s -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  "https://docs.googleapis.com/v1/documents/{DOC_ID}:batchUpdate" \
  -d '{
    "requests": [
      {
        "updateTextStyle": {
          "range": {
            "startIndex": 5,
            "endIndex": 20,
            "tabId": "TAB_ID"
          },
          "textStyle": {
            "bold": true,
            "italic": false,
            "weightedFontFamily": { "fontFamily": "Georgia" },
            "fontSize": { "magnitude": 14, "unit": "PT" },
            "foregroundColor": {
              "color": {
                "rgbColor": { "red": 0.2, "green": 0.4, "blue": 0.8 }
              }
            }
          },
          "fields": "bold,italic,weightedFontFamily,fontSize,foregroundColor"
        }
      }
    ]
  }'
```

**Important:** The `fields` property is required and must list every style property you are setting. Unlisted properties are left unchanged.

**Adding a hyperlink:**
```json
{
  "updateTextStyle": {
    "range": { "startIndex": 5, "endIndex": 20, "tabId": "TAB_ID" },
    "textStyle": {
      "link": { "url": "https://example.com" }
    },
    "fields": "link"
  }
}
```

---

### 3f. Format Paragraphs (Paragraph Style)

Changes heading level, alignment, spacing, or borders on a paragraph range.

```bash
curl -s -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  "https://docs.googleapis.com/v1/documents/{DOC_ID}:batchUpdate" \
  -d '{
    "requests": [
      {
        "updateParagraphStyle": {
          "range": {
            "startIndex": 1,
            "endIndex": 15,
            "tabId": "TAB_ID"
          },
          "paragraphStyle": {
            "namedStyleType": "HEADING_1",
            "spaceAbove": { "magnitude": 12, "unit": "PT" },
            "spaceBelow": { "magnitude": 6, "unit": "PT" }
          },
          "fields": "namedStyleType,spaceAbove,spaceBelow"
        }
      }
    ]
  }'
```

**`namedStyleType` values:** `NORMAL_TEXT`, `HEADING_1` through `HEADING_6`, `TITLE`, `SUBTITLE`.

---

### 3g. Lists (Bullets & Numbered)

#### Create a bulleted or numbered list
Converts existing paragraphs to a list. The range must cover the paragraphs you want to convert.

```bash
curl -s -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  "https://docs.googleapis.com/v1/documents/{DOC_ID}:batchUpdate" \
  -d '{
    "requests": [
      {
        "createParagraphBullets": {
          "range": {
            "startIndex": 10,
            "endIndex": 50,
            "tabId": "TAB_ID"
          },
          "bulletPreset": "NUMBERED_DECIMAL_ALPHA_ROMAN"
        }
      }
    ]
  }'
```

**`bulletPreset` values:**
- `BULLET_DISC_CIRCLE_SQUARE` — standard unordered list
- `BULLET_ARROW_DIAMOND_DISC` — arrow, diamond, disc nesting
- `NUMBERED_DECIMAL_ALPHA_ROMAN` — 1., a., i. nesting
- `NUMBERED_DECIMAL_NESTED` — 1., 1.1., 1.1.1. nesting

**Nesting:** Nesting level is determined by the number of leading tab characters before each paragraph. To nest a bullet, prepend a `\t` to that paragraph via `insertText` before creating bullets.

#### Remove bullets
```bash
curl -s -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  "https://docs.googleapis.com/v1/documents/{DOC_ID}:batchUpdate" \
  -d '{
    "requests": [
      {
        "deleteParagraphBullets": {
          "range": {
            "startIndex": 10,
            "endIndex": 50,
            "tabId": "TAB_ID"
          }
        }
      }
    ]
  }'
```

**Note:** You cannot adjust the nesting level of an existing bullet in place. To change nesting: delete bullets, insert/remove leading tabs, then recreate bullets.

---

### 3h. Tables

#### Insert a table
```bash
curl -s -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  "https://docs.googleapis.com/v1/documents/{DOC_ID}:batchUpdate" \
  -d '{
    "requests": [
      {
        "insertTable": {
          "rows": 3,
          "columns": 4,
          "endOfSegmentLocation": {
            "segmentId": "",
            "tabId": "TAB_ID"
          }
        }
      }
    ]
  }'
```

**Notes:**
- Use `endOfSegmentLocation` with empty `segmentId` to insert at the end of the document body.
- To insert at a specific index instead, replace `endOfSegmentLocation` with `"location": { "index": N, "tabId": "TAB_ID" }`.

#### Delete a table
First read the document to find the table's `startIndex` and `endIndex`, then:
```bash
curl -s -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  "https://docs.googleapis.com/v1/documents/{DOC_ID}:batchUpdate" \
  -d '{
    "requests": [
      {
        "deleteContentRange": {
          "range": {
            "startIndex": TABLE_START_INDEX,
            "endIndex": TABLE_END_INDEX,
            "tabId": "TAB_ID"
          }
        }
      }
    ]
  }'
```

#### Insert a row
```bash
{
  "insertTableRow": {
    "tableCellLocation": {
      "tableStartLocation": { "index": TABLE_START_INDEX, "tabId": "TAB_ID" },
      "rowIndex": 1,
      "columnIndex": 0
    },
    "insertBelow": true
  }
}
```

#### Delete a row
```bash
{
  "deleteTableRow": {
    "tableCellLocation": {
      "tableStartLocation": { "index": TABLE_START_INDEX, "tabId": "TAB_ID" },
      "rowIndex": 2,
      "columnIndex": 0
    }
  }
}
```

#### Insert a column
```bash
{
  "insertTableColumn": {
    "tableCellLocation": {
      "tableStartLocation": { "index": TABLE_START_INDEX, "tabId": "TAB_ID" },
      "rowIndex": 0,
      "columnIndex": 1
    },
    "insertRight": true
  }
}
```

#### Delete a column
```bash
{
  "deleteTableColumn": {
    "tableCellLocation": {
      "tableStartLocation": { "index": TABLE_START_INDEX, "tabId": "TAB_ID" },
      "rowIndex": 0,
      "columnIndex": 1
    }
  }
}
```

#### Write text into a cell
Use `insertText` with the index inside the target cell (read the document first to get cell content indexes):
```bash
{
  "insertText": {
    "location": { "index": CELL_CONTENT_INDEX, "tabId": "TAB_ID" },
    "text": "Cell value"
  }
}
```

#### Set column width
```bash
{
  "updateTableColumnProperties": {
    "tableStartLocation": { "index": TABLE_START_INDEX, "tabId": "TAB_ID" },
    "columnIndices": [0, 1],
    "tableColumnProperties": {
      "widthType": "FIXED_WIDTH",
      "width": { "magnitude": 150, "unit": "PT" }
    },
    "fields": "*"
  }
}
```
Leave `columnIndices` as an empty array `[]` to apply to all columns.

#### Set minimum row height
```bash
{
  "updateTableRowStyle": {
    "tableStartLocation": { "index": TABLE_START_INDEX, "tabId": "TAB_ID" },
    "rowIndices": [],
    "tableRowStyle": {
      "minRowHeight": { "magnitude": 20, "unit": "PT" }
    },
    "fields": "*"
  }
}
```

---

### 3i. Named Ranges

Named ranges mark sections of a document with a stable name. The API automatically updates their indexes as content is added or removed.

**Privacy note:** Named ranges are visible to anyone with API access to the document.

#### Create a named range
```bash
curl -s -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  "https://docs.googleapis.com/v1/documents/{DOC_ID}:batchUpdate" \
  -d '{
    "requests": [
      {
        "createNamedRange": {
          "name": "my-placeholder",
          "range": {
            "startIndex": 10,
            "endIndex": 30,
            "tabId": "TAB_ID"
          }
        }
      }
    ]
  }'
```

#### Read named ranges (GET)
```bash
curl -s -G --compressed \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Accept-Encoding: gzip" \
  -H "User-Agent: agent (gzip)" \
  --data-urlencode "includeTabsContent=true" \
  --data-urlencode "fields=namedRanges" \
  "https://docs.googleapis.com/v1/documents/{DOC_ID}"
```

Response shape:
```json
{
  "namedRanges": {
    "my-placeholder": {
      "namedRanges": [
        {
          "namedRangeId": "...",
          "name": "my-placeholder",
          "ranges": [ { "startIndex": 10, "endIndex": 30, "tabId": "..." } ]
        }
      ]
    }
  }
}
```

#### Replace content of a named range
```bash
{
  "replaceNamedRangeContent": {
    "namedRangeId": "NAMED_RANGE_ID",
    "text": "Replacement text"
  }
}
```

#### Delete a named range (removes the range marker, not the content)
```bash
{
  "deleteNamedRange": {
    "namedRangeId": "NAMED_RANGE_ID"
  }
}
```

**Workflow pattern for templating with named ranges:**
1. Create a template document with named ranges marking each placeholder.
2. Copy the template with `files.copy` (Drive API).
3. Read the copy to get named range IDs.
4. Use `replaceNamedRangeContent` in a single batchUpdate to fill all placeholders.

---

## 5. Tabs

**Use tabs only when:**
- The document has multiple tabs and you need to read or write to a specific one, OR
- The user explicitly asks you to work with a specific tabbed section.

For all other cases, use legacy mode (`document.body`) — it is simpler and avoids unnecessary complexity.

### Step 1 — Check if a document has multiple tabs
Do a minimal read first. If `tabs` has more than one entry, proceed with `includeTabsContent=true`. If it has one entry, use legacy mode instead.

```bash
curl -s -G --compressed \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Accept-Encoding: gzip" \
  -H "User-Agent: agent (gzip)" \
  --data-urlencode "includeTabsContent=true" \
  --data-urlencode "fields=tabs(tabProperties(tabId,title))" \
  "https://docs.googleapis.com/v1/documents/{DOC_ID}"
```

**Response:** `{ "tabs": [ { "tabProperties": { "tabId": "...", "title": "Tab 1" } }, ... ] }`

If `tabs` has one entry → use legacy mode for all subsequent reads and writes.
If `tabs` has multiple entries → use `includeTabsContent=true` and target tabs by `tabId`.

### Step 2 — Read a multi-tab document
```bash
curl -s -G --compressed \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Accept-Encoding: gzip" \
  -H "User-Agent: agent (gzip)" \
  --data-urlencode "includeTabsContent=true" \
  --data-urlencode "fields=tabs(tabProperties(tabId,title),documentTab(body(content(startIndex,endIndex,paragraph(elements(startIndex,endIndex,textRun(content)))))),childTabs)" \
  "https://docs.googleapis.com/v1/documents/{DOC_ID}"
```

**Tab tree structure:**
```
tabs[N].tabProperties.tabId    — use this in Location/Range objects
tabs[N].tabProperties.title    — human-readable tab name
tabs[N].documentTab.body       — tab content (same structure as legacy body)
tabs[N].childTabs[]            — nested child tabs (recurse as needed)
```

**Note:** When `includeTabsContent=true`, `document.body` is empty — all content is under `tabs[N].documentTab.body`.

### Step 3 — Target a specific tab in batchUpdate
Add `tabId` to every `Location` or `Range` object in your requests:
```json
{
  "insertText": {
    "location": { "index": 1, "tabId": "TARGET_TAB_ID" },
    "text": "Hello"
  }
}
```

**Default behavior when `tabId` is omitted:**
- Most requests default to the first tab.
- `replaceAllText`, `deleteNamedRange`, and `replaceNamedRangeContent` apply to **all tabs** by default.

---

## 6. WriteControl (Collaborative Documents)

Use `writeControl` in `batchUpdate` when the document may have other active editors.

### Option A: Fail if document changed (`requiredRevisionId`)
The batch fails with an error if anyone else edited the document since you last read it.
```json
{
  "requests": [...],
  "writeControl": {
    "requiredRevisionId": "REVISION_ID_FROM_GET"
  }
}
```

### Option B: Merge with concurrent changes (`targetRevisionId`)
The server attempts to merge your changes with any concurrent edits.
```json
{
  "requests": [...],
  "writeControl": {
    "targetRevisionId": "REVISION_ID_FROM_GET"
  }
}
```

Get the `revisionId` from a prior `documents.get` call (include `revisionId` in your `fields` mask).

---

## 7. Common Workflows

### Workflow: Create and populate a document
```bash
# Step 1 — Create document, capture documentId from response
DOC_ID=$(curl -s -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  "https://docs.googleapis.com/v1/documents" \
  -d '{"title": "Q1 Roadmap"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['documentId'])")

# Step 2 — Insert content and apply heading in one batchUpdate (high index first)
curl -s -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  "https://docs.googleapis.com/v1/documents/$DOC_ID:batchUpdate" \
  -d '{
    "requests": [
      {
        "insertText": {
          "location": { "index": 1 },
          "text": "Q1 2026 Roadmap\nProject goals go here.\n"
        }
      },
      {
        "updateParagraphStyle": {
          "range": { "startIndex": 1, "endIndex": 16 },
          "paragraphStyle": { "namedStyleType": "HEADING_1" },
          "fields": "namedStyleType"
        }
      }
    ]
  }'
```

### Workflow: Fill a template
```bash
# Step 1 — Copy template
NEW_DOC_ID=$(curl -s -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  "https://www.googleapis.com/drive/v3/files/{TEMPLATE_DOC_ID}/copy" \
  -d '{"name": "Customer Report - Acme Corp"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

# Step 2 — Replace all placeholders in one batch
curl -s -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  "https://docs.googleapis.com/v1/documents/$NEW_DOC_ID:batchUpdate" \
  -d '{
    "requests": [
      {
        "replaceAllText": {
          "containsText": { "text": "{{company}}", "matchCase": true },
          "replaceText": "Acme Corp"
        }
      },
      {
        "replaceAllText": {
          "containsText": { "text": "{{date}}", "matchCase": true },
          "replaceText": "2026-02-28"
        }
      }
    ]
  }'
```

---

## 8. Index Mechanics Reference

- All indexes are in **UTF-16 code units** (most ASCII text = 1 unit per character).
- Index `0` is before the document start — never write to index 0.
- Index `1` is the first valid insertion point (start of body).
- Paragraph breaks (`\n`) count as 1 index unit.
- After any insert at index N, all indexes above N shift up by the number of inserted units.
- After any delete from N to M, all indexes above M shift down by `M - N` units.
- **Safe pattern:** always read fresh indexes immediately before editing, then batch all edits ordered from highest to lowest index.
