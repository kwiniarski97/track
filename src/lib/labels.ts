import { m } from './paraglide/messages';

// TMDB's raw `status` string for a show -- one of these six values.
export function showStatusLabel(status: string): string {
	switch (status) {
		case 'Returning Series':
			return m.show_status_returning_series();
		case 'Planned':
			return m.show_status_planned();
		case 'In Production':
			return m.show_status_in_production();
		case 'Ended':
			return m.show_status_ended();
		case 'Canceled':
			return m.show_status_canceled();
		case 'Pilot':
			return m.show_status_pilot();
		default:
			return status;
	}
}

// Mirrors the `trackingStatuses` tuple in src/lib/server/db/schema.ts -- kept as a plain
// switch here rather than importing server-only code into a client-shared module.
export function trackingStatusLabel(status: string): string {
	switch (status) {
		case 'plan_to_watch':
			return m.tracking_status_plan_to_watch();
		case 'watching':
			return m.tracking_status_watching();
		case 'completed':
			return m.tracking_status_completed();
		case 'dropped':
			return m.tracking_status_dropped();
		default:
			return status;
	}
}
