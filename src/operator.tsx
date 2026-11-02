import { Header } from './app';
import { Button } from './components/button';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';

interface Member {
  email: string;
  language: string;
  redeemed_at: number | null;
  expires_at: number | null;
}
interface Report {
  id: string;
  match_id: string;
  category: string;
  status: string;
}
interface BillingCase {
  id: string;
  reason: string;
  resource: string;
  resolved_at: number | null;
}
export function Operator() {
  const [members, setMembers] = useState<Member[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [selection, setSelection] = useState<string[]>([]);
  const [batch, setBatch] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ email: string; language: string }[]>([]);
  const [capacity, setCapacity] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [reissue, setReissue] = useState(false);
  const [billingCases, setBillingCases] = useState<BillingCase[]>([]);
  async function load() {
    const [waitlist, reports, billing] = await Promise.all([
      fetch('/api/operator/waitlist'),
      fetch('/api/operator/reports'),
      fetch('/api/operator/billing'),
    ]);
    if (!waitlist.ok || !reports.ok || !billing.ok) {
      throw new Error();
    }
    setMembers(((await waitlist.json()) as { members: Member[] }).members);
    setReports(((await reports.json()) as { reports: Report[] }).reports);
    setBillingCases(((await billing.json()) as { cases: BillingCase[] }).cases);
  }
  useEffect(() => {
    void load().catch(() => {
      setMessage('Operator access required, or service unavailable.');
    });
  }, []);
  async function post(path: string, body: unknown) {
    setPending(true);
    setMessage('');
    try {
      const response = await fetch(`/api/operator/${path}`, {
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      const data = (await response.json()) as {
        invitations?: { email: string; language: string }[];
        sent?: number;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(data.error);
      }
      if (data.invitations) {
        setPreview(data.invitations);
      }
      if (data.sent !== undefined) {
        setMessage(`Sent ${data.sent} invitations.`);
        setBatch(null);
        setPreview([]);
        setSelection([]);
        setCapacity(false);
      }
      if (path === 'reports' || path === 'billing') {
        await load();
      }
    } catch (error) {
      setMessage(
        error instanceof Error && error.message
          ? error.message
          : 'Request failed. Retry the same batch.',
      );
    } finally {
      setPending(false);
    }
  }
  function prepare() {
    const id = batch ?? crypto.randomUUID();
    setBatch(id);
    void post('invitations/preview', { batchId: id, emails: selection, reissue });
  }
  return (
    <div className="site-shell">
      <Header />
      <main className="feature-page" style={{ margin: '3rem auto', maxWidth: 900, padding: 24 }}>
        <Link to="/account">Your account</Link>
        <h1>Beta invitations</h1>
        <p>
          Send at most ten invitations. Check Cloudflare and Resend usage before each batch.
          Delivery stops on the first failure.
        </p>
        <fieldset disabled={pending || Boolean(batch)}>
          <legend>Waitlist</legend>
          {members.map((member) => (
            <label key={member.email} style={{ display: 'block', padding: 8 }}>
              <input
                type="checkbox"
                checked={selection.includes(member.email)}
                disabled={
                  Boolean(member.redeemed_at) ||
                  (!selection.includes(member.email) && selection.length >= 10)
                }
                onChange={(event) => {
                  setSelection((current) =>
                    event.target.checked
                      ? [...current, member.email]
                      : current.filter((email) => email !== member.email),
                  );
                }}
              />{' '}
              {member.email} · {member.language} {member.redeemed_at ? '· Admitted' : ''}
            </label>
          ))}
        </fieldset>
        <label>
          <input
            type="checkbox"
            checked={reissue}
            disabled={pending || Boolean(batch)}
            onChange={(event) => {
              setReissue(event.target.checked);
            }}
          />{' '}
          Explicitly reissue pending invitations
        </label>
        <p>
          <Button
            disabled={pending || selection.length === 0 || preview.length > 0}
            onClick={prepare}
          >
            Preview batch
          </Button>
        </p>
        {preview.length > 0 && (
          <section>
            <h2>Review invitation batch</h2>
            <ul>
              {preview.map((entry) => (
                <li key={entry.email}>
                  {entry.email} · {entry.language}
                </li>
              ))}
            </ul>
            <p>
              Invitations expire seven days after this preview. Existing admitted accounts retain
              access.
            </p>
            <label>
              <input
                type="checkbox"
                checked={capacity}
                onChange={(event) => {
                  setCapacity(event.target.checked);
                }}
              />{' '}
              I checked Cloudflare and Resend capacity.
            </label>
            <p>
              <Button
                disabled={pending || !capacity}
                onClick={() =>
                  void post('invitations/send', { batchId: batch, capacityConfirmed: capacity })
                }
              >
                Send invitations
              </Button>{' '}
              <Button
                disabled={pending}
                onClick={() => {
                  setBatch(null);
                  setPreview([]);
                  setCapacity(false);
                }}
              >
                Cancel preview
              </Button>
            </p>
          </section>
        )}
        <h2>Fair-play reports</h2>
        <p>Review manually. A report does not establish cheating and does not reverse ratings.</p>
        {reports.map((report) => (
          <article key={report.id}>
            <p>
              {report.match_id} · {report.category} · {report.status}
            </p>
            <Button
              disabled={pending}
              onClick={() => void post('reports', { reportId: report.id, status: 'reviewed' })}
            >
              Mark reviewed
            </Button>{' '}
            <Button
              disabled={pending}
              onClick={() => void post('reports', { reportId: report.id, status: 'dismissed' })}
            >
              Dismiss
            </Button>
          </article>
        ))}
        <p role="status">{message}</p>
        <section aria-label="Billing review">
          <h2>Billing review</h2>
          <p>
            Review payment cases in Stripe. Marking reviewed does not refund money or change access.
          </p>
          {billingCases.map((item) => (
            <article key={item.id}>
              <p>
                {item.resource} · {item.reason}
              </p>
              {item.resolved_at ? (
                <p>Reviewed</p>
              ) : (
                <Button
                  disabled={pending}
                  onClick={() => void post('billing', { caseId: item.id })}
                >
                  Mark reviewed
                </Button>
              )}
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
