/**
 * Default password assigned to newly created users and to users whose
 * password is reset by an admin. On first login (or first login after a
 * reset) the user is redirected to /change-password and required to set
 * a new one before they can access anything else.
 *
 * The redirect is gated by the must_change_password flag stored in
 * auth.users.user_metadata, which is included in the JWT so the
 * middleware can read it without a database round-trip.
 */
export const DEFAULT_PASSWORD = 'M@rjcc2026';
