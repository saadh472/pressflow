import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ArrowUpRight, Check, Layers3, Pencil, Plus } from 'lucide-react';
import { request } from './api';
import type { Service } from './types';
import { money } from './types';
import { Drawer, Empty } from './ui';

export function Catalog({ services, query, onEdit, onCreate }: { services: Service[]; query: string; onEdit: (service?: Service) => void; onCreate: (service: Service) => void }) {
  const search = query.trim().toLowerCase();
  const matches = services.filter(service => (service.name + ' ' + service.description).toLowerCase().includes(search));
  return <div className="catalog-content"><div className="inline-note">Prices are per unit before premium paper and lamination. Archived services stay in past orders and cannot be selected for a new quote.</div>{matches.length ? <div className="catalog-grid">{matches.map(service => <article className={'catalog-card' + (service.active === false ? ' archived' : '')} key={service.id}><div className="catalog-card-top"><span className="catalog-icon"><Layers3 size={23} /></span><span className={'catalog-state' + (service.active === false ? ' inactive' : '')}>{service.active === false ? 'Archived' : 'Active'}</span></div><h2>{service.name}</h2><p>{service.description}</p><div className="catalog-price"><strong>{money(service.unitPriceCents)}</strong><span>per unit · standard stock</span></div><div className="catalog-actions"><button className="button secondary" onClick={() => onEdit(service)}><Pencil size={15} />Edit service</button><button className="button primary" disabled={service.active === false} onClick={() => onCreate(service)}><Plus size={15} />Create order<ArrowUpRight size={14} /></button></div></article>)}</div> : <Empty title="No print services found" detail="Try another search or add a service to the catalog." action={<button className="button secondary" onClick={() => onEdit()}>Add service</button>} />}</div>;
}

export function ServiceForm({ service, onClose, onSaved }: { service?: Service; onClose: () => void; onSaved: () => Promise<void> }) {
  const [name, setName] = useState(service?.name || '');
  const [description, setDescription] = useState(service?.description || '');
  const [price, setPrice] = useState(service ? (service.unitPriceCents / 100).toFixed(2) : '');
  const [active, setActive] = useState(service?.active !== false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const cents = Math.round(Number(price) * 100);
  const validPrice = /^\d+(\.\d{1,2})?$/.test(price) && Number.isSafeInteger(cents) && cents >= 1 && cents <= 5000000;
  const valid = name.trim().length > 0 && description.trim().length > 0 && validPrice;
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (!valid || inFlight.current) return;
    inFlight.current = true; setBusy(true); setError('');
    const payload = { name: name.trim(), description: description.trim(), unitPriceCents: cents, active, ...(service ? { version: service.version ?? 0 } : {}) };
    try { await request(service ? '/services/' + service.id : '/services', payload, service ? 'PUT' : 'POST'); await onSaved(); onClose(); }
    catch (error) { setError(error instanceof Error ? error.message : 'The service could not be saved. Refresh the catalog before trying again.'); }
    finally { inFlight.current = false; setBusy(false); }
  };
  return <Drawer title={service ? 'Edit print service' : 'Add print service'} eyebrow="Service catalog" onClose={onClose} busy={busy}><form className="form-stack" onSubmit={submit}><p className="muted">Set the standard unit price. Future orders use the new specification; existing order totals stay unchanged.</p>{error && <div className="alert error" role="alert">{error}</div>}<label>Service name<input required maxLength={80} value={name} onChange={event => setName(event.target.value)} disabled={busy} /></label><label>Description<textarea required rows={4} maxLength={300} value={description} onChange={event => setDescription(event.target.value)} disabled={busy} /></label><label>Unit price (PKR)<input type="number" required step="0.01" min="0.01" max="50000" inputMode="decimal" value={price} onChange={event => setPrice(event.target.value)} disabled={busy} placeholder="0.00" /></label>{price && !validPrice && <p className="field-error">Enter PKR 0.01 to 50,000.00 with at most two decimal places.</p>}<label className="checkbox-card"><input type="checkbox" checked={active} onChange={event => setActive(event.target.checked)} disabled={busy} /><span><strong>Available for new orders</strong><small>Clear this to archive the service while retaining its order history.</small></span></label><div className="form-actions"><button type="button" className="button secondary" onClick={onClose} disabled={busy}>Cancel</button><button className="button primary" disabled={busy || !valid}><Check size={17} />{busy ? 'Saving service…' : service ? 'Save service' : 'Add service'}</button></div></form></Drawer>;
}
