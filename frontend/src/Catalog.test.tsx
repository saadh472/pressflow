import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { Catalog, ServiceForm } from './Catalog';
import { request } from './api';
import type { Service } from './types';
vi.mock('./api', () => ({ request: vi.fn() }));
const active: Service = { id: 1, name: 'Business cards', description: 'Fictional print service', unitPriceCents: 1500, active: true, version: 3 };
const archived: Service = { ...active, id: 2, name: 'Archived print service', active: false };
beforeEach(() => vi.clearAllMocks());

it('keeps archived services visible for editing while preventing new orders', async () => {
  const edit = vi.fn(), create = vi.fn(); const user = userEvent.setup();
  render(<Catalog services={[active, archived]} query="" onEdit={edit} onCreate={create} />);
  const archivedCard = screen.getByRole('heading', { name: archived.name }).closest('article')!;
  expect(within(archivedCard).getByRole('button', { name: 'Create order' })).toBeDisabled();
  await user.click(within(archivedCard).getByRole('button', { name: 'Edit service' }));
  expect(edit).toHaveBeenCalledWith(archived);
  const activeCard = screen.getByRole('heading', { name: active.name }).closest('article')!;
  await user.click(within(activeCard).getByRole('button', { name: 'Create order' }));
  expect(create).toHaveBeenCalledWith(active);
}, 10000);

it('submits a catalog price as exact whole-number paisa and rejects an out-of-range price', async () => {
  vi.mocked(request).mockResolvedValue(active);
  const saved = vi.fn().mockResolvedValue(undefined), close = vi.fn(); const user = userEvent.setup();
  render(<ServiceForm onClose={close} onSaved={saved} />);
  await user.type(screen.getByLabelText('Service name'), 'Sample booklets');
  await user.type(screen.getByLabelText('Description'), 'Fictional sample service');
  await user.type(screen.getByLabelText('Unit price (PKR)'), '50001');
  expect(screen.getByRole('button', { name: 'Add service' })).toBeDisabled();
  await user.clear(screen.getByLabelText('Unit price (PKR)'));
  await user.type(screen.getByLabelText('Unit price (PKR)'), '125.50');
  await user.click(screen.getByRole('button', { name: 'Add service' }));
  await waitFor(() => expect(request).toHaveBeenCalledWith('/services', { name: 'Sample booklets', description: 'Fictional sample service', unitPriceCents: 12550, active: true }, 'POST'));
  expect(saved).toHaveBeenCalledTimes(1); expect(close).toHaveBeenCalledTimes(1);
});

it('retains an archive edit when a version conflict is returned', async () => {
  vi.mocked(request).mockRejectedValue(new Error('This service changed. Refresh the catalog before trying again.'));
  const close = vi.fn(); const user = userEvent.setup();
  render(<ServiceForm service={active} onClose={close} onSaved={vi.fn()} />);
  await user.clear(screen.getByLabelText('Service name')); await user.type(screen.getByLabelText('Service name'), 'Updated cards');
  await user.click(screen.getByLabelText(/Available for new orders/));
  await user.click(screen.getByRole('button', { name: 'Save service' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Refresh the catalog');
  expect(screen.getByLabelText('Service name')).toHaveValue('Updated cards');
  expect(request).toHaveBeenCalledWith('/services/1', expect.objectContaining({ name: 'Updated cards', version: 3, active: false }), 'PUT');
  expect(close).not.toHaveBeenCalled();
});
