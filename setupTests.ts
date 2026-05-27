import '@testing-library/jest-dom';
import { configure } from '@testing-library/react';

// Align with the codebase convention: components use data-test, not data-testid.
configure({ testIdAttribute: 'data-test' });
