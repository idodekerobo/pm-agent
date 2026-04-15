---
name: google-drive
description: >
  Find, search, and retrieve files in Google Drive — Docs, Sheets, Slides, PDFs,
  folders, and more. Use when locating a file by name, browsing folder structure,
  or discovering files by type, content, recency, or owner. To edit a Doc, use
  the google-docs skill after getting the file ID from here.
allowed-tools: Bash(curl:*)
---

# Google Drive File Search & Discovery

## Authentication

`BEARER_TOKEN` is pre-injected into the environment. Use it as the Authorization header:

```bash
-H "Authorization: Bearer $BEARER_TOKEN"
```

---

## Query Structure

```bash
curl \
  --header "Authorization: Bearer $BEARER_TOKEN" \
  --url "https://www.googleapis.com/drive/v3/files" \
  --data-urlencode "q=QUERY_FILTER" \
  --data-urlencode "pageSize=50" \
  --data-urlencode "orderBy=modifiedTime desc" \
  --data-urlencode "fields=files(id,name,mimeType,modifiedTime)"
```

**Key parameters:**
- `q` — query filter (combine with `and`/`or`)
- `pageSize` — max 1000, default 10
- `orderBy` — `modifiedTime desc`, `name`, etc.
- `fields` — specify exactly what to return (reduces response size)

---

## Common Queries

### Recent files (start here to orient)

```bash
curl --header "Authorization: Bearer $BEARER_TOKEN" \
  --url "https://www.googleapis.com/drive/v3/files" \
  --data-urlencode "orderBy=modifiedTime desc" \
  --data-urlencode "pageSize=50" \
  --data-urlencode "q=trashed=false" \
  --data-urlencode "fields=files(id,name,mimeType,modifiedTime,lastModifyingUser)"
```

### Top-level folders

```bash
curl --header "Authorization: Bearer $BEARER_TOKEN" \
  --url "https://www.googleapis.com/drive/v3/files" \
  --data-urlencode "q=mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false" \
  --data-urlencode "fields=files(id,name)"
```

### Contents of a specific folder

```bash
curl --header "Authorization: Bearer $BEARER_TOKEN" \
  --url "https://www.googleapis.com/drive/v3/files" \
  --data-urlencode "q='FOLDER_ID' in parents and trashed=false" \
  --data-urlencode "orderBy=modifiedTime desc" \
  --data-urlencode "fields=files(id,name,mimeType,modifiedTime)"
```

### Search by file name

```bash
curl --header "Authorization: Bearer $BEARER_TOKEN" \
  --url "https://www.googleapis.com/drive/v3/files" \
  --data-urlencode "q=name contains 'roadmap' or name contains 'strategy' or name contains 'PRD'" \
  --data-urlencode "pageSize=50" \
  --data-urlencode "fields=files(id,name,modifiedTime)"
```

### Full-text search (content)

```bash
curl --header "Authorization: Bearer $BEARER_TOKEN" \
  --url "https://www.googleapis.com/drive/v3/files" \
  --data-urlencode "q=fullText contains 'requirements'" \
  --data-urlencode "pageSize=50" \
  --data-urlencode "fields=files(id,name)"
```

### Filter by document type

| Type              | mimeType                                          |
|-------------------|---------------------------------------------------|
| Google Docs       | `application/vnd.google-apps.document`            |
| Google Sheets     | `application/vnd.google-apps.spreadsheet`         |
| Google Slides     | `application/vnd.google-apps.presentation`        |
| Folder            | `application/vnd.google-apps.folder`              |

```bash
curl --header "Authorization: Bearer $BEARER_TOKEN" \
  --url "https://www.googleapis.com/drive/v3/files" \
  --data-urlencode "q=mimeType='application/vnd.google-apps.document' and trashed=false" \
  --data-urlencode "fields=files(id,name,modifiedTime)"
```

---

## Query Composition

```
# Combine conditions
mimeType='application/vnd.google-apps.document' and modifiedTime > '2025-01-01'

# Multiple name alternatives
name contains 'Q1' or name contains 'Q2' or name contains 'Q3'

# Exclude trashed and folders
trashed=false and mimeType != 'application/vnd.google-apps.folder'
```

---

## Finding Collaborators

```bash
# Files shared with others
curl --header "Authorization: Bearer $BEARER_TOKEN" \
  --url "https://www.googleapis.com/drive/v3/files" \
  --data-urlencode "q=shared=true" \
  --data-urlencode "fields=files(id,name,owners,lastModifyingUser)"
```
