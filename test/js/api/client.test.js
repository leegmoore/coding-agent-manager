import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { post, ApiError } from '../../../public/js/api/client.js';

describe('api/client', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe('post', () => {
    it('returns JSON on successful response', async () => {
      const mockResponse = { success: true, data: 'test' };
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await post('/api/test', { foo: 'bar' });

      expect(result).toEqual(mockResponse);
      expect(fetch).toHaveBeenCalledWith('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ foo: 'bar' }),
      });
    });

    it('throws ApiError on HTTP 400', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid input' }
        }),
      });

      await expect(post('/api/test', {})).rejects.toThrow(ApiError);
      await expect(post('/api/test', {})).rejects.toMatchObject({
        message: 'Invalid input',
        status: 400,
        code: 'VALIDATION_ERROR',
      });
    });

    it('throws ApiError on HTTP 500 with default message', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      });

      await expect(post('/api/test', {})).rejects.toMatchObject({
        message: 'Server error: HTTP 500',
        status: 500,
        code: 'UNKNOWN',
      });
    });

    it('throws ApiError on HTTP 404', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({
          error: { code: 'NOT_FOUND', message: 'Session not found' }
        }),
      });

      await expect(post('/api/test', {})).rejects.toMatchObject({
        message: 'Session not found',
        status: 404,
        code: 'NOT_FOUND',
      });
    });

    it('propagates network errors', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network failure'));

      await expect(post('/api/test', {})).rejects.toThrow('Network failure');
    });

    it('propagates timeout errors', async () => {
      const timeoutError = new Error('The operation was aborted');
      timeoutError.name = 'AbortError';
      globalThis.fetch = vi.fn().mockRejectedValue(timeoutError);

      await expect(post('/api/test', {})).rejects.toThrow('The operation was aborted');
    });

    it('throws ApiError on non-JSON response', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new SyntaxError('Unexpected token')),
      });

      await expect(post('/api/test', {})).rejects.toThrow(ApiError);
      await expect(post('/api/test', {})).rejects.toMatchObject({
        message: 'Invalid JSON response from server',
        status: 200,
        code: 'PARSE_ERROR',
      });
    });
  });

  describe('ApiError', () => {
    it('is an instance of Error', () => {
      const error = new ApiError('test', 400, 'TEST');
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('ApiError');
    });

    it('stores status and code', () => {
      const error = new ApiError('message', 404, 'NOT_FOUND');
      expect(error.message).toBe('message');
      expect(error.status).toBe(404);
      expect(error.code).toBe('NOT_FOUND');
    });
  });
});
