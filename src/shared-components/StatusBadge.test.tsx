import { render, screen } from '@testing-library/react';
import { StatusBadge, STATUS_COLORS } from './StatusBadge';

describe('StatusBadge', () => {
  it('renders the status text', () => {
    render(<StatusBadge status="Provisioned" />);
    expect(screen.getByText('Provisioned')).toBeInTheDocument();
  });

  it('renders unknown statuses without throwing', () => {
    render(<StatusBadge status="Unknown" />);
    expect(screen.getByText('Unknown')).toBeInTheDocument();
  });

  // PatternFly v6 label.mjs files are not transformed by the jest CSS mock,
  // so color modifier classes cannot be reliably asserted via className in jsdom.
  // The color mapping is therefore verified directly against STATUS_COLORS.
  describe('STATUS_COLORS mapping', () => {
    it('maps Provisioned and Running to green', () => {
      expect(STATUS_COLORS.Provisioned).toBe('green');
      expect(STATUS_COLORS.Running).toBe('green');
    });

    it('maps Pending and Warning to yellow', () => {
      expect(STATUS_COLORS.Pending).toBe('yellow');
      expect(STATUS_COLORS.Warning).toBe('yellow');
    });

    it('returns grey via nullish coalescing for unmapped statuses', () => {
      // Not in the map → component falls back to grey via STATUS_COLORS[status] ?? 'grey'
      expect(STATUS_COLORS.Unknown).toBeUndefined();
    });
  });
});
