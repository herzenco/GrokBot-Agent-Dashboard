# Resolutions

Herzen posts a resolution on a blocked task from the detail (the modal, the task page, or the Resolution button on My tasks). That text is a `task_comments` row with `kind = resolution` and `author = herzen`. The task moves to `resolution_state = awaiting_agent` (`resolution_pending = true`) until the owning agent acknowledges it or clears the block.

The board, list, and My tasks show an **Awaiting agent** badge while that is true. Older resolutions stay on the task as history.

## How an agent should hear about one

Use polling. Each routine that already reads Agent HQ should call:

```http
GET /api/agent/resolutions
Authorization: Bearer <agent key>
```

An agent key only returns that agent's tasks. The admin key returns every unacknowledged resolution, or one agent with `?agent=roger`. `GET /api/agent/tasks?resolution=pending` is the same set, in the normal task list, with `pending_resolution` added.

Then act on the text and acknowledge:

```http
POST /api/agent/tasks/HQ-12/resolution/ack
Authorization: Bearer <agent key>
Content-Type: application/json

{"reply":"Using the sandbox key.","blocked":false,"status":"in_progress"}
```

`reply`, `blocked`, and `status` are all optional. Sending `blocked: false`, or a status of `done` or `canceled`, through this call or through the existing `PATCH /api/agent/tasks/HQ-12` acknowledges a pending resolution. The block fields still clear the way they do today.

This is the path to use. The agents already poll Agent HQ on a routine, the call is scoped to the key, and a missed cycle just sees the same row again until it is acknowledged. Nothing else has to be deployed.

## Optional webhook

If `RESOLUTION_WEBHOOK_URL` and `RESOLUTION_WEBHOOK_SECRET` are both set, Agent HQ also POSTs this JSON when Herzen submits a resolution:

```json
{
  "event": "resolution.created",
  "task_id": "33333333-3333-4333-8333-333333333333",
  "identifier": "HQ-12",
  "agent": "roger",
  "title": "Ship the board",
  "blocked_reason": "DNS still pending",
  "resolution": {
    "id": "44444444-4444-4444-8444-444444444444",
    "author": "herzen",
    "body": "Use the sandbox key and retry the export.",
    "created_at": "2026-11-13T19:05:00.000Z"
  }
}
```

The header `X-Resolution-Signature` is `sha256=` plus the HMAC-SHA256 hex of the raw body, keyed with `RESOLUTION_WEBHOOK_SECRET`. The request times out after 4 seconds. A failed POST does not undo the resolution and is not retried.

If either variable is unset, Agent HQ does not call out. The app runs with neither variable set.

Use the webhook only when something is already listening on a URL you control and can verify the signature. Keep the poll anyway. The webhook is a hint, not the record. The pending list is the record.
