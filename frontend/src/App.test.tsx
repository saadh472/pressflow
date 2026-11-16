import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { OrderForm, PaymentForm } from './forms';
import { getSession, login, onExpired, request } from './api';
import type { Order } from './types';
vi.mock('./api', () => ({ getSession: vi.fn(), login: vi.fn(), logout: vi.fn(), onExpired: vi.fn(), request: vi.fn(), ApiError: class extends Error { status = 0; } }));

const anonymous = { authenticated: false, csrfToken: 'csrf-anonymous' };
const authenticated = { authenticated: true, csrfToken: 'csrf-authenticated', user: { username: 'operator', displayName: 'Demo operator' } };
const customer = { id: 1, name: 'Alex Morgan', email: 'alex@example.test', phone: '+00 123456789', company: 'Demo Studio' };
const service = { id: 1, name: 'Brochure printing', description: 'Demo print service', unitPriceCents: 1000 };
const order: Order = { id: 1, reference: 'PF-0001', title: 'Demo brochure', customerId: 1, customerName: customer.name, serviceId: 1, serviceName: service.name, quantity: 100, paper: 'PLAIN', lamination: false, dueDate: '2026-12-01', status: 'NEW', totalCents: 100000, paidCents: 20000, balanceCents: 80000, createdAt: '2026-11-15T10:00:00', version: 0 };
let expire: () => void;
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSession).mockResolvedValue(anonymous);
  vi.mocked(onExpired).mockImplementation(callback => { expire = callback; return vi.fn(); });
  vi.mocked(request).mockImplementation(async path => ({ '/dashboard': { activeOrders: 1, readyOrders: 0, totalRevenueCents: 20000, outstandingCents: 80000, customerCount: 1, recentOrders: [order], statusCounts: { NEW: 1 } }, '/customers': [customer], '/services': [service], '/orders': [order], '/payments': [] }[path] as never));
});

describe('workspace access', () => {
  it('does not request private records before the server confirms authentication', async () => {
    render(<App />);
    expect(await screen.findByRole('button', { name: 'Open workspace' })).toBeEnabled();
    expect(request).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Username')).toHaveValue('operator');
    expect(screen.queryByRole('heading', { name: 'Production overview' })).not.toBeInTheDocument();
  });
  it('keeps invalid credentials on the sign-in form', async () => {
    vi.mocked(login).mockRejectedValue(new Error('The username or password is incorrect.'));
    const user = userEvent.setup(); render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Open workspace' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('username or password is incorrect');
    expect(request).not.toHaveBeenCalled();
  });
  it('unmounts protected records on session expiry', async () => {
    vi.mocked(getSession).mockResolvedValue(authenticated); render(<App />);
    expect(await screen.findByRole('heading', { name: 'Recent orders' })).toBeInTheDocument();
    act(() => expire());
    expect(screen.queryByText('Demo brochure')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('session has ended');
    expect(screen.getByRole('button', { name: 'Open workspace' })).toBeDisabled();
  });
  it('shows a retry state if the workspace cannot connect', async () => {
    vi.mocked(getSession).mockRejectedValueOnce(new Error('Backend unavailable'));
    const user = userEvent.setup(); render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Retry connection' }));
    expect(await screen.findByRole('button', { name: 'Open workspace' })).toBeInTheDocument();
  });
});

describe('validated writes', () => {
  it('does not submit invalid quantities and fetches a server quote for valid specifications', async () => {
    vi.mocked(request).mockResolvedValue({ unitPriceCents: 1000, totalCents: 100000 } as never);
    const user = userEvent.setup(); render(<OrderForm customers={[customer]} services={[service]} onClose={vi.fn()} onSaved={vi.fn()} />);
    const quantity = screen.getByLabelText('Quantity');
    await user.clear(quantity); await user.type(quantity, '0');
    expect(screen.getByRole('button', { name: 'Create order' })).toBeDisabled();
    await user.clear(quantity); await user.type(quantity, '25');
    await waitFor(() => expect(request).toHaveBeenCalledWith('/quote', { serviceId: 1, quantity: 25, paper: 'PLAIN', lamination: false }));
    expect(vi.mocked(request).mock.calls.every(([path]) => path === '/quote')).toBe(true);
  });
  it('does not duplicate an in-flight order creation', async () => {
    let finish: (value: unknown) => void = () => {};
    vi.mocked(request).mockImplementation(path => path === '/quote' ? Promise.resolve({ unitPriceCents: 1000, totalCents: 100000 } as never) : new Promise(resolve => { finish = resolve as (value: unknown) => void; }));
    const user = userEvent.setup(); const saved = vi.fn().mockResolvedValue(undefined); const close = vi.fn();
    render(<OrderForm customers={[customer]} services={[service]} onClose={close} onSaved={saved} />);
    await user.selectOptions(screen.getByLabelText('Customer'), '1');
    await user.type(screen.getByLabelText('Job title'), 'Test brochure');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Create order' })).toBeEnabled());
    const form = screen.getByLabelText('Job title').closest('form')!;
    fireEvent.submit(form); fireEvent.submit(form);
    expect(vi.mocked(request).mock.calls.filter(([path]) => path === '/orders')).toHaveLength(1);
    await act(async () => finish(order));
    expect(saved).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });
  it('rejects overpayments before sending a mutation', async () => {
    const user = userEvent.setup(); render(<PaymentForm orders={[order]} orderId={1} onClose={vi.fn()} onSaved={vi.fn()} />);
    const amount = screen.getByLabelText('Amount (PKR)');
    await user.type(amount, '99999');
    expect(screen.getByRole('button', { name: 'Record payment' })).toBeDisabled();
    expect(screen.getByText(/no greater than the outstanding balance/)).toBeInTheDocument();
    await user.clear(amount); await user.type(amount, '100');
    expect(screen.getByRole('button', { name: 'Record payment' })).toBeEnabled();
    expect(request).not.toHaveBeenCalled();
  });
});

describe('empty dashboard guidance', () => {
  function emptyWorkspace() {
    vi.mocked(getSession).mockResolvedValue(authenticated);
    vi.mocked(request).mockImplementation(async path => ({ '/dashboard': { activeOrders: 0, readyOrders: 0, totalRevenueCents: 0, outstandingCents: 0, customerCount: 1, recentOrders: [], statusCounts: {} }, '/customers': [customer], '/services': [service], '/orders': [], '/payments': [] }[path] as never));
  }
  it('opens the existing order form from the first-order empty-state action', async () => {
    emptyWorkspace(); const user = userEvent.setup(); render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Create your first order' }));
    expect(screen.getByRole('dialog', { name: 'Create a print order' })).toBeInTheDocument();
    expect(screen.getByLabelText('Customer')).toBeInTheDocument();
    expect(vi.mocked(request).mock.calls.some(([path]) => path === '/orders')).toBe(true);
    expect(vi.mocked(request).mock.calls.filter(([path, body]) => path === '/orders' && body !== undefined)).toHaveLength(0);
  });
  it('routes each quick-start step to its existing workflow', async () => {
    emptyWorkspace(); const user = userEvent.setup(); render(<App />);
    await user.click(await screen.findByRole('button', { name: 'Open customer directory' }));
    expect(screen.getByRole('heading', { name: 'Your customers' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Overview' }));
    await user.click(screen.getByRole('button', { name: 'Explore print catalog' }));
    expect(screen.getByRole('heading', { name: 'Print catalog' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Overview' }));
    await user.click(screen.getByRole('button', { name: 'Start a print order' }));
    expect(screen.getByRole('dialog', { name: 'Create a print order' })).toBeInTheDocument();
  }, 10000);
});
