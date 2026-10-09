import { describe, expect, it } from 'vitest';
import { can, homePath } from './permissions';

describe('permissions (UX mirror of the API role matrix)', () => {
  it('lets only admins manage users', () => {
    expect(can.manageUsers('ADMIN')).toBe(true);
    expect(can.manageUsers('MANAGER')).toBe(false);
    expect(can.manageUsers('STAFF')).toBe(false);
  });

  it('gives admins no workshop access', () => {
    expect(can.viewWorkshops('ADMIN')).toBe(false);
    expect(can.register('ADMIN')).toBe(false);
    expect(can.editWorkshops('ADMIN')).toBe(false);
  });

  it('lets only managers create and edit workshops, but staff register attendees', () => {
    expect(can.editWorkshops('MANAGER')).toBe(true);
    expect(can.editWorkshops('STAFF')).toBe(false);
    expect(can.register('STAFF')).toBe(true);
  });

  it('lands each role on a page it may see', () => {
    expect(homePath('ADMIN')).toBe('/users');
    expect(homePath('MANAGER')).toBe('/workshops');
    expect(homePath('STAFF')).toBe('/workshops');
  });
});
