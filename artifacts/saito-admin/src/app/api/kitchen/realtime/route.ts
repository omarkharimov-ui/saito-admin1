import { NextRequest, NextResponse } from 'next/server';
import { requirePermission, createAuthClient } from '@/lib/api-auth';
import { resolveReadLocationScope } from '@/lib/location-context';

/**
 * G6 (K frozen contract): the KDS realtime DELIVERY SPINE.
 *
 * The kds_ticket outbox (aggregate_type='kds_ticket', event_type='kds.ticket.upsert')
 * is the canonical, REPLAYABLE, location/station-scoped KDS event. This endpoint is
 * the only way a KDS client learns about kitchen-state changes.
 *
 *   - Auth:  requirePermission('kitchen.view') -> staff session.
 *   - Scope: the operator's ACTIVE LOCATION + ORG (server-trusted,
 *     resolveReadLocationScope) is applied SERVER-SIDE inside kds_ticket_poll.
 *     The client never filters location itself and never sees another
 *     location's events.
 *   - Cursor: composite (created_at, id).
 *       first load (no since)         -> resync_required=true, events=[]
 *       since older than oldest event -> resync_required=true (gap -> full rebuild)
 *       otherwise                     -> events strictly after the cursor
 *   - DB is SSOT: on any events / gap / reconnect, the client does a FULL
 *     resync from /api/kitchen/orders (already location-scoped). Events are a
 *     wake/signal, not the state.
 *
 * Response: { events:[{id,created_at,payload}], anchor, cursor, oldest,
 *             resync_required, location_id }
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission('kitchen.view');
    if (!auth.authenticated) return auth;
    const lctx = auth.user?.id ? await resolveReadLocationScope(auth.user.id) : null;
    const sessLoc = lctx?.locationId || null;
    const sessOrg = lctx?.organizationId || null;
    if (!sessLoc) {
      // no location context -> nothing we can safely scope to (fail closed)
      return NextResponse.json({ events: [], anchor: null, cursor: null, oldest: null, resync_required: true, location_id: null });
    }

    const params = new URLSearchParams(request.nextUrl.searchParams);
    const sinceCreatedAt = params.get('since_created_at');
    const sinceId = params.get('since_id');

    const svc = await createAuthClient();
    if (!svc) return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });

    const { data, error } = await svc.rpc('kds_ticket_poll', {
      p_location_id: sessLoc,
      p_organization_id: sessOrg || null,
      p_station: null,
      p_since_created_at: sinceCreatedAt,
      p_since_id: sinceId,
      p_limit: 200,
    });
    if (error) {
      return NextResponse.json({ error: `KDS realtime read failed: ${error.message}` }, { status: 500 });
    }

    const rows = (data || []) as any[];
    const anchor: string | null = rows.length > 0 ? rows[0].anchor : new Date().toISOString();
    const oldest: string | null = rows.length > 0 ? rows[0].oldest ?? null : null;
    const resyncRequired: boolean = rows.length > 0 ? !!rows[0].resync_required : true;

    // cursor = last event (if any), else the caller's since (if any), else null
    // (client will resync on resync_required and anchor to `anchor`)
    const cursor = rows.length > 0
      ? { created_at: rows[rows.length - 1].created_at, id: rows[rows.length - 1].id }
      : (sinceCreatedAt && sinceId ? { created_at: sinceCreatedAt, id: sinceId } : null);

    return NextResponse.json({
      events: rows.map(r => ({ id: r.id, created_at: r.created_at, payload: r.payload })),
      anchor,
      cursor,
      oldest,
      resync_required: resyncRequired,
      location_id: sessLoc,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'KDS realtime read failed' }, { status: 500 });
  }
}
