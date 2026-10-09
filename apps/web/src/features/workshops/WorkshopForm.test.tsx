import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { server } from '@/test/server';
import { WorkshopForm } from './WorkshopForm';

const LOCATION = { id: '5b6c1d0a-0000-4000-8000-000000000001', name: 'Harbour Studio', address: '1 Quay St' };

function renderForm(onSubmit = vi.fn().mockResolvedValue(undefined)) {
  server.use(http.get('/api/v1/locations', () => HttpResponse.json([LOCATION])));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <WorkshopForm onSubmit={onSubmit} onCancel={() => {}} />
    </QueryClientProvider>,
  );
  return onSubmit;
}

const change = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('WorkshopForm', () => {
  it('shows plain-language errors and does not submit an empty form', async () => {
    const onSubmit = renderForm();
    fireEvent.click(screen.getByRole('button', { name: 'Create workshop' }));

    expect(await screen.findByText('Enter a title')).toBeTruthy();
    expect(screen.getByText('Choose a location')).toBeTruthy();
    expect(screen.getByText('Choose a start time')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('rejects an end time that is not after the start time', async () => {
    const onSubmit = renderForm();
    await screen.findByRole('option', { name: LOCATION.name });
    change('Workshop code', 'pot-1');
    change('Title', 'Pottery');
    change('Instructor', 'Ada');
    change('Location', LOCATION.id);
    change('Starts', '2030-05-01T10:00');
    change('Ends', '2030-05-01T09:00');
    fireEvent.click(screen.getByRole('button', { name: 'Create workshop' }));

    expect(await screen.findByText('The end time must be after the start time')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits a valid workshop as an open (scheduled) one with ISO times', async () => {
    const onSubmit = renderForm();
    await screen.findByRole('option', { name: LOCATION.name });
    change('Workshop code', 'pot-1');
    change('Title', ' Pottery ');
    change('Instructor', 'Ada');
    change('Location', LOCATION.id);
    change('Starts', '2030-05-01T10:00');
    change('Ends', '2030-05-01T12:00');
    change('Seats (capacity)', '8');
    fireEvent.click(screen.getByRole('button', { name: 'Create workshop' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]?.[0]).toEqual({
      code: 'pot-1',
      title: 'Pottery',
      description: '',
      instructor: 'Ada',
      locationId: LOCATION.id,
      startsAt: new Date('2030-05-01T10:00').toISOString(),
      endsAt: new Date('2030-05-01T12:00').toISOString(),
      capacity: 8,
      status: 'SCHEDULED',
    });
  });

  it('shows the server error when saving fails', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('boom'));
    renderForm(onSubmit);
    await screen.findByRole('option', { name: LOCATION.name });
    change('Workshop code', 'pot-1');
    change('Title', 'Pottery');
    change('Instructor', 'Ada');
    change('Location', LOCATION.id);
    change('Starts', '2030-05-01T10:00');
    change('Ends', '2030-05-01T12:00');
    fireEvent.click(screen.getByRole('button', { name: 'Create workshop' }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/something went wrong/i);
  });
});
