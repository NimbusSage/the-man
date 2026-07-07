// apps/web/src/services/api.js

/**
 * The MAN API Client
 * Pure JavaScript API wrapper for The MAN backend
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || '';
const API_VERSION = 'v1';

/**
 * Get stored JWT token
 * @returns {string|null}
 */
const getToken = () => {
  return localStorage.getItem('theman_token');
};

/**
 * Set JWT token
 * @param {string} token
 */
const setToken = (token) => {
  localStorage.setItem('theman_token', token);
};

/**
 * Clear JWT token
 */
const clearToken = () => {
  localStorage.removeItem('theman_token');
};

/**
 * Make API request
 * @param {string} endpoint
 * @param {Object} options
 * @returns {Promise<any>}
 */
async function request(endpoint, options = {}) {
  const url = `${API_BASE_URL}/api/${API_VERSION}${endpoint}`;
  const token = getToken();
  
  const isFormData = options.body instanceof FormData;
  const headers = {
    ...(!isFormData && { 'Content-Type': 'application/json' }),
    ...options.headers,
  };
  
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  
  try {
    const response = await fetch(url, {
      ...options,
      headers,
    });
    
    // Handle non-2xx responses
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ 
        error: `HTTP ${response.status} - ${response.statusText}`,
        message: `HTTP ${response.status}`
      }));
      
      // Log the error for debugging
      console.error('API Error:', response.status, errorData);
      
      // Throw a more descriptive error
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }
    
    // For successful responses, return the JSON data
    return await response.json();
  } catch (error) {
    console.error('API request failed:', error);
    
    // Re-throw the error so the calling function can handle it
    throw error;
  }
}

// ============================================================================
// Authentication API
// ============================================================================

export const auth = {
/**
 * Login user
 * @param {string} username
 * @param {string} password
 * @returns {Promise<{token: string, user: Object}>}
 */
async login(username, password) {
  try {
    const data = await request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    
    if (!data || !data.token) {
      throw new Error('Invalid response from server - no token received');
    }
    
    setToken(data.token);
    return data;
  } catch (error) {
    console.error('Login error:', error);
    throw error;
  }
},

  /**
   * Logout current user
   */
  async logout() {
    try {
      await request('/auth/logout', { method: 'POST' });
    } finally {
      clearToken();
    }
  },

  /**
   * Get current user info
   * @returns {Promise<Object>}
   */
  async me() {
    return await request('/auth/me');
  },

  /**
   * Change password for current user
   * @param {string} currentPassword
   * @param {string} newPassword
   * @returns {Promise<Object>}
   */
  async changePassword(currentPassword, newPassword) {
    return await request('/auth/password', {
      method: 'PATCH',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },
};

// ============================================================================
// Devices API
// ============================================================================

export const devices = {
  /**
   * List all devices
   * @param {Object} params - Query parameters
   * @returns {Promise<{devices: Array, total: number, limit: number, offset: number}>}
   */
  async list(params = {}) {
    const query = new URLSearchParams(params).toString();
    const endpoint = `/devices${query ? `?${query}` : ''}`;
    return await request(endpoint);
  },

  /**
   * Export devices list
   * @param {Object} params - Same filter params as list()
   * @param {'csv'|'json'} format
   * @returns {Promise<Blob>}
   */
  async exportList(params = {}, format = 'csv') {
    const query = new URLSearchParams({ ...params, export: format }).toString();
    const url = `${API_BASE_URL}/api/${API_VERSION}/devices?${query}`;
    const token = getToken();
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Export failed: ${response.status}`);
    return await response.blob();
  },

  /**
   * Get device by ID
   * @param {string} id
   * @returns {Promise<Object>}
   */
  async get(id) {
    return await request(`/devices/${id}`);
  },

  /**
   * Create new device
   * @param {Object} device
   * @returns {Promise<Object>}
   */
  async create(device) {
    return await request('/devices', {
      method: 'POST',
      body: JSON.stringify(device),
    });
  },

  /**
   * Update device
   * @param {string} id
   * @param {Object} updates
   * @returns {Promise<Object>}
   */
  async update(id, updates) {
    return await request(`/devices/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  /**
   * Delete device
   * @param {string} id
   * @returns {Promise<void>}
   */
  async delete(id) {
    return await request(`/devices/${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * Ack/unack a device (suppress alerts)
   * @param {string} id
   * @param {Object} data - { acked: boolean, note?: string }
   * @returns {Promise<Object>}
   */
  async ack(id, data) {
    return await request(`/devices/${id}/ack`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  /**
   * Get distinct device types
   * @returns {Promise<string[]>}
   */
  async types() {
    return await request('/devices/types');
  },

  /**
   * Get device metrics
   * @param {string} id
   * @param {Object} params - Time range parameters
   * @returns {Promise<Array>}
   */
  async getMetrics(id, params = {}) {
    const query = new URLSearchParams(params).toString();
    return await request(`/devices/${id}/metrics?${query}`);
  },
};

// ============================================================================
// Discovery API
// ============================================================================

export const discovery = {
  /**
   * Start network scan
   * @param {Object} config - Scan configuration
   * @returns {Promise<{jobId: string}>}
   */
  async startScan(config) {
    return await request('/discovery/scan', {
      method: 'POST',
      body: JSON.stringify(config),
    });
  },

  /**
   * Get scan job status
   * @param {string} jobId
   * @returns {Promise<Object>}
   */
  async getJob(jobId) {
    return await request(`/discovery/jobs/${jobId}`);
  },

  /**
   * Import a MikroTik Dude database file
   * @param {File} file - a Dude .db export (plain or gzipped)
   * @returns {Promise<{jobId: string, status: string}>}
   */
  async importFromDude(file) {
    const formData = new FormData();
    formData.append('file', file);

    return await request('/discovery/import/dude', {
      method: 'POST',
      body: formData,
    });
  },
};

// ============================================================================
// Maps API
// ============================================================================

export const maps = {
  /**
   * Get full map tree (nested hierarchy)
   * @returns {Promise<Array>}
   */
  async tree() {
    return await request('/maps/tree');
  },

  /**
   * List all maps (flat)
   * @param {Object} params
   * @returns {Promise<Array>}
   */
  async list(params = {}) {
    const query = new URLSearchParams(params).toString();
    return await request(`/maps${query ? `?${query}` : ''}`);
  },

  /**
   * Get map by ID with devices and submaps
   * @param {string} id
   * @returns {Promise<Object>}
   */
  async get(id) {
    return await request(`/maps/${id}`);
  },

  /**
   * Create new map
   * @param {Object} map
   * @returns {Promise<Object>}
   */
  async create(map) {
    return await request('/maps', {
      method: 'POST',
      body: JSON.stringify(map),
    });
  },

  /**
   * Update map
   * @param {string} id
   * @param {Object} updates
   * @returns {Promise<Object>}
   */
  async update(id, updates) {
    return await request(`/maps/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  /**
   * Delete map
   * @param {string} id
   * @returns {Promise<void>}
   */
  async delete(id) {
    return await request(`/maps/${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * Update device positions on map
   * @param {string} mapId
   * @param {Array} positions - Array of {deviceId, x, y}
   * @returns {Promise<void>}
   */
  async updateLayout(mapId, positions) {
    return await request(`/maps/${mapId}/layout`, {
      method: 'PUT',
      body: JSON.stringify({ positions }),
    });
  },
};

// ============================================================================
// Services API
// ============================================================================

export const services = {
  /**
   * List all services
   * @param {Object} params
   * @returns {Promise<Array>}
   */
  async list(params = {}) {
    const query = new URLSearchParams(params).toString();
    return await request(`/services${query ? `?${query}` : ''}`);
  },

  /**
   * Create new service
   * @param {Object} service
   * @returns {Promise<Object>}
   */
  async create(service) {
    return await request('/services', {
      method: 'POST',
      body: JSON.stringify(service),
    });
  },

  /**
   * Update service
   * @param {string} id
   * @param {Object} updates
   * @returns {Promise<Object>}
   */
  async update(id, updates) {
    return await request(`/services/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  /**
   * Delete service
   * @param {string} id
   * @returns {Promise<void>}
   */
  async delete(id) {
    return await request(`/services/${id}`, {
      method: 'DELETE',
    });
  },

  /**
   * Test service manually
   * @param {string} id
   * @returns {Promise<Object>}
   */
  async test(id) {
    return await request(`/services/${id}/test`, {
      method: 'POST',
    });
  },
};

// ============================================================================
// Alerts API
// ============================================================================

export const alerts = {
  /**
   * List alerts
   * @param {Object} params
   * @returns {Promise<Array>}
   */
  async list(params = {}) {
    const query = new URLSearchParams(params).toString();
    return await request(`/alerts${query ? `?${query}` : ''}`);
  },

  /**
   * Get alert by ID
   * @param {string} id
   * @returns {Promise<Object>}
   */
  async get(id) {
    return await request(`/alerts/${id}`);
  },

  /**
   * Acknowledge alert
   * @param {string} id
   * @returns {Promise<Object>}
   */
  async acknowledge(id) {
    return await request(`/alerts/${id}/acknowledge`, {
      method: 'PUT',
    });
  },

  /**
   * Resolve alert
   * @param {string} id
   * @returns {Promise<Object>}
   */
  async resolve(id) {
    return await request(`/alerts/${id}/resolve`, {
      method: 'PUT',
    });
  },
};

// ============================================================================
// Alert Rules API
// ============================================================================

export const alertRules = {
  /**
   * List alert rules
   * @returns {Promise<Array>}
   */
  async list() {
    return await request('/alert-rules');
  },

  /**
   * Create alert rule
   * @param {Object} rule
   * @returns {Promise<Object>}
   */
  async create(rule) {
    return await request('/alert-rules', {
      method: 'POST',
      body: JSON.stringify(rule),
    });
  },

  /**
   * Update alert rule
   * @param {string} id
   * @param {Object} updates
   * @returns {Promise<Object>}
   */
  async update(id, updates) {
    return await request(`/alert-rules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  /**
   * Delete alert rule
   * @param {string} id
   * @returns {Promise<void>}
   */
  async delete(id) {
    return await request(`/alert-rules/${id}`, {
      method: 'DELETE',
    });
  },
};

// ============================================================================
// Users API
// ============================================================================

export const users = {
  /**
   * List all users (admin only)
   * @returns {Promise<Array>}
   */
  async list() {
    return await request('/users');
  },

  /**
   * Create user (admin only)
   * @param {Object} data - { username, email?, password, role? }
   * @returns {Promise<Object>}
   */
  async create(data) {
    return await request('/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Update user (admin only)
   * @param {string} id
   * @param {Object} data - { email?, role?, password? }
   * @returns {Promise<Object>}
   */
  async update(id, data) {
    return await request(`/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  /**
   * Delete user (admin only)
   * @param {string} id
   * @returns {Promise<Object>}
   */
  async delete(id) {
    return await request(`/users/${id}`, {
      method: 'DELETE',
    });
  },
};

// ============================================================================
// System API
// ============================================================================

export const system = {
  /**
   * Health check
   * @returns {Promise<Object>}
   */
  async health() {
    return await request('/system/health');
  },

  /**
   * Get system statistics
   * @returns {Promise<Object>}
   */
  async stats() {
    return await request('/system/stats');
  },

  /**
   * Create backup
   * @returns {Promise<{url: string}>}
   */
  async backup() {
    return await request('/system/backup', {
      method: 'POST',
    });
  },

  /**
   * Restore from backup
   * @param {File} file
   * @returns {Promise<void>}
   */
  async restore(file) {
    const formData = new FormData();
    formData.append('backup', file);
    
    return await request('/system/restore', {
      method: 'POST',
      body: formData,
      headers: {}, // Let browser set content-type for FormData
    });
  },
};

// Export all API modules
export default {
  auth,
  devices,
  discovery,
  maps,
  services,
  alerts,
  alertRules,
  users,
  system,
};
