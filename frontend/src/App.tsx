import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, ArrowUpRight, CheckCircle2, ChevronRight, ClipboardList, CreditCard, LayoutDashboard, LoaderCircle, LogOut, PackageCheck, Plus, Printer, RefreshCw, Search, Users, Wallet, X } from 'lucide-react';
import { getSession, login, logout, onExpired, request } from './api';
import type { Customer, Dashboard, Order, Payment, Service, Session } from './types';
import { dateLabel, money, statusLabel, statuses } from './types';
import { Empty, OrderTable, StatusPill } from './ui';
import { CustomerForm, OrderDetails, OrderForm, PaymentForm } from './forms';
import { Catalog, ServiceForm } from './Catalog';

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState('operator');
  const [password, setPassword] = useState('DemoPass123!');
  const [showPassword, setShowPassword] = useState(false);
  const generation = useRef(0);
  const inFlight = useRef(false);
  const check = useCallback(async () => {
    const attempt = ++generation.current;
    setChecking(true); setError('');
    try { const current = await getSession(); if (attempt === generation.current) setSession(current); }
    catch (error) { if (attempt === generation.current) setError(error instanceof Error ? error.message : 'Could not connect to the workspace.'); }
    finally { if (attempt === generation.current) setChecking(false); }
  }, []);
  useEffect(() => {
    void check();
    const unsubscribe = onExpired(() => { generation.current++; setChecking(false); setSession(null); setPassword(''); setNotice('Your session has ended. Sign in again to continue.'); });
    return () => { generation.current++; unsubscribe(); };
  }, [check]);
  const signIn = async (event: FormEvent) => {
    event.preventDefault(); if (inFlight.current) return;
    inFlight.current = true; const attempt = ++generation.current; setBusy(true); setError('');
    try { const current = await login(username.trim(), password); if (attempt === generation.current) { setSession(current); setPassword(''); setNotice(''); } }
    catch (error) { setError(error instanceof Error ? error.message : 'Sign-in failed. Try again.'); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const signOut = async () => {
    if (inFlight.current) return;
    inFlight.current = true; const attempt = ++generation.current; setBusy(true); setError('');
    try { const current = await logout(); if (attempt === generation.current) { setSession(current); setNotice('You have signed out.'); } }
    catch (error) { setError(error instanceof Error ? error.message : 'Sign-out failed. Try again.'); }
    finally { inFlight.current = false; setBusy(false); }
  };
  if (!checking && session?.authenticated) return <Workspace session={session} onLogout={signOut} signingOut={busy} authError={error} />;
  return <main className="login-page"><section className="login-story"><a className="brand" href="/" aria-label="PressFlow home"><span className="brand-mark"><Printer size={24} /></span>PressFlow<span className="brand-dot">.</span></a><span className="eyebrow light">Made for the work behind the print</span><h1>Great print starts<br />with a clear plan.</h1><p>Keep your customers, production jobs, and payment records moving together. One calm workspace for a busy print studio.</p><div className="story-flow">{['Brief', 'Design', 'Print', 'Deliver'].map((stage, index) => <span key={stage}><i>{index + 1}</i>{stage}{index < 3 && <ChevronRight size={16} />}</span>)}</div><div className="story-note"><span className="note-dot" />Portfolio demo · Fictional business data</div></section><section className="login-panel"><div className="login-card"><span className="eyebrow">Your studio, in sync</span><h2>Welcome to PressFlow</h2><p className="muted">Sign in to your production workspace.</p>{notice && <div className="alert" role="status">{notice}</div>}{checking ? <div className="loading-state" role="status"><LoaderCircle className="spin" />Checking your session…</div> : error && !session ? <><div className="alert error" role="alert">{error}</div><button className="button primary" onClick={() => void check()}>Retry connection</button></> : <form className="form-stack" onSubmit={signIn}>{error && <div className="alert error" role="alert">{error}</div>}<label>Username<input name="username" autoComplete="username" value={username} onChange={event => setUsername(event.target.value)} required disabled={busy} maxLength={100} /></label><label>Password<div className="password-field"><input name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required disabled={busy} /><button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? 'Hide' : 'Show'}</button></div></label><button className="button primary full-width" disabled={busy || !username.trim() || !password}>{busy ? <LoaderCircle size={17} className="spin" /> : <ArrowRight size={17} />}{busy ? 'Signing in…' : 'Open workspace'}</button><div className="demo-account"><strong>Explore the local demo</strong><p>Use fictional records while testing.</p><button type="button" className="text-button" disabled={busy} onClick={() => { setUsername('operator'); setPassword('DemoPass123!'); setError(''); }}>Use demo account <ArrowUpRight size={14} /></button></div></form>}<p className="login-footnote">A print studio management project · Customer and payment details are demo records.</p></div></section></main>;
}

type Tab = 'overview' | 'orders' | 'catalog' | 'customers' | 'payments';
type Modal = { kind: 'order'; serviceId?: number } | { kind: 'service'; serviceId?: number } | { kind: 'customer' } | { kind: 'payment'; orderId?: number } | { kind: 'detail'; orderId: number } | null;
type Data = { dashboard: Dashboard; orders: Order[]; customers: Customer[]; services: Service[]; payments: Payment[] };
const nav = [{ id: 'overview', label: 'Overview', icon: LayoutDashboard }, { id: 'orders', label: 'Orders', icon: ClipboardList }, { id: 'catalog', label: 'Catalog', icon: Printer }, { id: 'customers', label: 'Customers', icon: Users }, { id: 'payments', label: 'Payments', icon: CreditCard }] as const;
const headings: Record<Tab, { title: string; detail: string }> = { overview: { title: 'Production overview', detail: 'A clear view of your studio. Every job, every stage.' }, orders: { title: 'Print orders', detail: 'From first brief to final delivery. Keep the work moving.' }, customers: { title: 'Your customers', detail: 'The people and businesses behind every print job.' }, catalog: { title: 'Print catalog', detail: 'Your services, specifications, and standard unit prices.' }, payments: { title: 'Payment records', detail: 'Track fictional receipts and outstanding order balances.' } };

function Workspace({ session, onLogout, signingOut, authError }: { session: Session; onLogout: () => Promise<void>; signingOut: boolean; authError: string }) {
  const [tab, setTab] = useState<Tab>('overview');
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [updated, setUpdated] = useState('');
  const [modal, setModal] = useState<Modal>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('ALL');
  const generation = useRef(0);
  const refresh = useCallback(async () => {
    const attempt = ++generation.current;
    setLoading(true); setError('');
    try {
      const [dashboard, orders, customers, services, payments] = await Promise.all([request<Dashboard>('/dashboard'), request<Order[]>('/orders'), request<Customer[]>('/customers'), request<Service[]>('/services'), request<Payment[]>('/payments')]);
      if (attempt !== generation.current) return;
      setData({ dashboard, orders, customers, services, payments });
      setUpdated(new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    } catch (error) { if (attempt === generation.current) setError(error instanceof Error ? error.message : 'Could not refresh records. Try again.'); }
    finally { if (attempt === generation.current) setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); return () => { generation.current++; }; }, [refresh]);
  const saved = async () => { setNotice('Your change has been saved.'); await refresh(); };
  const select = (next: Tab) => { setTab(next); setQuery(''); setStatus('ALL'); };
  const openOrder = (order: Order) => setModal({ kind: 'detail', orderId: order.id });
  const currentOrder = modal?.kind === 'detail' ? data?.orders.find(order => order.id === modal.orderId) : undefined;
  const search = query.trim().toLowerCase();
  const orders = data?.orders.filter(order => (status === 'ALL' || order.status === status) && `${order.reference} ${order.title} ${order.customerName}`.toLowerCase().includes(search)) || [];
  const customers = data?.customers.filter(customer => `${customer.name} ${customer.email} ${customer.phone} ${customer.company}`.toLowerCase().includes(search)) || [];
  const services = data?.services.filter(service => (service.name + ' ' + service.description).toLowerCase().includes(search)) || [];
  const payments = data?.payments.filter(payment => `${payment.orderReference} ${payment.customerName} ${payment.method} ${payment.reference}`.toLowerCase().includes(search)) || [];
  const person = session.user?.displayName || session.user?.username || 'Studio operator';
  return <div className="app-shell"><aside className="sidebar"><a href="/" className="brand"><span className="brand-mark"><Printer size={22} /></span>PressFlow<span className="brand-dot">.</span></a><div className="workspace-label"><span className="workspace-avatar">PS</span><div>Print studio<small>Demo workspace</small></div><span className="workspace-badge">Local</span></div><span className="nav-caption">Workspace</span><nav aria-label="Main navigation">{nav.map(item => <button key={item.id} onClick={() => select(item.id)} className={tab === item.id ? 'nav-item active' : 'nav-item'} aria-current={tab === item.id ? 'page' : undefined}><item.icon size={19} /><span>{item.label}</span>{item.id === 'orders' && !!data?.dashboard.activeOrders && <i>{data.dashboard.activeOrders}</i>}</button>)}</nav><div className="sidebar-bottom"><div className="studio-note"><span className="note-dot" /><strong>Room to make great work.</strong><p>Keep the queue clear and the press moving.</p></div><button className="user-button" onClick={() => void onLogout()} disabled={signingOut} aria-label="Sign out of PressFlow"><span className="user-avatar">{person.slice(0, 2).toUpperCase()}</span><span>{person}<small>{signingOut ? 'Signing out…' : 'Sign out'}</small></span><LogOut size={16} /></button></div></aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumb">Workspace<ChevronRight size={14} /><strong>{headings[tab].title}</strong></div><div className="topbar-actions"><span className="demo-tag"><span />Fictional data</span><button className="icon-button" aria-label="Refresh workspace" disabled={loading} onClick={() => void refresh()}><RefreshCw size={18} className={loading ? 'spin' : ''} /></button><button className="mobile-signout icon-button" aria-label="Sign out" disabled={signingOut} onClick={() => void onLogout()}><LogOut size={18} /></button></div></header>
      <main id="main-content" className="main-content"><header className="page-heading"><div><span className="eyebrow">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</span><h1>{headings[tab].title}</h1><p>{headings[tab].detail}</p></div><button className="button primary" disabled={!data} onClick={() => setModal({ kind: tab === 'catalog' ? 'service' : tab === 'customers' ? 'customer' : tab === 'payments' ? 'payment' : 'order' })}><Plus size={18} />{tab === 'catalog' ? 'Add service' : tab === 'customers' ? 'Add customer' : tab === 'payments' ? 'Record payment' : 'New order'}</button></header>
      {notice && <div className="alert success" role="status"><CheckCircle2 size={18} /><span>{notice}</span><button className="icon-button" aria-label="Dismiss notification" onClick={() => setNotice('')}><X size={16} /></button></div>}
      {(error || authError) && <div className="alert error" role="alert"><span>{error || authError}</span><button className="text-button" disabled={loading} onClick={() => void refresh()}>Refresh records</button></div>}
      {!data ? loading ? <div className="loading-state" role="status"><LoaderCircle className="spin" />Loading your studio…</div> : <Empty title="Workspace unavailable" detail="Your records could not be loaded. Check the backend connection and refresh." action={<button className="button secondary" onClick={() => void refresh()}>Try again</button>} /> : <>
        {tab === 'overview' && <><div className="metric-grid">{[{ label: 'Active orders', value: data.dashboard.activeOrders.toString(), detail: 'Jobs in the production queue', icon: ClipboardList, tone: 'purple' }, { label: 'Ready to deliver', value: data.dashboard.readyOrders.toString(), detail: 'Completed and awaiting handover', icon: PackageCheck, tone: 'green' }, { label: 'Recorded revenue', value: money(data.dashboard.totalRevenueCents), detail: 'Fictional payment receipts', icon: Wallet, tone: 'blue' }, { label: 'Outstanding', value: money(data.dashboard.outstandingCents), detail: 'Remaining order balances', icon: CreditCard, tone: 'amber' }].map(metric => <article className="metric-card" key={metric.label}><div><span>{metric.label}</span><span className={`metric-icon ${metric.tone}`}><metric.icon size={19} /></span></div><strong>{metric.value}</strong><p>{metric.detail}</p></article>)}</div><div className="overview-grid"><section className="panel production-panel"><div className="panel-heading"><div><h2>Production at a glance</h2><p>{data.orders.length ? 'Where each job stands right now.' : 'Your production stages are ready for the first job.'}</p></div><span className="quiet-badge">{data.dashboard.activeOrders} active</span></div><div className="stage-grid">{statuses.filter(stage => !['DELIVERED', 'CANCELLED'].includes(stage)).map((stage, index) => <button key={stage} className="stage-card" onClick={() => { select('orders'); setStatus(stage); }}><span className="stage-step">0{index + 1}</span><strong>{data.dashboard.statusCounts[stage] || 0}</strong><span>{statusLabel(stage)}</span><div className="stage-bar"><i style={{ width: `${Math.min(100, (data.dashboard.statusCounts[stage] || 0) / Math.max(1, data.dashboard.activeOrders) * 100)}%` }} /></div></button>)}</div></section><section className="panel studio-summary quick-start" aria-labelledby="quickStartTitle"><div className="quick-start-heading"><span className="summary-icon" aria-hidden="true"><Printer size={21} /></span><div><span className="eyebrow">Quick start</span><h2 id="quickStartTitle">A good place to begin.</h2></div></div><p>Everything you need for your next print job.</p><ol className="quick-start-list"><li><button onClick={() => select('customers')} aria-label="Open customer directory"><span className={data.customers.length ? 'check-step ready' : 'check-step'} aria-hidden="true">{data.customers.length ? <CheckCircle2 size={19} /> : <Users size={18} />}</span><span><strong>Choose a customer</strong><small>{data.customers.length ? data.customers.length + ' contacts ready' : 'Add your first contact'}</small></span><ChevronRight size={16} aria-hidden="true" /></button></li><li><button onClick={() => select('catalog')} aria-label="Explore print catalog"><span className={data.services.some(service => service.active !== false) ? 'check-step ready' : 'check-step'} aria-hidden="true">{data.services.some(service => service.active !== false) ? <CheckCircle2 size={19} /> : <Printer size={18} />}</span><span><strong>Explore print services</strong><small>Specifications and unit prices</small></span><ChevronRight size={16} aria-hidden="true" /></button></li><li><button onClick={() => setModal({ kind: 'order' })} aria-label="Start a print order"><span className="check-step" aria-hidden="true"><Plus size={19} /></span><span><strong>Create an order</strong><small>Turn the brief into a plan</small></span><ChevronRight size={16} aria-hidden="true" /></button></li></ol></section></div><section className="panel"><div className="panel-heading"><div><h2>Recent orders</h2><p>The latest work in your studio.</p></div><button className="text-button" onClick={() => select('orders')}>All orders<ArrowUpRight size={16} /></button></div>{data.dashboard.recentOrders.length ? <OrderTable orders={data.dashboard.recentOrders} onOpen={openOrder} /> : <Empty title="Your first print job starts here" detail="Choose a customer and a print service. We’ll help you turn the details into a clear production plan." icon={<Printer size={28} />} action={<button className="button primary" onClick={() => setModal({ kind: 'order' })}><Plus size={17} />Create your first order</button>} />}</section></>}
        {tab !== 'overview' && <section className="panel"><div className="list-toolbar"><label className="search-box"><Search size={18} /><input aria-label={`Search ${tab}`} placeholder={`Search ${tab}…`} value={query} onChange={event => setQuery(event.target.value)} />{query && <button className="icon-button" aria-label="Clear search" onClick={() => setQuery('')}><X size={15} /></button>}</label>{tab === 'orders' && <label className="filter-select"><span className="sr-only">Filter order status</span><select value={status} onChange={event => setStatus(event.target.value)}><option value="ALL">All stages</option>{statuses.map(stage => <option key={stage} value={stage}>{statusLabel(stage)}</option>)}</select></label>}<span className="result-count">{tab === 'catalog' ? services.length : tab === 'orders' ? orders.length : tab === 'customers' ? customers.length : payments.length} {tab}</span></div>
        {tab === 'catalog' && <Catalog services={services} query="" onEdit={service => setModal({ kind: 'service', serviceId: service?.id })} onCreate={service => setModal({ kind: 'order', serviceId: service.id })} />}
        {tab === 'orders' && (orders.length ? <OrderTable orders={orders} onOpen={openOrder} /> : <Empty title="No orders found" detail="Try a different search or create a new print order." />)}
        {tab === 'customers' && (customers.length ? <div className="table-scroll"><table><thead><tr><th scope="col">Customer</th><th scope="col">Company</th><th scope="col">Email</th><th scope="col">Phone</th></tr></thead><tbody>{customers.map(customer => <tr key={customer.id}><td><div className="customer-name"><span className="customer-avatar">{customer.name.split(' ').map(part => part[0]).slice(0, 2).join('')}</span><strong>{customer.name}</strong></div></td><td>{customer.company || '—'}</td><td><a className="contact-link" href={`mailto:${customer.email}`}>{customer.email}</a></td><td>{customer.phone}</td></tr>)}</tbody></table></div> : <Empty title="No customers found" detail="Try another search or add a fictional customer to the directory." />)}
        {tab === 'payments' && <><div className="inline-note">Demo bookkeeping only. These records do not process or move money.</div>{payments.length ? <div className="table-scroll"><table><thead><tr><th scope="col">Order</th><th scope="col">Customer</th><th scope="col">Method</th><th scope="col">Date</th><th scope="col">Reference</th><th scope="col" className="align-right">Amount</th></tr></thead><tbody>{payments.map(payment => <tr key={payment.id}><td><button className="table-link" onClick={() => setModal({ kind: 'detail', orderId: payment.orderId })}>{payment.orderReference}</button></td><td>{payment.customerName}</td><td><span className="quiet-badge">{statusLabel(payment.method)}</span></td><td className="nowrap">{dateLabel(payment.createdAt)}</td><td>{payment.reference || '—'}</td><td className="align-right"><strong>{money(payment.amountCents)}</strong></td></tr>)}</tbody></table></div> : <Empty title="No payment records found" detail="Record a fictional payment against an outstanding order." />}</>}
        </section>}
        <footer className="workspace-footer"><span>PressFlow · Print studio workspace</span><span>{loading ? 'Refreshing records…' : `Updated ${updated}`}</span></footer>
      </>}
      </main>
    </div>
    {data && modal?.kind === 'order' && <OrderForm customers={data.customers} services={data.services.filter(service => service.active !== false)} initialServiceId={modal.serviceId} onClose={() => setModal(null)} onSaved={saved} />}
    {data && modal?.kind === 'service' && <ServiceForm service={data.services.find(service => service.id === modal.serviceId)} onClose={() => setModal(null)} onSaved={saved} />}
    {modal?.kind === 'customer' && <CustomerForm onClose={() => setModal(null)} onSaved={saved} />}
    {data && modal?.kind === 'payment' && <PaymentForm orders={data.orders} orderId={modal.orderId} onClose={() => setModal(null)} onSaved={saved} />}
    {currentOrder && <OrderDetails order={currentOrder} onClose={() => setModal(null)} onSaved={saved} onPayment={() => setModal({ kind: 'payment', orderId: currentOrder.id })} />}
  </div>;
}
export default App;
