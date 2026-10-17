# Booking web host integration

The rebuild has a browser-neutral mobile card editor, a browser fetch adapter,
and an authenticated RPC dispatcher. It **does not yet have a deployed web host**.

A hosting framework must authenticate the session and supply
`WorldApiContext.actor.playerId` **only from verified session middleware**.
Never trust a playerId in JSON, URL parameters or headers.

Mount `mountBookingPage(root,{worldId,promotionId,showId})` after
authentication. Serve POST `/api/card` with a same-origin cookie session.
Before `dispatchCardRpc(context,body.method,body)`, the host must:
- require a verified session, same-origin Origin and CSRF protection;
- reject non-JSON and bodies above 128 KiB;
- rate-limit per authenticated player and map errors to generic HTTP responses;
- connect a bounded database pool and ensure production secrets stay server-side.

Do not expose the dispatcher directly as an unauthenticated public endpoint.
No cron, deployment, schema migration or production Neon access is introduced.
