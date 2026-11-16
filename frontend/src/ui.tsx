import { useEffect, useId, useRef } from 'react';
import type { ReactNode } from 'react';
import { ArrowUpRight, Inbox, X } from 'lucide-react';
import type { Order } from './types';
import { dateLabel, money, statusLabel } from './types';

export function Drawer({ title, eyebrow, children, onClose, busy = false }: { title: string; eyebrow?: string; children: ReactNode; onClose: () => void; busy?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  const pending = useRef(busy);
  close.current = onClose;
  pending.current = busy;
  const id = useId();
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.querySelector<HTMLElement>('input, select, button')?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pending.current) { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab') return;
      const fields = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]') || []);
      const first = fields[0];
      const last = fields[fields.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener('keydown', trap);
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', trap); previous?.focus(); };
  }, []);
  return <div className="drawer-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section ref={ref} className="drawer" role="dialog" aria-modal="true" aria-labelledby={id} aria-busy={busy}>
      <header className="drawer-header"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2 id={id}>{title}</h2></div><button className="icon-button" aria-label="Close panel" onClick={onClose} disabled={busy}><X size={20} /></button></header>
      <div className="drawer-content">{children}</div>
    </section>
  </div>;
}

export function Empty({ title, detail, action, icon }: { title: string; detail: string; action?: ReactNode; icon?: ReactNode }) {
  return <div className="empty"><span className="empty-icon" aria-hidden="true">{icon || <Inbox size={26} />}</span><h3>{title}</h3><p>{detail}</p>{action}</div>;
}
export function StatusPill({ status }: { status: string }) { return <span className={`status status-${status.toLowerCase()}`}><span />{statusLabel(status)}</span>; }
export function OrderTable({ orders, onOpen }: { orders: Order[]; onOpen: (order: Order) => void }) {
  return <div className="table-scroll"><table><thead><tr><th scope="col">Order</th><th scope="col">Customer</th><th scope="col">Stage</th><th scope="col">Due date</th><th scope="col" className="align-right">Total</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>{orders.map(order => <tr key={order.id}>
    <td><button className="table-link" onClick={() => onOpen(order)}>{order.title}<small>{order.reference} · {order.quantity.toLocaleString()} units</small></button></td><td>{order.customerName}</td><td><StatusPill status={order.status} /></td><td className="nowrap">{dateLabel(order.dueDate)}</td><td className="align-right"><strong>{money(order.totalCents)}</strong><small>{order.status === 'CANCELLED' ? 'Cancelled' : order.balanceCents ? `${money(order.balanceCents)} due` : 'Paid in full'}</small></td><td><button className="icon-button" aria-label={`View ${order.reference}`} onClick={() => onOpen(order)}><ArrowUpRight size={18} /></button></td>
  </tr>)}</tbody></table></div>;
}
