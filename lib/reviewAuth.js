/**
 * The single auth boundary for every /api/drive route.
 *
 * There are exactly two kinds of caller:
 *
 *   'user'   a signed-in Google account. Its powers come from the access
 *            table: admin/editor can write, viewer can only look.
 *
 *   'token'  an external client holding a per-batch review link. It can
 *            ONLY read files and record review decisions, and ONLY inside
 *            the one batch its token was issued for. It can never upload,
 *            trash, create folders, mint links, or touch the board APIs.
 *
 * Routes must not read the token out of the request themselves. They call
 * resolveCaller once and then assert with the helpers below, so the rules
 * live in one file rather than being restated (and eventually mis-stated) in
 * seven of them.
 */

import { auth } from '@/auth';
import { getMyRole, resolveReviewLink, getDress } from '@/lib/db';

function fail(code, message, status) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

/** Reviewer-supplied display name, so client decisions are attributable. */
function reviewerNameFrom(req, fallback) {
  const raw = req.headers.get('x-reviewer-name') || '';
  const clean = raw.replace(/[\r\n]/g, ' ').trim().slice(0, 60);
  return clean || fallback;
}

export async function resolveCaller(req) {
  const token =
    req.headers.get('x-review-token') ||
    new URL(req.url).searchParams.get('token') ||
    '';

  const session = await auth();
  if (session?.user?.email) {
    const role = await getMyRole(session.user.email);
    const canWrite = role === 'admin' || role === 'editor';
    // A signed-in editor or admin is always treated as themselves, even when
    // they open a review link. But somebody with only VIEWER access who
    // follows a review link is acting as a reviewer, and treating them as a
    // view-only user would refuse the link they were legitimately sent. So a
    // viewer holding a token falls through to the token below.
    if (canWrite || !token) {
      return {
        kind: 'user',
        email: session.user.email,
        by: session.user.name || session.user.email,
        role,
        canWrite,
        isAdmin: role === 'admin',
        release: null,
      };
    }
  }

  if (token) {
    const link = await resolveReviewLink(token);
    // An unknown token and a revoked one are deliberately indistinguishable.
    if (!link) throw fail('BAD_TOKEN', 'This review link is not valid any more.', 401);
    return {
      kind: 'token',
      email: '',
      by: reviewerNameFrom(req, `Client (${link.label || 'review link'})`),
      role: 'client',
      canWrite: false,
      isAdmin: false,
      release: link.release,
      label: link.label,
    };
  }

  throw fail('UNAUTHENTICATED', 'UNAUTHENTICATED', 401);
}

/** Upload, trash, create-folder: signed-in editors and admins only. */
export function assertCanWriteFiles(caller) {
  if (caller.kind !== 'user' || !caller.canWrite) {
    throw fail(
      'VIEW_ONLY',
      'VIEW_ONLY: You need editor access to change files. Clients reviewing by link can approve or reject, but not upload or delete.',
      403
    );
  }
}

export function assertIsAdmin(caller) {
  if (caller.kind !== 'user' || !caller.isAdmin) {
    throw fail('ADMIN_ONLY', 'ADMIN_ONLY: Only admins can manage client review links.', 403);
  }
}

/**
 * The containment check for token callers: a dress may only be touched if it
 * sits in the batch that token was issued for. Returns the dress row so the
 * caller does not have to look it up twice.
 *
 * This is the check that stops a client from swapping a dress id in a request
 * body and reaching another client's batch.
 */
export async function assertDressInScope(caller, dressId) {
  const dress = await getDress(dressId);
  if (!dress) {
    throw fail('NOT_FOUND', 'That dress is not on the board.', 404);
  }
  if (caller.kind === 'token' && (dress.release !== caller.release || dress.archived)) {
    // Reported as not-found rather than forbidden, so a probing token learns
    // nothing about which dress ids exist in other batches. An archived dress
    // is off the board, so it is out of scope for a client too.
    throw fail('NOT_FOUND', 'That dress is not on the board.', 404);
  }
  return dress;
}

/** Maps any error raised here or by lib/drive.js onto an HTTP status. */
export function statusForError(e) {
  if (e?.status) return e.status;
  switch (e?.code) {
    case 'UNAUTHENTICATED':
    case 'BAD_TOKEN':
      return 401;
    case 'VIEW_ONLY':
    case 'ADMIN_ONLY':
    case 'DRIVE_FORBIDDEN':
      return 403;
    case 'NOT_FOUND':
    case 'DRIVE_NOT_FOUND':
    case 'NO_PREVIEW':
      return 404;
    default:
      return 500;
  }
}
