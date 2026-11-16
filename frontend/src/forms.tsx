import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowRight, Check, CreditCard, LoaderCircle } from 'lucide-react';
import { ApiError, request } from './api';
import type { Customer, Order, Service } from './types';
import { dateLabel, money, nextStatus, statusLabel, statuses } from './types';
import { Drawer, StatusPill } from './ui';

const today = () => new Date().toLocaleDateString('en-CA');
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'The action could not be completed. Please try again.';
export function OrderForm({ customers, services, initialServiceId, onClose, onSaved }: { customers: Customer[]; services: Service[]; initialServiceId?: number; onClose: () => void; onSaved: () => Promise<void> }) {
  const [customerId, setCustomerId] = useState('');
  const [serviceId, setServiceId] = useState((services.find(service => service.id === initialServiceId) || services[0])?.id.toString() || '');
  const [title, setTitle] = useState('');
  const [quantity, setQuantity] = useState('100');
  const [paper, setPaper] = useState('PLAIN');
  const [lamination, setLamination] = useState(false);
  const [dueDate, setDueDate] = useState(today());
  const [quote, setQuote] = useState<{ unitPriceCents: number; totalCents: number } | null>(null);
  const [quoteError, setQuoteError] = useState('');
  const [quoting, setQuoting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const requestIdentity = useRef({ key: '', id: '' });
  const quoteGeneration = useRef(0);
  const [quoteAttempt, setQuoteAttempt] = useState(0);
  const count = Number(quantity);
  const quantityValid = Number.isInteger(count) && count >= 1 && count <= 10000;
  useEffect(() => {
    const generation = ++quoteGeneration.current;
    setQuote(null);
    setQuoteError('');
    if (!serviceId || !quantityValid) { setQuoting(false); return; }
    setQuoting(true);
    const timer = window.setTimeout(() => {
      void request<{ unitPriceCents: number; totalCents: number }>('/quote', { serviceId: Number(serviceId), quantity: count, paper, lamination }).then(result => {
        if (generation === quoteGeneration.current) setQuote(result);
      }).catch(error => { if (generation === quoteGeneration.current) setQuoteError(errorMessage(error)); }).finally(() => { if (generation === quoteGeneration.current) setQuoting(false); });
    }, 300);
    return () => { window.clearTimeout(timer); quoteGeneration.current++; };
  }, [serviceId, count, quantityValid, paper, lamination, quoteAttempt]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (inFlight.current || !quote || !quantityValid || !customerId || !title.trim()) return;
    const payload = { customerId: Number(customerId), serviceId: Number(serviceId), title: title.trim(), quantity: count, paper, lamination, dueDate };
    const key = JSON.stringify(payload);
    if (requestIdentity.current.key !== key) requestIdentity.current = { key, id: crypto.randomUUID() };
    inFlight.current = true; setBusy(true); setError('');
    try { await request('/orders', { ...payload, requestId: requestIdentity.current.id }); await onSaved(); onClose(); }
    catch (error) { setError(errorMessage(error)); }
    finally { inFlight.current = false; setBusy(false); }
  };
  return <Drawer title="Create a print order" eyebrow="New production job" onClose={onClose} busy={busy}><form onSubmit={submit} className="form-stack">
    <p className="muted">Set the specifications. Your price is calculated by the server before the order is saved.</p>
    {error && <div className="alert error" role="alert">{error}</div>}
    {!customers.length && <div className="alert">Add a customer in the Customers tab before creating an order.</div>}
    {!services.length && <div className="alert">Add or activate a service in the Catalog before creating an order.</div>}
    <label>Customer<select value={customerId} onChange={event => setCustomerId(event.target.value)} required disabled={busy}><option value="">Select a customer</option>{customers.map(customer => <option key={customer.id} value={customer.id}>{customer.name}{customer.company ? ` · ${customer.company}` : ''}</option>)}</select></label>
    <label>Job title<input value={title} onChange={event => setTitle(event.target.value)} maxLength={120} placeholder="e.g. Spring collection brochure" required disabled={busy} /></label>
    <label>Print service<select value={serviceId} onChange={event => setServiceId(event.target.value)} required disabled={busy}>{services.map(service => <option key={service.id} value={service.id}>{service.name}</option>)}</select></label>
    <p className="field-help">{services.find(service => service.id === Number(serviceId))?.description}</p>
    <div className="form-grid"><label>Quantity<input type="number" min="1" max="10000" step="1" value={quantity} onChange={event => setQuantity(event.target.value)} required disabled={busy} /></label><label>Paper<select value={paper} onChange={event => setPaper(event.target.value)} disabled={busy}><option value="PLAIN">Standard stock</option><option value="PREMIUM">Premium stock (+20%)</option></select></label></div>
    <label className="checkbox-card"><input type="checkbox" checked={lamination} onChange={event => setLamination(event.target.checked)} disabled={busy} /><span><strong>Add lamination</strong><small>Protective finish · {money(2000)} per unit</small></span></label>
    <label>Due date<input type="date" min={today()} value={dueDate} onChange={event => setDueDate(event.target.value)} required disabled={busy} /></label>
    <section className="quote-box" aria-live="polite"><div><span className="eyebrow">Order estimate</span><p>{quoting ? 'Calculating your price…' : quote ? `${money(quote.unitPriceCents)} per unit` : 'Enter a valid quantity to get a quote.'}</p></div><strong>{quote ? money(quote.totalCents) : '—'}</strong></section>
    {quoteError && <div className="alert error" role="alert">{quoteError}<button type="button" className="text-button" onClick={() => setQuoteAttempt(value => value + 1)}>Retry quote</button></div>}
    <div className="form-actions"><button type="button" className="button secondary" onClick={onClose} disabled={busy}>Cancel</button><button className="button primary" disabled={busy || quoting || !quote || !customers.length}>{busy ? <LoaderCircle className="spin" size={17} /> : <Check size={17} />}{busy ? 'Saving order…' : 'Create order'}</button></div>
  </form></Drawer>;
}

export function CustomerForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => Promise<void> }) {
  const [fields, setFields] = useState({ name: '', email: '', phone: '', company: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try { await request('/customers', Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value.trim()]))); await onSaved(); onClose(); }
    catch (error) { setError(errorMessage(error)); }
    finally { inFlight.current = false; setBusy(false); }
  };
  return <Drawer title="Add a customer" eyebrow="Customer directory" onClose={onClose} busy={busy}><form className="form-stack" onSubmit={submit}><p className="muted">Keep contact details ready for the next print job. Use fictional information in this demo.</p>{error && <div className="alert error" role="alert">{error}</div>}{(['name', 'email', 'phone', 'company'] as const).map(key => <label key={key}>{({ name: 'Full name', email: 'Email address', phone: 'Phone number', company: 'Company (optional)' })[key]}<input name={key} type={key === 'email' ? 'email' : key === 'phone' ? 'tel' : 'text'} required={key !== 'company'} maxLength={key === 'phone' ? 25 : key === 'name' ? 100 : key === 'company' ? 120 : 180} pattern={key === 'phone' ? '[+0-9 ()\-]{5,25}' : undefined} value={fields[key]} onChange={event => setFields(current => ({ ...current, [key]: event.target.value }))} disabled={busy} /></label>)}<div className="form-actions"><button type="button" className="button secondary" onClick={onClose} disabled={busy}>Cancel</button><button className="button primary" disabled={busy}>{busy ? 'Saving customer…' : 'Add customer'}</button></div></form></Drawer>;
}

export function PaymentForm({ orders, orderId, onClose, onSaved }: { orders: Order[]; orderId?: number; onClose: () => void; onSaved: () => Promise<void> }) {
  const available = orders.filter(order => order.balanceCents > 0 && order.status !== 'CANCELLED');
  const [selected, setSelected] = useState(orderId?.toString() || '');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const identity = useRef({ key: '', id: '' });
  const order = available.find(item => item.id === Number(selected));
  const cents = Math.round(Number(amount) * 100);
  const valid = !!order && /^\d+(\.\d{1,2})?$/.test(amount) && cents > 0 && cents <= order.balanceCents;
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!valid || inFlight.current || !order) return;
    const payload = { amountCents: cents, method, reference: reference.trim() };
    const key = `${order.id}:${JSON.stringify(payload)}`;
    if (identity.current.key !== key) identity.current = { key, id: crypto.randomUUID() };
    inFlight.current = true; setBusy(true); setError('');
    try { await request(`/orders/${order.id}/payments`, { ...payload, requestId: identity.current.id }); await onSaved(); onClose(); }
    catch (error) { setError(errorMessage(error)); }
    finally { inFlight.current = false; setBusy(false); }
  };
  return <Drawer title="Record a payment" eyebrow="Demo bookkeeping" onClose={onClose} busy={busy}><form className="form-stack" onSubmit={submit}><div className="alert">This records a fictional payment. No money is moved.</div>{error && <div className="alert error" role="alert">{error}</div>}<label>Order<select value={selected} onChange={event => { setSelected(event.target.value); setAmount(''); }} required disabled={busy}><option value="">Select an outstanding order</option>{available.map(order => <option key={order.id} value={order.id}>{order.reference} · {order.customerName}</option>)}</select></label>{order && <div className="balance-box"><span>Outstanding balance</span><strong>{money(order.balanceCents)}</strong><button type="button" className="text-button" onClick={() => setAmount((order.balanceCents / 100).toFixed(2))}>Use full balance</button></div>}<label>Amount (PKR)<input type="number" step="0.01" min="0.01" max={order ? (order.balanceCents / 100).toFixed(2) : undefined} required value={amount} onChange={event => setAmount(event.target.value)} placeholder="0.00" disabled={busy || !order} /></label>{order && amount && !valid && <p className="field-error">Enter an amount above zero and no greater than the outstanding balance, with up to two decimal places.</p>}<div className="form-grid"><label>Method<select value={method} onChange={event => setMethod(event.target.value)} disabled={busy}><option value="CASH">Cash</option><option value="BANK">Bank transfer</option><option value="OTHER">Other</option></select></label><label>Reference (optional)<input value={reference} onChange={event => setReference(event.target.value)} maxLength={100} disabled={busy} /></label></div><div className="form-actions"><button type="button" className="button secondary" onClick={onClose} disabled={busy}>Cancel</button><button className="button primary" disabled={busy || !valid}><CreditCard size={17} />{busy ? 'Recording…' : 'Record payment'}</button></div></form></Drawer>;
}

export function OrderDetails({ order, onClose, onSaved, onPayment }: { order: Order; onClose: () => void; onSaved: () => Promise<void>; onPayment: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const inFlight = useRef(false);
  const next = nextStatus(order);
  const transition = async (status: string) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    try { await request(`/orders/${order.id}/transition`, { status, version: order.version }); await onSaved(); setConfirmCancel(false); }
    catch (error) { setError(errorMessage(error)); if (error instanceof ApiError && error.status === 409) await onSaved().catch(() => {}); }
    finally { inFlight.current = false; setBusy(false); }
  };
  const stages = statuses.filter(status => !['CANCELLED', ...(order.lamination ? [] : ['LAMINATION'])].includes(status));
  return <Drawer title={order.title} eyebrow={order.reference} onClose={onClose} busy={busy}><div className="form-stack"><div className="detail-intro"><StatusPill status={order.status} /><span className="muted">Created {dateLabel(order.createdAt)}</span></div>{error && <div className="alert error" role="alert">{error}</div>}<div className="production-track">{stages.map((stage, index) => <div key={stage} className={order.status !== 'CANCELLED' && index <= stages.indexOf(order.status) ? 'reached' : ''}><span>{index < stages.indexOf(order.status) ? <Check size={12} /> : index + 1}</span>{statusLabel(stage)}</div>)}</div><dl className="detail-list"><div><dt>Customer</dt><dd>{order.customerName}</dd></div><div><dt>Service</dt><dd>{order.serviceName}</dd></div><div><dt>Quantity</dt><dd>{order.quantity.toLocaleString()} units</dd></div><div><dt>Paper & finish</dt><dd>{order.paper === 'PREMIUM' ? 'Premium stock' : 'Standard stock'}{order.lamination ? ' · Laminated' : ' · No lamination'}</dd></div><div><dt>Due date</dt><dd>{dateLabel(order.dueDate)}</dd></div></dl><section className="payment-summary"><div><span>Order total</span><strong>{money(order.totalCents)}</strong></div><div><span>Recorded payments</span><span>{money(order.paidCents)}</span></div><div><span>Outstanding</span><strong>{money(order.balanceCents)}</strong></div></section><div className="form-actions split">{order.balanceCents > 0 && order.status !== 'CANCELLED' && <button className="button secondary" onClick={onPayment} disabled={busy}><CreditCard size={16} />Record payment</button>}{next && <button className="button primary" onClick={() => void transition(next)} disabled={busy}>{busy ? 'Updating…' : `Move to ${statusLabel(next)}`}<ArrowRight size={16} /></button>}</div>{['NEW', 'DESIGN'].includes(order.status) && order.paidCents === 0 && <div className="cancel-section">{confirmCancel ? <div className="alert error"><p>Cancel this print order? It will leave the production queue.</p><div className="inline-actions"><button className="button danger" disabled={busy} onClick={() => void transition('CANCELLED')}>Confirm cancellation</button><button className="text-button" disabled={busy} onClick={() => setConfirmCancel(false)}>Keep order</button></div></div> : <button className="text-button danger-text" onClick={() => setConfirmCancel(true)} disabled={busy}>Cancel order</button>}</div>}</div></Drawer>;
}
