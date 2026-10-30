import { useEffect, useState } from 'react';
import { Link } from 'react-router';
type Member = { email: string; language: string; redeemed_at: number | null; expires_at: number | null };
type Report = { id: string; match_id: string; category: string; status: string };
export function Operator() {
  const [members, setMembers] = useState<Member[]>([]), [reports, setReports] = useState<Report[]>([]), [selection, setSelection] = useState<string[]>([]);
  const [batch, setBatch] = useState<string | null>(null), [preview, setPreview] = useState<{ email: string; language: string }[]>([]), [capacity, setCapacity] = useState(false), [pending, setPending] = useState(false), [message, setMessage] = useState('');
  const [reissue, setReissue] = useState(false);
  async function load() {
    const [waitlist, reports] = await Promise.all([fetch('/api/operator/waitlist'), fetch('/api/operator/reports')]);
    if (!waitlist.ok || !reports.ok) throw new Error();
    setMembers((await waitlist.json() as { members: Member[] }).members);
    setReports((await reports.json() as { reports: Report[] }).reports);
  }
  useEffect(() => { void load().catch(() => setMessage('Operator access required, or service unavailable.')); }, []);
  async function post(path: string, body: unknown) {
    setPending(true); setMessage('');
    try {
      const response = await fetch(`/api/operator/${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json() as { invitations?: { email: string; language: string }[]; sent?: number; error?: string };
      if (!response.ok) throw new Error(data.error);
      if (data.invitations) setPreview(data.invitations);
      if (data.sent !== undefined) { setMessage(`Sent ${data.sent} invitations.`); setBatch(null); setPreview([]); setSelection([]); setCapacity(false); }
      if (path === 'reports') await load();
    } catch (error) { setMessage(error instanceof Error && error.message ? error.message : 'Request failed. Retry the same batch.'); } finally { setPending(false); }
  }
  function prepare() { const id = batch ?? crypto.randomUUID(); setBatch(id); void post('invitations/preview', { batchId: id, emails: selection, reissue }); }
  return <main style={{ maxWidth: 900, padding: 24, margin: '3rem auto' }}><Link to="/account">Your account</Link><h1>Beta invitations</h1>
    <p>Send at most ten invitations. Check Cloudflare and Resend usage before each batch. Delivery stops on the first failure.</p>
    <fieldset disabled={pending || !!batch}><legend>Waitlist</legend>{members.map((member) => <label key={member.email} style={{ display: 'block', padding: 8 }}><input type="checkbox" checked={selection.includes(member.email)} disabled={!!member.redeemed_at || (!selection.includes(member.email) && selection.length >= 10)} onChange={(event) => setSelection((current) => event.target.checked ? [...current, member.email] : current.filter((email) => email !== member.email))} /> {member.email} · {member.language} {member.redeemed_at ? '· Admitted' : ''}</label>)}</fieldset>
    <label><input type="checkbox" checked={reissue} disabled={pending || !!batch} onChange={(event) => setReissue(event.target.checked)} /> Explicitly reissue pending invitations</label><p><button disabled={pending || selection.length === 0 || preview.length > 0} onClick={prepare}>Preview batch</button></p>
    {preview.length > 0 && <section><h2>Review invitation batch</h2><ul>{preview.map((entry) => <li key={entry.email}>{entry.email} · {entry.language}</li>)}</ul><p>Invitations expire seven days after this preview. Existing admitted accounts retain access.</p><label><input type="checkbox" checked={capacity} onChange={(event) => setCapacity(event.target.checked)} /> I checked Cloudflare and Resend capacity.</label><p><button disabled={pending || !capacity} onClick={() => void post('invitations/send', { batchId: batch, capacityConfirmed: capacity })}>Send invitations</button> <button disabled={pending} onClick={() => { setBatch(null); setPreview([]); setCapacity(false); }}>Cancel preview</button></p></section>}
    <h2>Fair-play reports</h2><p>Review manually. A report does not establish cheating and does not reverse ratings.</p>{reports.map((report) => <article key={report.id}><p>{report.match_id} · {report.category} · {report.status}</p><button disabled={pending} onClick={() => void post('reports', { reportId: report.id, status: 'reviewed' })}>Mark reviewed</button> <button disabled={pending} onClick={() => void post('reports', { reportId: report.id, status: 'dismissed' })}>Dismiss</button></article>)}<p role="status">{message}</p>
  </main>;
}
