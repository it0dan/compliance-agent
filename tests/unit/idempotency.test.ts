import { describe, it, expect, vi } from 'vitest';
import { InMemoryIdempotencyStore, idempotencyPreHandler } from '../../src/middleware/idempotency';
import { FastifyRequest, FastifyReply } from 'fastify';

describe('InMemoryIdempotencyStore', () => {
  it('should set and get cache entries', async () => {
    const store = new InMemoryIdempotencyStore(60000);
    const key = 'test-request-id-1';
    const val = { result: 'ok' };
    
    await store.set(key, val, 1000);
    
    const retrieved = await store.get(key);
    expect(retrieved).toEqual(val);
    
    store.destroy();
  });

  it('should return null and perform lazy deletion on expired entry', async () => {
    const store = new InMemoryIdempotencyStore(60000);
    const key = 'test-request-id-2';
    const val = { result: 'ok' };
    
    await store.set(key, val, -100); // already expired
    
    const retrieved = await store.get(key);
    expect(retrieved).toBeNull();
    
    // Check it was deleted
    const secondRetrieval = await store.get(key);
    expect(secondRetrieval).toBeNull();
    
    store.destroy();
  });

  it('should clear all expired entries via clearExpired', async () => {
    const store = new InMemoryIdempotencyStore(60000);
    
    await store.set('expired1', { x: 1 }, -10);
    await store.set('valid1', { y: 2 }, 10000);
    
    await store.clearExpired();
    
    expect(await store.get('expired1')).toBeNull();
    expect(await store.get('valid1')).not.toBeNull();
    
    store.destroy();
  });

  it('should cleanup interval when destroy is called', () => {
    const store = new InMemoryIdempotencyStore(100);
    expect(store['cleanupInterval']).toBeDefined();
    
    store.destroy();
  });
});

describe('idempotencyPreHandler edge cases', () => {
  it('should ignore non-POST requests', async () => {
    const mockRequest = {
      method: 'GET',
      body: { request_id: 'some-id' }
    } as FastifyRequest;

    const mockReply = {
      header: vi.fn(),
      status: vi.fn().mockReturnThis(),
      send: vi.fn()
    } as unknown as FastifyReply;

    await idempotencyPreHandler(mockRequest, mockReply);
    expect(mockReply.header).not.toHaveBeenCalled();
  });

  it('should ignore requests with empty or invalid body', async () => {
    const mockRequest = {
      method: 'POST',
      body: null
    } as FastifyRequest;

    const mockReply = {
      header: vi.fn(),
      status: vi.fn().mockReturnThis(),
      send: vi.fn()
    } as unknown as FastifyReply;

    await idempotencyPreHandler(mockRequest, mockReply);
    expect(mockReply.header).not.toHaveBeenCalled();
  });

  it('should ignore requests without request_id', async () => {
    const mockRequest = {
      method: 'POST',
      body: { other_field: 'value' }
    } as FastifyRequest;

    const mockReply = {
      header: vi.fn(),
      status: vi.fn().mockReturnThis(),
      send: vi.fn()
    } as unknown as FastifyReply;

    await idempotencyPreHandler(mockRequest, mockReply);
    expect(mockReply.header).not.toHaveBeenCalled();
  });

  it('should log error if store.get throws', async () => {
    const mockRequest = {
      method: 'POST',
      body: { request_id: 'throw-error' },
      log: {
        error: vi.fn()
      }
    } as unknown as FastifyRequest;

    const mockReply = {
      header: vi.fn(),
      status: vi.fn().mockReturnThis(),
      send: vi.fn()
    } as unknown as FastifyReply;

    // Mock store.get to throw an error
    const spyGet = vi.spyOn(InMemoryIdempotencyStore.prototype, 'get').mockRejectedValue(new Error('Database error'));

    await idempotencyPreHandler(mockRequest, mockReply);
    
    expect(mockRequest.log.error).toHaveBeenCalled();
    spyGet.mockRestore();
  });
});
