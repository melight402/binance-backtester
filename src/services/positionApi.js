const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';
const DEFAULT_TIMEOUT_MS = 15000;

async function parseResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : await response.text().catch(() => '');

  if (!response.ok) {
    const message = typeof body === 'object' ? body.error || body.message : body;
    const error = new Error(message || `Position API request failed (${response.status})`);
    error.status = response.status;
    error.details = body;
    error.code = typeof body === 'object' ? body.code || body.binanceError?.code || null : null;
    error.binanceError = typeof body === 'object' ? body.binanceError || null : null;
    throw error;
  }

  return body;
}

async function request(path, formData, timeoutMs = DEFAULT_TIMEOUT_MS, signal) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const abortRequest = () => controller.abort();
  signal?.addEventListener('abort', abortRequest, { once: true });
  try {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
    return await parseResponse(response);
  } catch (error) {
    if (error.name === 'AbortError') {
      if (signal?.aborted) {
        throw new Error('Position API request was cancelled');
      }
      const timeoutError = new Error(`Position API request timed out after ${timeoutMs}ms`);
      timeoutError.code = 'POSITION_API_TIMEOUT';
      throw timeoutError;
    }
    if (error instanceof TypeError) {
      const networkError = new Error('Position backend is unavailable');
      networkError.code = 'POSITION_API_UNAVAILABLE';
      networkError.cause = error;
      throw networkError;
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abortRequest);
  }
}

function createMultipart(fieldName, data, screenshotBlob) {
  const formData = new FormData();
  formData.append(fieldName, JSON.stringify(data));
  if (screenshotBlob) formData.append('screenshot', screenshotBlob, 'screenshot.png');
  return formData;
}

export function openHistoryPosition(positionData, screenshotBlob, timeoutMs, signal) {
  return request('/positions/history/open', createMultipart('positionData', positionData, screenshotBlob), timeoutMs, signal);
}

export function closeHistoryPosition(closeData, screenshotBlob, timeoutMs, signal) {
  return request('/positions/history/close', createMultipart('closeData', closeData, screenshotBlob), timeoutMs, signal);
}

export function uploadScreenshot(screenshotBlob, timeoutMs, signal) {
  const formData = new FormData();
  formData.append('screenshot', screenshotBlob, 'screenshot.png');
  return request('/screenshots/upload', formData, timeoutMs, signal);
}
