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

import { cookies } from 'next/headers';
import { auth } from '@/auth';
import { getMyRole, canReviewRole, resolveReviewLink, getDress } from '@/lib/db';

// The review page exchanges its URL token for this cookie, so the credential
// stops travelling in query strings. It has to be readable on plain <img>
// requests, which cannot send headers, which is why the cookie exists at all.
export const REVIEW_COOKIE = 'khaadi_review_token';

function fail(code, message, status) {
  const err = new Error(message);
  err.code = code;
  err.status = status;
  return err;
}

/**
 * The name a link reviewer typed for themselves.
 *
 * It is self-asserted and unverifiable, so it is always suffixed with the
 * link it came through. Without that, anyone holding a link could type a real
 * editor's name and their decisions would appear in the Activity trail
 * indistinguishable from that editor's own, which would quietly undo the
 * whole point of having real sign-in for the team.
 */
function reviewerNameFrom(req, label) {
  const raw = req.headers.get('x-reviewer-name') || '';
  const clean = raw.replace(/[\r\n]/g, ' ').trim().slice(0, 60);
  const via = label ? `${label} link` : 'review link';
  return clean ? `${clean} (via ${via})` : `Client (via ${via})`;
}

async function tokenFromRequest(req) {
  const header = req.headers.get('x-review-token');
  if (header) return header;
  try {
    const jar = await cookies();
    const fromCookie = jar.get(REVIEW_COOKIE)?.value;
    if (fromCookie) return fromCookie;
  } catch {
    // No cookie store in this context; fall through.
  }
  // Last resort. Kept only for <img> requests that predate the cookie being
  // set, and for a link opened in a context where cookies are blocked.
  return new URL(req.url).searchParams.get('token') || '';
}

export async function resolveCaller(req) {
  const token = await tokenFromRequest(req);

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
        canReview: canReviewRole(role),
        isAdmin: role === 'admin',
        release: null,
      };
    }
  }

  if (token) {
    const link = await resolveReviewLink(token);
    if (!link) {
      // A signed-in viewer carrying a stale or revoked token should not lose
      // their own access; they simply fall back to being themselves.
      if (session?.user?.email) {
        const role = await getMyRole(session.user.email);
        return {
          kind: 'user',
          email: session.user.email,
          by: session.user.name || session.user.email,
          role,
          canWrite: role === 'admin' || role === 'editor',
          canReview: canReviewRole(role),
          isAdmin: role === 'admin',
          release: null,
        };
      }
      // An unknown token and a revoked one are deliberately indistinguishable.
      throw fail('BAD_TOKEN', 'This review link is not valid any more.', 401);
    }
    return {
      kind: 'token',
      email: '',
      by: reviewerNameFrom(req, link.label),
      role: 'client',
      canWrite: false,
      canReview: true,
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
    case 'DRIVE_ACCESS_REQUIRED':
    case 'NO_DRIVE_ACCESS':
      return 403;
    case 'NOT_FOUND':
    case 'DRIVE_NOT_FOUND':
    case 'NO_PREVIEW':
      return 404;
    case 'BAD_ID':
      return 400;
    default:
      return 500;
  }
}
