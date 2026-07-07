import React, { useState, useEffect, useCallback } from 'react';
import { auth, users as usersApi } from '../services/api';

function PasswordTab({ user }) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('All fields are required');
      return;
    }

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    if (currentPassword === newPassword) {
      setError('New password must differ from current password');
      return;
    }

    setLoading(true);
    try {
      await auth.changePassword(currentPassword, newPassword);
      setSuccess('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: '480px' }}>
      <h2 style={{ fontSize: '1.25rem', marginBottom: '0.5rem' }}>Change Password</h2>
      <p style={{ color: '#666', marginBottom: '1.5rem', fontSize: '0.875rem' }}>
        Update your account password. You will stay logged in after the change.
      </p>

      {error && (
        <div style={errorBoxStyle}>{error}</div>
      )}
      {success && (
        <div style={successBoxStyle}>{success}</div>
      )}

      <form onSubmit={handleSubmit}>
        <input
          type="password"
          placeholder="Current password"
          value={currentPassword}
          onChange={e => setCurrentPassword(e.target.value)}
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="New password (min 8 characters)"
          value={newPassword}
          onChange={e => setNewPassword(e.target.value)}
          style={inputStyle}
        />
        <input
          type="password"
          placeholder="Confirm new password"
          value={confirmPassword}
          onChange={e => setConfirmPassword(e.target.value)}
          style={inputStyle}
        />
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '0.75rem 1.5rem',
            marginTop: '0.5rem',
            background: loading ? '#9ca3af' : '#22c55e',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '1rem',
            fontWeight: 'bold',
            cursor: loading ? 'default' : 'pointer'
          }}
        >
          {loading ? 'Changing...' : 'Change Password'}
        </button>
      </form>
    </div>
  );
}

function UsersTab() {
  const [userList, setUserList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await usersApi.list();
      setUserList(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleDelete = async (user) => {
    if (!window.confirm(`Delete user "${user.username}"? This cannot be undone.`)) return;
    try {
      await usersApi.delete(user.id);
      setUserList(prev => prev.filter(u => u.id !== user.id));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Manage Users</h2>
        <button
          onClick={() => { setEditingUser(null); setShowForm(true); }}
          style={primaryBtnStyle}
        >
          + Add User
        </button>
      </div>

      {error && <div style={errorBoxStyle}>{error}</div>}

      {showForm && (
        <UserForm
          user={editingUser}
          onDone={() => { setShowForm(false); setEditingUser(null); loadUsers(); }}
          onError={setError}
        />
      )}

      {loading ? (
        <p style={{ color: '#666' }}>Loading users...</p>
      ) : userList.length === 0 ? (
        <p style={{ color: '#666' }}>No users found.</p>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid #e5e7eb' }}>
              <th style={thStyle}>Username</th>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>Role</th>
              <th style={thStyle}>Last Login</th>
              <th style={thStyle}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {userList.map(u => (
              <tr key={u.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
                <td style={tdStyle}>
                  {u.username}
                  {u.mustChangePassword && (
                    <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', color: '#d97706' }}>
                      (pending)
                    </span>
                  )}
                </td>
                <td style={tdStyle}>{u.email || '-'}</td>
                <td style={tdStyle}>
                  <RoleBadge role={u.role} />
                </td>
                <td style={tdStyle}>
                  {u.lastLogin ? new Date(u.lastLogin).toLocaleString() : 'Never'}
                </td>
                <td style={tdStyle}>
                  <button
                    onClick={() => { setEditingUser(u); setShowForm(true); }}
                    style={actionBtnStyle}
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(u)}
                    style={{ ...actionBtnStyle, color: '#ef4444' }}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function UserForm({ user, onDone, onError }) {
  const [username, setUsername] = useState(user ? user.username : '');
  const [email, setEmail] = useState(user ? (user.email || '') : '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(user ? user.role : 'VIEWER');
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (user) {
        const data = {};
        if (email !== (user.email || '')) data.email = email || null;
        if (role !== user.role) data.role = role;
        if (password) data.password = password;
        if (Object.keys(data).length === 0) {
          onError('No changes made');
          setSaving(false);
          return;
        }
        await usersApi.update(user.id, data);
      } else {
        if (!username || !password) {
          onError('Username and password are required');
          setSaving(false);
          return;
        }
        if (password.length < 8) {
          onError('Password must be at least 8 characters');
          setSaving(false);
          return;
        }
        await usersApi.create({ username, email: email || undefined, password, role });
      }
      onDone();
    } catch (err) {
      onError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      background: '#f9fafb',
      padding: '1.25rem',
      borderRadius: '6px',
      marginBottom: '1.5rem',
      border: '1px solid #e5e7eb'
    }}>
      <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem' }}>
        {user ? `Edit User: ${user.username}` : 'Add New User'}
      </h3>
      <form onSubmit={handleSubmit}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div>
            <label style={labelStyle}>Username</label>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              disabled={!!user}
              style={inputStyle}
              placeholder="Username"
            />
          </div>
          <div>
            <label style={labelStyle}>Email</label>
            <input
              value={email}
              onChange={e => setEmail(e.target.value)}
              style={inputStyle}
              placeholder="user@example.com"
            />
          </div>
          <div>
            <label style={labelStyle}>
              {user ? 'New password (leave blank to keep)' : 'Password'}
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              style={inputStyle}
              placeholder={user ? 'Leave blank to keep' : 'Min 8 characters'}
            />
          </div>
          <div>
            <label style={labelStyle}>Role</label>
            <select value={role} onChange={e => setRole(e.target.value)} style={inputStyle}>
              <option value="ADMIN">Admin</option>
              <option value="EDITOR">Editor</option>
              <option value="VIEWER">Viewer</option>
            </select>
          </div>
        </div>
        <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
          <button type="submit" disabled={saving} style={primaryBtnStyle}>
            {saving ? 'Saving...' : (user ? 'Save Changes' : 'Create User')}
          </button>
          <button type="button" onClick={onDone} style={secondaryBtnStyle}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

function RoleBadge({ role }) {
  const colors = {
    ADMIN: { bg: '#fef3c7', color: '#92400e' },
    EDITOR: { bg: '#dbeafe', color: '#1e40af' },
    VIEWER: { bg: '#e5e7eb', color: '#374151' }
  };
  const c = colors[role] || colors.VIEWER;
  return (
    <span style={{
      padding: '0.2rem 0.6rem',
      borderRadius: '10px',
      fontSize: '0.8rem',
      fontWeight: 'bold',
      background: c.bg,
      color: c.color
    }}>
      {role}
    </span>
  );
}

export default function Settings({ user }) {
  const [activeTab, setActiveTab] = useState('password');

  const tabs = [{ id: 'password', label: 'Password' }];
  if (user?.role === 'ADMIN') {
    tabs.push({ id: 'users', label: 'Users' });
  }

  return (
    <div style={{
      background: 'white',
      padding: '1.5rem',
      borderRadius: '8px',
      boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
    }}>
      <h2 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Settings</h2>

      <div style={{ display: 'flex', gap: '0', borderBottom: '2px solid #e5e7eb', marginBottom: '1.5rem' }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '0.6rem 1.25rem',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontWeight: activeTab === tab.id ? 'bold' : 'normal',
              color: activeTab === tab.id ? '#22c55e' : '#666',
              borderBottom: activeTab === tab.id ? '2px solid #22c55e' : '2px solid transparent',
              marginBottom: '-2px',
              fontSize: '0.95rem'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'password' && <PasswordTab user={user} />}
      {activeTab === 'users' && <UsersTab />}
    </div>
  );
}

const inputStyle = {
  display: 'block',
  width: '100%',
  padding: '0.65rem 0.75rem',
  margin: '0.35rem 0',
  border: '1px solid #ddd',
  borderRadius: '4px',
  fontSize: '0.9rem',
  boxSizing: 'border-box'
};

const labelStyle = {
  display: 'block',
  fontSize: '0.8rem',
  fontWeight: 'bold',
  color: '#374151',
  marginBottom: '0.15rem'
};

const primaryBtnStyle = {
  padding: '0.6rem 1.25rem',
  background: '#22c55e',
  color: 'white',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontWeight: 'bold',
  fontSize: '0.9rem'
};

const secondaryBtnStyle = {
  padding: '0.6rem 1.25rem',
  background: '#e5e7eb',
  color: '#374151',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontWeight: 'bold',
  fontSize: '0.9rem'
};

const actionBtnStyle = {
  padding: '0.3rem 0.75rem',
  marginRight: '0.35rem',
  background: 'transparent',
  color: '#3b82f6',
  border: '1px solid #d1d5db',
  borderRadius: '4px',
  cursor: 'pointer',
  fontSize: '0.8rem'
};

const thStyle = {
  padding: '0.65rem 0.75rem',
  textAlign: 'left',
  fontSize: '0.8rem',
  fontWeight: 'bold',
  color: '#6b7280',
  textTransform: 'uppercase'
};

const tdStyle = {
  padding: '0.65rem 0.75rem',
  fontSize: '0.9rem'
};

const errorBoxStyle = {
  padding: '0.75rem',
  background: '#fee2e2',
  color: '#991b1b',
  borderRadius: '4px',
  marginBottom: '1rem',
  fontSize: '0.875rem'
};

const successBoxStyle = {
  padding: '0.75rem',
  background: '#d1fae5',
  color: '#065f46',
  borderRadius: '4px',
  marginBottom: '1rem',
  fontSize: '0.875rem'
};
