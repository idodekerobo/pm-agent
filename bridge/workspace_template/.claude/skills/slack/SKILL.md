---
name: slack
description: >
  Send Slack messages, reply in threads, and send DMs on behalf of the user.
  Use when asked to post an update, share a document summary, notify a channel,
  or send a direct message. Requires SLACK_BOT_TOKEN in environment.
allowed-tools: Bash(curl:*)
---

# Slack

Send messages to Slack channels, reply in threads, and send direct messages using the Slack Web API.

## Authentication

`SLACK_BOT_TOKEN` is pre-injected into the environment. Use it as the `Authorization` header in all API calls:

```bash
-H "Authorization: Bearer $SLACK_BOT_TOKEN"
```

Never ask the user to provide a token. If `SLACK_BOT_TOKEN` is empty, tell the user Slack is not connected and ask them to connect it in settings.

---

## Core operations

### Post a message to a channel

```bash
curl -s -X POST https://slack.com/api/chat.postMessage \
  -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "CHANNEL_ID_OR_NAME",
    "text": "Your message here"
  }'
```

Channel can be a channel ID (`C0123ABCD`) or channel name (`#general`).

### Reply in a thread

```bash
curl -s -X POST https://slack.com/api/chat.postMessage \
  -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "CHANNEL_ID",
    "thread_ts": "1234567890.123456",
    "text": "Your reply here"
  }'
```

`thread_ts` is the timestamp of the parent message.

### Send a direct message

Open a DM channel first, then post to it:

```bash
# Step 1: open DM channel
curl -s -X POST https://slack.com/api/conversations.open \
  -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"users": "SLACK_USER_ID"}' | python3 -c "
import sys, json
data = json.load(sys.stdin)
print(data['channel']['id'])
"
```

```bash
# Step 2: post to the DM channel ID from step 1
curl -s -X POST https://slack.com/api/chat.postMessage \
  -H "Authorization: Bearer $SLACK_BOT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "channel": "DM_CHANNEL_ID",
    "text": "Your message here"
  }'
```

### Look up a channel ID by name

```bash
curl -s "https://slack.com/api/conversations.list?limit=200" \
  -H "Authorization: Bearer $SLACK_BOT_TOKEN" | python3 -c "
import sys, json
data = json.load(sys.stdin)
target = 'general'  # channel name to find
for ch in data.get('channels', []):
    if ch['name'] == target:
        print(ch['id'])
        break
"
```

### List channels the bot is in

```bash
curl -s "https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=100" \
  -H "Authorization: Bearer $SLACK_BOT_TOKEN" | python3 -c "
import sys, json
data = json.load(sys.stdin)
for ch in data.get('channels', []):
    if ch.get('is_member'):
        print(ch['id'], ch['name'])
"
```

---

## Message formatting

Slack supports basic markdown-like formatting:

| Format        | Syntax                  |
|---------------|-------------------------|
| Bold          | `*bold text*`           |
| Italic        | `_italic text_`         |
| Code          | `` `code` ``            |
| Code block    | ` ```multiline``` `     |
| Link          | `<https://url\|label>`  |
| User mention  | `<@UXXXXXXXX>`          |
| Channel link  | `<#CXXXXXXXX>`          |

---

## Checking the API response

Always check the `ok` field in the response. If `ok` is `false`, log the `error` field:

```bash
curl -s ... | python3 -c "
import sys, json
data = json.load(sys.stdin)
if data.get('ok'):
    print('Sent successfully. ts:', data.get('ts'))
else:
    print('Error:', data.get('error'))
    sys.exit(1)
"
```

---

## Known gotchas

- **Bot must be in the channel**: The bot token can only post to channels it has been added to. If you get `not_in_channel`, the bot needs to be invited: `/invite @YourBotName` in Slack.
- **Channel name vs ID**: Prefer channel IDs (`C0123ABCD`) for reliability. Channel names can change; IDs cannot.
- **Rate limits**: Slack allows ~1 message per second per channel. Don't send bursts.
- **Only post when asked**: Never post to Slack proactively unless the user has explicitly asked you to.
