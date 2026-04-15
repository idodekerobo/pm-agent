---
name: google-docs
description: >
  Create, read, and edit Google Docs via the Google Docs REST API. Use when
  creating new documents, reading document content, or making structured edits
  (insert text, format, find-and-replace, tables). Need a file ID? Use the
  google-drive skill first.
allowed-tools: Bash(curl:*)
---

# Google Docs API Skill

> **Don't have a document ID?** Use the **google-drive** skill to locate the file first. The Docs API requires a document ID for all operations.

## Authentication

`BEARER_TOKEN` is pre-injected into the environment.

**Base URLs:**
- Docs API: `https://docs.googleapis.com/v1/documents`
- Drive API (copy/move): `https://www.googleapis.com/drive/v3/files`

---

## Performance Rules (always follow)

1. **Always use `fields=`** on every GET — never fetch the full document
2. **Batch all edits** into a single `batchUpdate` call
3. **Edit in descending index order** — highest index first so lower indexes stay stable
4. **Use gzip on reads** — pass `--compressed` with gzip headers
5. **No markdown in insertText** — `**bold**` renders as literal asterisks; use `updateTextStyle` for formatting

---

## 1. Read a Document

### Minimal read (title + revision)

```bash
curl -s -G --compressed \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Accept-Encoding: gzip" \
  -H "User-Agent: agent (gzip)" \
  --data-urlencode "fields=documentId,title,revisionId" \
  "https://docs.googleapis.com/v1/documents/{DOC_ID}"
```

### Read body with paragraph styles (do this before any edit)

```bash
curl -s -G --compressed \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Accept-Encoding: gzip" \
  -H "User-Agent: agent (gzip)" \
  --data-urlencode "fields=documentId,title,revisionId,body(content(startIndex,endIndex,paragraph(paragraphStyle(namedStyleType),elements(textRun(content)))))" \
  "https://docs.googleapis.com/v1/documents/{DOC_ID}"
```

### Read with character-level indexes (for targeted insertions/deletions)

```bash
curl -s -G --compressed \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Accept-Encoding: gzip" \
  -H "User-Agent: agent (gzip)" \
  --data-urlencode "fields=documentId,title,revisionId,body(content(startIndex,endIndex,paragraph(paragraphStyle(namedStyleType),elements(startIndex,endIndex,textRun(content)))))" \
  "https://docs.googleapis.com/v1/documents/{DOC_ID}"
```

**Parse with python3:**

```bash
curl -s -G --compressed \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Accept-Encoding: gzip" \
  -H "User-Agent: agent (gzip)" \
  --data-urlencode "fields=documentId,revisionId,body(content(startIndex,endIndex,paragraph(elements(textRun(content)))))" \
  "https://docs.googleapis.com/v1/documents/{DOC_ID}" | python3 -c "
import sys, json
doc = json.load(sys.stdin)
if 'error' in doc:
    print(f'API error: {doc[\"error\"][\"message\"]}')
    sys.exit(1)
for el in doc['body']['content']:
    if 'paragraph' in el:
        for elem in el['paragraph']['elements']:
            text = elem.get('textRun', {}).get('content', '')
            if text.strip():
                print(text, end='')
"
```

---

## 2. Create a Document

### Create blank in Drive root

```bash
curl -s -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  "https://docs.googleapis.com/v1/documents" \
  -d '{"title": "My New Document"}'
```

### Create directly in a folder (preferred)

```bash
DOC_ID=$(curl -s -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  "https://www.googleapis.com/drive/v3/files?fields=id" \
  -d '{
    "name": "Document Title",
    "mimeType": "application/vnd.google-apps.document",
    "parents": ["FOLDER_ID"]
  }' | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
```

---

## 3. batchUpdate — All Edits

All edits go through `batchUpdate`. Combine all requests into one call.

```
POST https://docs.googleapis.com/v1/documents/{DOC_ID}:batchUpdate
```

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

Requests are processed in order. If any request is invalid, the entire batch fails.

### Insert text

```bash
curl -s -X POST \
  -H "Authorization: Bearer $BEARER_TOKEN" \
  -H "Content-Type: application/json" \
  "https://docs.googleapis.com/v1/documents/{DOC_ID}:batchUpdate" \
  -d '{
    "requests": [
      {
        "insertText": {
          "location": { "index": 1 },
          "text": "Hello, world!\n"
        }
      },
      {
        "updateParagraphStyle": {
          "range": { "startIndex": 1, "endIndex": 15 },
          "paragraphStyle": { "namedStyleType": "NORMAL_TEXT" },
          "fields": "namedStyleType"
        }
      }
    ]
  }'
```

**Always pair `insertText` with `updateParagraphStyle`** in the same batch to be explicit about the paragraph style. Range `endIndex = insert_index + len(text)`.

### Paragraph style types

`HEADING_1`, `HEADING_2`, `HEADING_3`, `NORMAL_TEXT`, `TITLE`, `SUBTITLE`

### Apply bold/italic

```json
{
  "updateTextStyle": {
    "range": { "startIndex": 1, "endIndex": 10 },
    "textStyle": { "bold": true },
    "fields": "bold"
  }
}
```

### Delete content

```json
{
  "deleteContentRange": {
    "range": { "startIndex": 10, "endIndex": 24 }
  }
}
```

### Find and replace

```json
{
  "replaceAllText": {
    "containsText": {
      "text": "{{PLACEHOLDER}}",
      "matchCase": true
    },
    "replaceText": "Actual content"
  }
}
```

---

## 4. Append to End of Document

Read the document first to find the last content index, then insert there:

```bash
python3 - <<'PY'
import json, os, subprocess

raw = subprocess.check_output([
  'curl', '-s', '-G', '--compressed',
  '-H', f'Authorization: Bearer {os.environ["BEARER_TOKEN"]}',
  '-H', 'Accept-Encoding: gzip',
  '-H', 'User-Agent: agent (gzip)',
  '--data-urlencode', 'fields=documentId,revisionId,body(content(endIndex))',
  'https://docs.googleapis.com/v1/documents/DOC_ID_HERE'
], text=True)
doc = json.loads(raw)
if 'error' in doc:
    print(f"Error: {doc['error']['message']}")
    raise SystemExit(1)

# Last endIndex - 1 (subtract 1 for the trailing newline the API adds)
last_index = doc['body']['content'][-1]['endIndex'] - 1
revision_id = doc['revisionId']
print(f"Insert at index: {last_index}, revision: {revision_id}")
PY
```

---

## Known Gotchas

- **Index 0 is reserved.** Always start insertions at index 1 or later.
- **Markdown is not supported.** `insertText` is plain text only. Use `updateTextStyle` and `updateParagraphStyle` for formatting.
- **Edit in descending index order.** When batching multiple inserts/deletes, put the highest index first.
- **Always use `fields=`** — never omit it or the API returns huge payloads.
- **Field masks have no spaces.** A space in `fields=` makes the mask invalid.
- **Gzip requires `--compressed`.** Without it, curl returns raw binary gzip bytes.
- **Always check for `"error"` in the response** before accessing document fields.
