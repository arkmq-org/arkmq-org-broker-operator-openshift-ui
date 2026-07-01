import { render, screen, fireEvent } from '@testing-library/react';
import { LabelList } from './LabelList';

describe('LabelList', () => {
  it('renders an em-dash when labels are undefined', () => {
    render(<LabelList labels={undefined} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders an em-dash when labels are empty', () => {
    render(<LabelList labels={{}} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('renders visible labels as key=value chips', () => {
    render(<LabelList labels={{ tier: 'production', region: 'us-east' }} maxVisible={2} />);
    expect(screen.getByText('tier=production')).toBeInTheDocument();
    expect(screen.getByText('region=us-east')).toBeInTheDocument();
  });

  it('hides overflow labels behind a "+N more" toggle', () => {
    render(<LabelList labels={{ a: '1', b: '2', c: '3' }} maxVisible={1} />);
    expect(screen.getByText('a=1')).toBeInTheDocument();
    expect(screen.queryByText('b=2')).not.toBeInTheDocument();
    expect(screen.getByTestId('label-list-show-more')).toBeInTheDocument();
  });

  it('expands all labels on "+N more" click', () => {
    render(<LabelList labels={{ a: '1', b: '2', c: '3' }} maxVisible={1} />);
    fireEvent.click(screen.getByTestId('label-list-show-more'));
    expect(screen.getByText('b=2')).toBeInTheDocument();
    expect(screen.getByText('c=3')).toBeInTheDocument();
    expect(screen.getByTestId('label-list-show-less')).toBeInTheDocument();
  });

  it('collapses back to maxVisible on "show less" click', () => {
    render(<LabelList labels={{ a: '1', b: '2', c: '3' }} maxVisible={1} />);
    fireEvent.click(screen.getByTestId('label-list-show-more'));
    fireEvent.click(screen.getByTestId('label-list-show-less'));
    expect(screen.queryByText('b=2')).not.toBeInTheDocument();
    expect(screen.getByTestId('label-list-show-more')).toBeInTheDocument();
  });

  it('shows all labels without a toggle when count <= maxVisible', () => {
    render(<LabelList labels={{ a: '1' }} maxVisible={2} />);
    expect(screen.getByText('a=1')).toBeInTheDocument();
    expect(screen.queryByTestId('label-list-show-more')).not.toBeInTheDocument();
  });
});
