import '@testing-library/jest-dom'

// Mock Next.js modules
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(() => ({
    push: jest.fn(),
    replace: jest.fn(),
    refresh: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
  })),
  useSearchParams: jest.fn(() => new URLSearchParams()),
  usePathname: jest.fn(() => '/'),
}))

jest.mock('next/image', () => ({
  __esModule: true,
  default: ({ src, alt, ...props }) => <img src={src} alt={alt} {...props} />,
}))

// Mock Clerk
jest.mock('@clerk/nextjs', () => ({
  auth: jest.fn(() => ({
    userId: 'test-user-id',
    sessionId: 'test-session-id',
  })),
  currentUser: jest.fn(() => ({
    id: 'test-user-id',
    emailAddresses: [{ emailAddress: 'test@example.com' }],
  })),
  ClerkProvider: ({ children }) => <div>{children}</div>,
  useAuth: jest.fn(() => ({
    isLoaded: true,
    userId: 'test-user-id',
    sessionId: 'test-session-id',
    signOut: jest.fn(),
  })),
  useUser: jest.fn(() => ({
    isLoaded: true,
    user: {
      id: 'test-user-id',
      emailAddresses: [{ emailAddress: 'test@example.com' }],
    },
  })),
}))

// Mock tRPC
jest.mock('@/trpc/react', () => ({
  api: {
    dividends: {
      computePreview: {
        useMutation: jest.fn(),
      },
      createRound: {
        useMutation: jest.fn(),
      },
      getRounds: {
        useQuery: jest.fn(),
      },
      processPayments: {
        useMutation: jest.fn(),
      },
    },
  },
}))

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(), // deprecated
    removeListener: jest.fn(), // deprecated
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
})

// Mock ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}))

// Mock IntersectionObserver
global.IntersectionObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}))

// Mock scrollIntoView
window.HTMLElement.prototype.scrollIntoView = jest.fn()

// Mock localStorage
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
}
global.localStorage = localStorageMock

// Mock fetch
global.fetch = jest.fn()

// Setup console error/warn suppression for tests
const originalError = console.error
const originalWarn = console.warn

beforeAll(() => {
  console.error = (...args) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('Warning: ReactDOM.render is no longer supported')
    ) {
      return
    }
    originalError.call(console, ...args)
  }
  
  console.warn = (...args) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('componentWillReceiveProps has been renamed')
    ) {
      return
    }
    originalWarn.call(console, ...args)
  }
})

afterAll(() => {
  console.error = originalError
  console.warn = originalWarn
})

// Global test utilities
global.testUtils = {
  mockTRPCMutation: (mutationPath, overrides = {}) => {
    const { api } = require('@/trpc/react')
    const mutation = mutationPath.split('.').reduce((obj, key) => obj[key], api)
    mutation.useMutation.mockReturnValue({
      mutate: jest.fn(),
      isLoading: false,
      error: null,
      ...overrides,
    })
  },
  
  mockTRPCQuery: (queryPath, overrides = {}) => {
    const { api } = require('@/trpc/react')
    const query = queryPath.split('.').reduce((obj, key) => obj[key], api)
    query.useQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
      ...overrides,
    })
  },
}