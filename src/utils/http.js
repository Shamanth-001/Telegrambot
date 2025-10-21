import axios from 'axios';
import axiosRetry from 'axios-retry';

const instance = axios.create({
  timeout: 30_000,
  headers: {
    'Accept': 'text/html,application/json;q=0.9,*/*;q=0.8',
  },
});

axiosRetry(instance, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => {
    return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
      (error.response && error.response.status >= 500);
  },
});

// Response interceptor to surface 401 Unauthorized with context
instance.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    if (status === 401) {
      const url = error?.config?.url;
      const headers = error?.response?.headers;
      const data = error?.response?.data;
      // eslint-disable-next-line no-console
      console.error('[HTTP 401]', { url, headers, data });
    }
    return Promise.reject(error);
  }
);

export const http = instance;
