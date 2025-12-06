/**
 * Custom error for API failures
 */
export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/**
 * GET JSON from endpoint
 * @param {string} url - Endpoint URL
 * @returns {Promise<Object>} Response JSON
 * @throws {ApiError} On HTTP error or parse failure
 */
export async function get(url) {
  const response = await fetch(url);

  // Handle non-JSON responses (HTML error pages, empty responses)
  let json;
  try {
    json = await response.json();
  } catch (parseError) {
    throw new ApiError('Invalid JSON response from server', response.status, 'PARSE_ERROR');
  }

  if (!response.ok) {
    const message = json.error?.message || `Server error: HTTP ${response.status}`;
    const code = json.error?.code || 'UNKNOWN';
    throw new ApiError(message, response.status, code);
  }

  return json;
}

/**
 * POST JSON to endpoint
 * @param {string} url - Endpoint URL
 * @param {Object} data - Request body
 * @returns {Promise<Object>} Response JSON
 * @throws {ApiError} On HTTP error or parse failure
 */
export async function post(url, data) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

  // Handle non-JSON responses (HTML error pages, empty responses)
  let json;
  try {
    json = await response.json();
  } catch (parseError) {
    throw new ApiError('Invalid JSON response from server', response.status, 'PARSE_ERROR');
  }

  if (!response.ok) {
    const message = json.error?.message || `Server error: HTTP ${response.status}`;
    const code = json.error?.code || 'UNKNOWN';
    throw new ApiError(message, response.status, code);
  }

  return json;
}
