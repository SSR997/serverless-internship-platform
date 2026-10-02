import { useEffect, useState, useCallback } from 'react'

const API = 'http://localhost:8000' // change if your FastAPI runs elsewhere
// Must match the role values stored in your Users table exactly
const ROLES = { candidate: 'candidate', recruiter: 'recruiter' }
const STATUSES = ['Applied', 'Under review', 'Shortlisted', 'Selected', 'Rejected']

async function api(path, options = {}) {
  const token = localStorage.getItem('token')
  const res = await fetch(API + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  const data = await res.json().catch(() => ({}))
  // Expired or invalid session: clear it and go back to the sign-in screen
  if (res.status === 401 && token) {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    window.location.reload()
  }
  if (!res.ok) throw new Error(data.detail?.[0]?.msg || data.detail || 'Something went wrong')
  return data
}

/* ---------- small shared pieces ---------- */

function Field({ label, children }) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
    </div>
  )
}

function Modal({ children, onClose }) {
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true">{children}</div>
    </div>
  )
}

function Badge({ status }) {
  return <span className={`badge ${status.replace(' ', '-')}`}>{status}</span>
}

function Empty({ title, text }) {
  return (
    <div className="empty">
      <b>{title}</b>
      {text}
    </div>
  )
}

/* ---------- auth ---------- */

function Auth({ onLogin }) {
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ name: '', email: '', password: '', role: ROLES.candidate })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    try {
      const register = mode === 'register'
      const payload = register ? form : { email: form.email, password: form.password, role: form.role }
      const res = await api(register ? '/register' : '/login', { method: 'POST', body: JSON.stringify(payload) })
      onLogin(res.user, res.token)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-hero">
        <div className="brand">Intern<span>Hub</span></div>
        <h1>Find your first real work experience.</h1>
        <p className="sub">Students discover and apply to internships. Recruiters post roles and manage applicants in one place.</p>
      </div>
      <div className="auth-panel">
        <form className="auth-box" onSubmit={submit}>
          <h2>{mode === 'login' ? 'Sign in' : 'Create your account'}</h2>
          <p style={{ color: 'var(--ink-soft)', marginTop: 0 }}>
            {mode === 'login' ? 'Welcome back.' : 'It takes less than a minute.'}
          </p>
          {error && <div className="error">{error}</div>}
          {mode === 'register' && (
            <Field label="Full name">
              <input required value={form.name} onChange={set('name')} />
            </Field>
          )}
          <Field label="Email">
            <input type="email" required value={form.email} onChange={set('email')} />
          </Field>
          <Field label="Password">
            <input
              type="password" required minLength={mode === 'register' ? 8 : undefined}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              value={form.password} onChange={set('password')}
              placeholder={mode === 'register' ? 'At least 8 characters' : ''}
            />
          </Field>
          <Field label="I am a">
            <select value={form.role} onChange={set('role')}>
              <option value={ROLES.candidate}>Candidate</option>
              <option value={ROLES.recruiter}>Recruiter</option>
            </select>
          </Field>
          <button className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
          <p style={{ fontSize: 14, color: 'var(--ink-soft)' }}>
            {mode === 'login' ? 'New here? ' : 'Already registered? '}
            <button type="button" className="switch" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError('') }}>
              {mode === 'login' ? 'Create an account' : 'Sign in'}
            </button>
          </p>
        </form>
      </div>
    </div>
  )
}

/* ---------- internship card ---------- */

function InternshipCard({ item, actions }) {
  return (
    <div className="card">
      <h3>{item.title}</h3>
      <div className="company">{item.company}</div>
      <div className="facts">
        <span>{item.location}</span>
        <span><b>₹{Number(item.stipend).toLocaleString('en-IN')}</b> / month</span>
        <span>{item.duration}</span>
      </div>
      <p className="desc">{item.description}</p>
      <div className="tags">{(item.skills || []).map((s) => <span className="tag" key={s}>{s}</span>)}</div>
      <div className="card-actions">{actions}</div>
    </div>
  )
}

/* ---------- student ---------- */

function ApplyModal({ item, user, onClose, onDone }) {
  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email)
  const [file, setFile] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  function pickFile(e) {
    const f = e.target.files[0]
    setError('')
    if (f && f.type !== 'application/pdf') { setError('Resume must be a PDF file.'); e.target.value = ''; return setFile(null) }
    if (f && f.size > 5 * 1024 * 1024) { setError('Resume must be 5 MB or smaller.'); e.target.value = ''; return setFile(null) }
    setFile(f || null)
  }

  async function submit(e) {
    e.preventDefault()
    if (!file) return setError('Please attach your resume as a PDF.')
    setBusy(true)
    setError('')
    try {
      // 1) ask the backend for an upload slot, 2) upload the PDF straight to S3
      const up = await api('/resume-upload-url', { method: 'POST' })
      const fd = new FormData()
      Object.entries(up.fields).forEach(([k, v]) => fd.append(k, v))
      fd.append('file', file) // the file must come last
      const s3res = await fetch(up.url, { method: 'POST', body: fd })
      if (!s3res.ok) {
        // S3 replies with XML like <Code>AccessDenied</Code><Message>...</Message>
        const xml = await s3res.text()
        const code = xml.match(/<Code>(.*?)<\/Code>/)?.[1] || s3res.status
        const msg = xml.match(/<Message>(.*?)<\/Message>/)?.[1] || ''
        throw new Error(`S3 rejected the upload: ${code}. ${msg}`)
      }

      // 3) submit the application with the uploaded file's key
      const res = await api('/applications', {
        method: 'POST',
        body: JSON.stringify({ candidate_name: name, candidate_email: email, internship_id: item.id, resume_key: up.key }),
      })
      if (!res.application) throw new Error(res.message)
      onDone('Application submitted')
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <form onSubmit={submit}>
        <h2>Apply to {item.company}</h2>
        <p style={{ color: 'var(--ink-soft)', marginTop: 0 }}>{item.title}</p>
        {error && <div className="error">{error}</div>}
        <Field label="Full name"><input required value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Email"><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Resume (PDF, up to 5 MB)"><input type="file" accept="application/pdf" required onChange={pickFile} /></Field>
        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Submitting…' : 'Submit application'}</button>
        </div>
      </form>
    </Modal>
  )
}

function StudentView({ user, toast }) {
  const [tab, setTab] = useState('browse')
  const [internships, setInternships] = useState([])
  const [applications, setApplications] = useState([])
  const [query, setQuery] = useState('')
  const [applying, setApplying] = useState(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const [i, a] = await Promise.all([api('/internships'), api('/applications')])
      setInternships(i)
      setApplications(a.filter((x) => x.candidate_email.toLowerCase() === user.email.toLowerCase()))
    } catch (err) {
      toast(err.message)
    } finally {
      setLoading(false)
    }
  }, [user.email, toast])

  useEffect(() => { load() }, [load])

  const appliedIds = new Set(applications.map((a) => Number(a.internship_id)))
  const q = query.toLowerCase()
  const filtered = internships.filter((i) =>
    [i.title, i.company, i.location, ...(i.skills || [])].join(' ').toLowerCase().includes(q))
  const byId = Object.fromEntries(internships.map((i) => [Number(i.id), i]))

  return (
    <div className="page container">
      <div className="page-head">
        <div>
          <h1>Hi {user.name.split(' ')[0]}, find your internship</h1>
          <p className="sub">Browse open roles and track every application.</p>
        </div>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'browse' ? 'active' : ''}`} onClick={() => setTab('browse')}>Browse internships</button>
        <button className={`tab ${tab === 'mine' ? 'active' : ''}`} onClick={() => setTab('mine')}>My applications ({applications.length})</button>
      </div>

      {loading ? <Empty title="Loading…" text="" /> : tab === 'browse' ? (
        <>
          <input className="search" placeholder="Search by role, company, skill or location" value={query} onChange={(e) => setQuery(e.target.value)} />
          {filtered.length === 0 ? <Empty title="No internships found" text="Try a different search term." /> : (
            <div className="grid">
              {filtered.map((i) => (
                <InternshipCard key={i.id} item={i} actions={
                  appliedIds.has(Number(i.id))
                    ? <button className="btn btn-outline" disabled>Applied</button>
                    : <button className="btn btn-primary" onClick={() => setApplying(i)}>Apply now</button>
                } />
              ))}
            </div>
          )}
        </>
      ) : applications.length === 0 ? (
        <Empty title="No applications yet" text="Apply to an internship and it will show up here." />
      ) : (
        <div className="list">
          {applications.map((a) => (
            <div className="row" key={a.id}>
              <div>
                <b>{byId[Number(a.internship_id)]?.title || 'Internship removed'}</b>
                <small>{byId[Number(a.internship_id)]?.company}</small>
              </div>
              <Badge status={a.status} />
            </div>
          ))}
        </div>
      )}

      {applying && (
        <ApplyModal item={applying} user={user} onClose={() => setApplying(null)}
          onDone={(m) => { setApplying(null); toast(m); load() }} />
      )}
    </div>
  )
}

/* ---------- recruiter ---------- */

const EMPTY = { title: '', company: '', description: '', location: '', skills: '', stipend: '', duration: '' }

function InternshipForm({ initial, onClose, onDone }) {
  const editing = !!initial
  const [f, setF] = useState(editing ? { ...initial, skills: (initial.skills || []).join(', ') } : EMPTY)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const body = {
      title: f.title, company: f.company, description: f.description, location: f.location,
      duration: f.duration, stipend: Number(f.stipend),
      skills: f.skills.split(',').map((s) => s.trim()).filter(Boolean),
    }
    try {
      if (editing) await api(`/internships/${initial.id}`, { method: 'PUT', body: JSON.stringify(body) })
      else await api('/internships', { method: 'POST', body: JSON.stringify(body) })
      onDone(editing ? 'Internship updated' : 'Internship posted')
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <Modal onClose={onClose}>
      <form onSubmit={submit}>
        <h2>{editing ? 'Edit internship' : 'Post an internship'}</h2>
        <p style={{ color: 'var(--ink-soft)', marginTop: 0 }}>Students will see this listing right away.</p>
        {error && <div className="error">{error}</div>}
        <div className="two">
          <Field label="Title"><input required value={f.title} onChange={set('title')} /></Field>
          <Field label="Company"><input required value={f.company} onChange={set('company')} /></Field>
        </div>
        <Field label="Description"><textarea required value={f.description} onChange={set('description')} /></Field>
        <div className="two">
          <Field label="Location"><input required value={f.location} onChange={set('location')} placeholder="Chennai or Remote" /></Field>
          <Field label="Duration"><input required value={f.duration} onChange={set('duration')} placeholder="3 months" /></Field>
        </div>
        <div className="two">
          <Field label="Stipend (₹ per month)"><input type="number" min="0" required value={f.stipend} onChange={set('stipend')} /></Field>
          <Field label="Skills (comma separated)"><input value={f.skills} onChange={set('skills')} placeholder="React, Python" /></Field>
        </div>
        <div className="modal-actions">
          <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : editing ? 'Save changes' : 'Post internship'}</button>
        </div>
      </form>
    </Modal>
  )
}

function ApplicantsModal({ item, onClose, toast }) {
  const [apps, setApps] = useState(null)

  useEffect(() => {
    api(`/internships/${item.id}/applications`).then(setApps).catch((e) => toast(e.message))
  }, [item.id, toast])

  async function viewResume(id) {
    const tab = window.open('', '_blank') // open first so the popup blocker allows it
    try {
      const { url } = await api(`/applications/${id}/resume`)
      tab.location = url
    } catch (err) {
      tab.close()
      toast(err.message)
    }
  }

  async function changeStatus(id, status) {
    try {
      await api(`/applications/${id}/status?status=${encodeURIComponent(status)}`, { method: 'PUT' })
      setApps((list) => list.map((a) => (a.id === id ? { ...a, status } : a)))
      toast('Status updated')
    } catch (err) {
      toast(err.message)
    }
  }

  return (
    <Modal onClose={onClose}>
      <h2>Applicants</h2>
      <p style={{ color: 'var(--ink-soft)', marginTop: 0 }}>{item.title} at {item.company}</p>
      {apps === null ? <p>Loading…</p> : apps.length === 0 ? (
        <p style={{ color: 'var(--ink-soft)' }}>No one has applied yet.</p>
      ) : (
        <div className="list">
          {apps.map((a) => (
            <div className="row" key={a.id} style={{ border: '1px solid #e1e8f7' }}>
              <div>
                <b>{a.candidate_name}</b>
                <small>{a.candidate_email}</small>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {a.resume_key
                  ? <button className="btn btn-outline btn-sm" onClick={() => viewResume(a.id)}>View resume</button>
                  : <small>No resume</small>}
                <select className="status-select" value={a.status} onChange={(e) => changeStatus(a.id, e.target.value)}>
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="modal-actions" style={{ marginTop: 18 }}>
        <button className="btn btn-outline" onClick={onClose}>Close</button>
      </div>
    </Modal>
  )
}

function RecruiterView({ toast }) {
  const [internships, setInternships] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(null) // null | 'new' | internship
  const [viewing, setViewing] = useState(null)

  const load = useCallback(async () => {
    try {
      setInternships(await api('/internships'))
    } catch (err) {
      toast(err.message)
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { load() }, [load])

  async function remove(item) {
    if (!window.confirm(`Delete "${item.title}"? This can't be undone.`)) return
    try {
      await api(`/internships/${item.id}`, { method: 'DELETE' })
      toast('Internship deleted')
      load()
    } catch (err) {
      toast(err.message)
    }
  }

  return (
    <div className="page container">
      <div className="page-head">
        <div>
          <h1>Your internship listings</h1>
          <p className="sub">Post roles, review applicants and update their status.</p>
        </div>
        <button className="btn btn-primary" onClick={() => setForm('new')}>Post internship</button>
      </div>

      {loading ? <Empty title="Loading…" text="" /> : internships.length === 0 ? (
        <Empty title="No internships posted" text="Post your first internship to start receiving applications." />
      ) : (
        <div className="grid">
          {internships.map((i) => (
            <InternshipCard key={i.id} item={i} actions={
              <>
                <button className="btn btn-primary btn-sm" onClick={() => setViewing(i)}>View applicants</button>
                <button className="btn btn-outline btn-sm" onClick={() => setForm(i)}>Edit</button>
                <button className="btn btn-danger btn-sm" onClick={() => remove(i)}>Delete</button>
              </>
            } />
          ))}
        </div>
      )}

      {form && (
        <InternshipForm initial={form === 'new' ? null : form} onClose={() => setForm(null)}
          onDone={(m) => { setForm(null); toast(m); load() }} />
      )}
      {viewing && <ApplicantsModal item={viewing} onClose={() => setViewing(null)} toast={toast} />}
    </div>
  )
}

/* ---------- app shell ---------- */

export default function App() {
  const [user, setUser] = useState(() => {
    try { return localStorage.getItem('token') ? JSON.parse(localStorage.getItem('user')) : null } catch { return null }
  })
  const [message, setMessage] = useState('')

  const toast = useCallback((m) => {
    setMessage(m)
    setTimeout(() => setMessage(''), 2500)
  }, [])

  const login = (u, t) => { localStorage.setItem('user', JSON.stringify(u)); localStorage.setItem('token', t); setUser(u) }
  const logout = () => { localStorage.removeItem('user'); localStorage.removeItem('token'); setUser(null) }

  if (!user) return <Auth onLogin={login} />

  return (
    <div className="app">
      <header className="nav">
        <div className="container nav-inner">
          <div className="brand">Intern<span>Hub</span></div>
          <div className="nav-right">
            <span><b>{user.name}</b></span>
            <span className="pill">{user.role}</span>
            <button className="btn btn-ghost btn-sm" onClick={logout}>Sign out</button>
          </div>
        </div>
      </header>
      {user.role === ROLES.recruiter ? <RecruiterView toast={toast} /> : <StudentView user={user} toast={toast} />}
      {message && <div className="toast" role="status">{message}</div>}
    </div>
  )
}
