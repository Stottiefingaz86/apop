# Journey Map Tracking → APOP

Site-apop's tracking sends clicks and impressions to APOP. Roadmap cards show live metrics.

**Note:** For live data, both APOP and site-apop must be reachable. If APOP runs on localhost, site-apop cannot POST to it — deploy APOP (e.g. Vercel) and set APOP_APP_URL to that URL.

## 1. APOP (.env)

```env
# Your APOP app URL — where site-apop POSTs events
APOP_APP_URL="https://your-apop.vercel.app"

# Optional: if site-apop uses a different origin (e.g. preview URL)
# APOP_TRACKING_ALLOWED_ORIGINS="https://site-apop.vercel.app,https://site-apop-preview.vercel.app"
```

## 2. Site-apop

Add to site-apop's `.env`:

```env
NEXT_PUBLIC_APOP_APP_URL="https://your-apop.vercel.app"
```

In your existing tracker, when capturing an event:

1. **Read** `data-apop-feature-id` from the element (or nearest parent)
2. **Include** it in the payload
3. **POST** to `${NEXT_PUBLIC_APOP_APP_URL}/api/tracking/events`

**Payload (single or batch):**

```json
{ "featureId": "clx...", "eventType": "impression", "route": "/", "elementId": "carousel" }
```

Or batch:

```json
{
  "events": [
    { "featureId": "clx...", "eventType": "impression", "route": "/" },
    { "featureId": "clx...", "eventType": "click", "route": "/", "elementId": "card-1" }
  ]
}
```

## 3. Tag new features

When Cursor builds a feature, it adds `data-apop-feature-id="{featureId}"` to new components. Ensure your tracker reads this attribute (e.g. `element.closest('[data-apop-feature-id]')?.dataset.apopFeatureId`).

## 4. API discovery

`GET https://your-apop.vercel.app/api/tracking/events` returns the endpoint URL and payload format.
