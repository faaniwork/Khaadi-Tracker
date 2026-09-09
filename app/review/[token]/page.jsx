import { resolveReviewLink } from '@/lib/db';
import { ReviewBoard } from '@/components/review/review-board';

// The token is the credential, so this page must never be cached or
// prerendered, and search engines have no business indexing it.
export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Review images',
  robots: { index: false, follow: false },
};

/**
 * The client-facing review page. No Google sign-in: the link is the access.
 *
 * The token is resolved here, server-side, so an invalid or revoked link
 * renders a plain message instead of loading the app and failing later. An
 * unknown token and a revoked one look identical on purpose.
 */
export default async function ReviewPage({ params }) {
  const { token } = await params;
  let link = null;
  try {
    link = await resolveReviewLink(token);
  } catch (e) {
    console.error('resolveReviewLink failed', e);
  }

  if (!link) {
    return (
      <div className="min-h-screen grid place-items-center p-6 bg-background">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center">
          <h1 className="f-heading text-lg font-bold text-foreground">This link isn&apos;t active</h1>
          <p className="text-sm text-muted-foreground mt-2">
            It may have been replaced with a newer one, or switched off once the batch was signed
            off. Ask whoever sent it for a current link.
          </p>
        </div>
      </div>
    );
  }

  return <ReviewBoard token={link.token} release={link.release} label={link.label} />;
}
