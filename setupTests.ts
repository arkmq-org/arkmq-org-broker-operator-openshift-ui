import '@testing-library/jest-dom';
import { configure } from '@testing-library/react';
import { TextDecoder, TextEncoder } from 'util';

// react-router requires TextEncoder/TextDecoder, which jsdom does not provide.
Object.assign(global, { TextEncoder, TextDecoder });

// Align with the codebase convention: components use data-test, not data-testid.
configure({ testIdAttribute: 'data-test' });

jest.mock('react-router', () => ({
  ...jest.requireActual<typeof import('react-router')>('react-router'),
  useNavigate: jest.fn(() => jest.fn()),
}));
