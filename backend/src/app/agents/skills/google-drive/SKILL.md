---
name: google-drive-recent-activity
description: Retrieve recent files from Google Drive to discover current projects and active work areas. Use when building context about a user's recent work or identifying active projects in Google Drive.
---

# Google Drive Recent Activity

## Overview

This skill teaches how to query the Google Drive API using cURL to retrieve files based on flexible criteria. Use this to discover files by recency, folder structure, document type, naming patterns, sharing status, or content.

## cURL Query Structure

All Google Drive API queries follow this pattern:

```bash
curl \
  --header "Authorization: Bearer $BEARER_TOKEN" \
  --url "https://www.googleapis.com/drive/v3/files" \
  --data-urlencode "q=QUERY_FILTER" \
  --data-urlencode "pageSize=LIMIT" \
  --data-urlencode "orderBy=SORT_ORDER" \
  --data-urlencode "fields=FILES(id,name,OTHER_FIELDS)"
```

**Key Parameters:**

- **q**: The query filter (combines conditions with `and`/`or`)
- **pageSize**: Number of results (default 10, max 1000)
- **orderBy**: Sort results by `modifiedTime desc` (newest first), `name`, or other fields
- **fields**: Specify which file properties to return (reduces response size)

## Query Examples

### Get Recent Files

Start by fetching the 50 most recently modified files to identify current projects:

```bash
curl \
  --header "Authorization: Bearer $BEARER_TOKEN" \
  --url "https://www.googleapis.com/drive/v3/files" \
  --data-urlencode "orderBy=modifiedTime desc" \
  --data-urlencode "pageSize=50" \
  --data-urlencode "q=trashed=false" \
  --data-urlencode "fields=files(id,name,mimeType,modifiedTime,lastModifyingUser)"
```

**Returns:** File IDs, names, document types, modification times, and last editor for each file

### Discover Folder Structure

List all top-level folders in My Drive:

```bash
curl \
  --header "Authorization: Bearer $BEARER_TOKEN" \
  --url "https://www.googleapis.com/drive/v3/files" \
  --data-urlencode "q=mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false" \
  --data-urlencode "fields=files(id,name)"
```

**Returns:** Folder names and IDs to explore organizational hierarchy

Explore contents of a specific folder:

```bash
curl \
  --header "Authorization: Bearer $BEARER_TOKEN" \
  --url "https://www.googleapis.com/drive/v3/files" \
  --data-urlencode "q='FOLDER_ID' in parents and trashed=false" \
  --data-urlencode "orderBy=modifiedTime desc" \
  --data-urlencode "fields=files(id,name,mimeType,modifiedTime,owners)"
```

**Returns:** Files in the folder sorted by recency, including document type and owner info

### Search by Document Type

Find all Google Docs:

```bash
curl \
  --header "Authorization: Bearer $BEARER_TOKEN" \
  --url "https://www.googleapis.com/drive/v3/files" \
  --data-urlencode "q=mimeType='application/vnd.google-apps.document'" \
  --data-urlencode "fields=files(id,name,modifiedTime)"
```

**Returns:** All Google Docs with timestamps

Find all Google Sheets:

```bash
curl \
  --header "Authorization: Bearer $BEARER_TOKEN" \
  --url "https://www.googleapis.com/drive/v3/files" \
  --data-urlencode "q=mimeType='application/vnd.google-apps.spreadsheet'" \
  --data-urlencode "fields=files(id,name,modifiedTime)"
```

**Returns:** All Google Sheets with timestamps

Find all Google Slides:

```bash
curl \
  --header "Authorization: Bearer $BEARER_TOKEN" \
  --url "https://www.googleapis.com/drive/v3/files" \
  --data-urlencode "q=mimeType='application/vnd.google-apps.presentation'" \
  --data-urlencode "fields=files(id,name,modifiedTime)"
```

**Returns:** All Google Slides with timestamps

### Search by Name Patterns

Find files matching specific naming patterns:

```bash
curl \
  --header "Authorization: Bearer $BEARER_TOKEN" \
  --url "https://www.googleapis.com/drive/v3/files" \
  --data-urlencode "q=name contains 'project' or name contains 'roadmap' or name contains 'plan'" \
  --data-urlencode "pageSize=50" \
  --data-urlencode "fields=files(id,name,modifiedTime)"
```

**Returns:** Files with project-related names

Search by full text content:

```bash
curl \
  --header "Authorization: Bearer $BEARER_TOKEN" \
  --url "https://www.googleapis.com/drive/v3/files" \
  --data-urlencode "q=fullText contains 'requirements' or fullText contains 'specification'" \
  --data-urlencode "pageSize=50" \
  --data-urlencode "fields=files(id,name)"
```

**Returns:** Files containing specific keywords in their content

### Find Collaboration Patterns

Find files shared with others:

```bash
curl \
  --header "Authorization: Bearer $BEARER_TOKEN" \
  --url "https://www.googleapis.com/drive/v3/files" \
  --data-urlencode "q=shared=true" \
  --data-urlencode "fields=files(id,name,owners,sharingUser,lastModifyingUser)"
```

**Returns:** Shared files with owner and sharing user information

Find recently edited files to analyze team contributors:

```bash
curl \
  --header "Authorization: Bearer $BEARER_TOKEN" \
  --url "https://www.googleapis.com/drive/v3/files" \
  --data-urlencode "q=trashed=false" \
  --data-urlencode "orderBy=modifiedTime desc" \
  --data-urlencode "pageSize=100" \
  --data-urlencode "fields=files(id,name,lastModifyingUser)"
```

**Returns:** 100 most recent files showing who last edited each

## Query Composition Tips

**Combine filters with `and`:**
```
mimeType='application/vnd.google-apps.document' and modifiedTime > '2024-01-01'
```
Returns Google Docs modified after a specific date.

**Use `or` for alternatives:**
```
name contains 'Q1' or name contains 'Q2' or name contains 'Q3'
```
Returns files matching any of the name patterns.

**Exclude files:**
```
trashed=false and mimeType != 'application/vnd.google-apps.folder'
```
Returns all non-trashed files that are not folders.
