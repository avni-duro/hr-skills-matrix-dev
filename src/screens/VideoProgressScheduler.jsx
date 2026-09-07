import React, { useState, useEffect, useCallback, useContext } from 'react';
import { supabase } from '../supabaseClient';
import { AuthContext } from '../contexts/AuthContext';
import '../styles/VideoProgressScheduler.css';

const FREQUENCIES = [
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' }
];

const DAYS_OF_WEEK = [
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'
];

const VideoProgressScheduler = () => {
    const { user } = useContext(AuthContext);
    const [schedules, setSchedules] = useState([]);
    const [users, setUsers] = useState([]);
    const [branches, setBranches] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);

    const [formData, setFormData] = useState({
        target_user_id: '',
        frequency: 'weekly',
        schedule_days: '',
        send_time: '09:00',
        recipient_emails: '',
        branch_id: '',
        is_active: true
    });

    // Fetch schedules
    const fetchSchedules = useCallback(async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('video_progress_report_schedules')
                .select(`
                    *,
                    target_user:target_user_id(id, full_name, email),
                    created_by_user:created_by(id, full_name),
                    branch:branch_id(id, branch_name)
                `)
                .order('created_at', { ascending: false });

            // If admin, only show their schedules
            if (user?.role === 'admin') {
                query = query.eq('created_by', user.id);
            }

            const { data, error: err } = await query;
            if (err) throw err;

            setSchedules(data || []);
            setError('');
        } catch (err) {
            console.error('Error fetching schedules:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [user?.id, user?.role]);

    // Fetch users for dropdown
    const fetchUsers = useCallback(async () => {
        try {
            const { data, error: err } = await supabase
                .from('users')
                .select('id, full_name, email')
                .eq('status', 'active')
                .order('full_name', { ascending: true });

            if (err) throw err;
            setUsers(data || []);
        } catch (err) {
            console.error('Error fetching users:', err);
        }
    }, []);

    // Fetch branches for dropdown
    const fetchBranches = useCallback(async () => {
        try {
            const { data, error: err } = await supabase
                .from('branch_master')
                .select('id, branch_name')
                .order('branch_name', { ascending: true });

            if (err) throw err;
            setBranches(data || []);
        } catch (err) {
            console.error('Error fetching branches:', err);
        }
    }, []);

    useEffect(() => {
        fetchSchedules();
        fetchUsers();
        fetchBranches();
    }, [fetchSchedules, fetchUsers, fetchBranches]);

    const handleInputChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleDayToggle = (day) => {
        const days = formData.schedule_days ? formData.schedule_days.split(',') : [];
        const dayKey = day.toLowerCase();
        
        if (days.includes(dayKey)) {
            setFormData(prev => ({
                ...prev,
                schedule_days: days.filter(d => d !== dayKey).join(',')
            }));
        } else {
            days.push(dayKey);
            setFormData(prev => ({
                ...prev,
                schedule_days: days.join(',')
            }));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);

        try {
            // Validate required fields
            if (!formData.target_user_id || !formData.recipient_emails) {
                setError('Please fill in all required fields');
                setLoading(false);
                return;
            }

            // For weekly frequency, ensure days are selected
            if (formData.frequency === 'weekly' && !formData.schedule_days) {
                setError('Please select at least one day for weekly schedule');
                setLoading(false);
                return;
            }

            const payload = {
                ...formData,
                created_by: user.id,
                recipient_emails: formData.recipient_emails.split(',').map(e => e.trim()).join(', ')
            };

            let result;
            if (editingId) {
                result = await supabase
                    .from('video_progress_report_schedules')
                    .update(payload)
                    .eq('id', editingId);
            } else {
                result = await supabase
                    .from('video_progress_report_schedules')
                    .insert([payload]);
            }

            if (result.error) throw result.error;

            // Reset form
            setFormData({
                target_user_id: '',
                frequency: 'weekly',
                schedule_days: '',
                send_time: '09:00',
                recipient_emails: '',
                branch_id: '',
                is_active: true
            });
            setEditingId(null);
            setShowForm(false);
            setError('');

            // Refresh schedules
            await fetchSchedules();
        } catch (err) {
            console.error('Error saving schedule:', err);
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleEdit = (schedule) => {
        setFormData({
            target_user_id: schedule.target_user_id,
            frequency: schedule.frequency,
            schedule_days: schedule.schedule_days || '',
            send_time: schedule.send_time || '09:00',
            recipient_emails: schedule.recipient_emails?.replace(/, /g, ', '),
            branch_id: schedule.branch_id || '',
            is_active: schedule.is_active
        });
        setEditingId(schedule.id);
        setShowForm(true);
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this schedule?')) return;

        try {
            const { error: err } = await supabase
                .from('video_progress_report_schedules')
                .delete()
                .eq('id', id);

            if (err) throw err;
            await fetchSchedules();
        } catch (err) {
            console.error('Error deleting schedule:', err);
            setError(err.message);
        }
    };

    const handleCancel = () => {
        setShowForm(false);
        setEditingId(null);
        setFormData({
            target_user_id: '',
            frequency: 'weekly',
            schedule_days: '',
            send_time: '09:00',
            recipient_emails: '',
            branch_id: '',
            is_active: true
        });
    };

    const getScheduleDescription = (schedule) => {
        let desc = `${schedule.frequency.charAt(0).toUpperCase() + schedule.frequency.slice(1)}`;
        
        if (schedule.frequency === 'weekly' && schedule.schedule_days) {
            const days = schedule.schedule_days.split(',').map(d => 
                DAYS_OF_WEEK[DAYS_OF_WEEK.map(d => d.toLowerCase()).indexOf(d.trim())]
            );
            desc += ` on ${days.join(', ')}`;
        } else if (schedule.frequency === 'monthly' && schedule.schedule_days) {
            desc += ` on day ${schedule.schedule_days}`;
        }
        
        desc += ` at ${schedule.send_time}`;
        return desc;
    };

    return (
        <div className="video-progress-scheduler-container">
            <div className="scheduler-header">
                <h1>Video Progress Report Scheduler</h1>
                <button 
                    className="btn-primary"
                    onClick={() => setShowForm(!showForm)}
                    disabled={loading}
                >
                    {showForm ? 'Cancel' : '+ New Schedule'}
                </button>
            </div>

            {error && <div className="error-message">{error}</div>}

            {showForm && (
                <div className="scheduler-form-container">
                    <h2>{editingId ? 'Edit Schedule' : 'Create New Schedule'}</h2>
                    <form onSubmit={handleSubmit} className="scheduler-form">
                        <div className="form-group">
                            <label htmlFor="target_user_id">
                                Target User <span className="required">*</span>
                            </label>
                            <select
                                id="target_user_id"
                                name="target_user_id"
                                value={formData.target_user_id}
                                onChange={handleInputChange}
                                required
                            >
                                <option value="">Select User</option>
                                {users.map(u => (
                                    <option key={u.id} value={u.id}>
                                        {u.full_name} ({u.email})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="form-group">
                            <label htmlFor="frequency">
                                Frequency <span className="required">*</span>
                            </label>
                            <select
                                id="frequency"
                                name="frequency"
                                value={formData.frequency}
                                onChange={handleInputChange}
                            >
                                {FREQUENCIES.map(freq => (
                                    <option key={freq.value} value={freq.value}>
                                        {freq.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        {formData.frequency === 'weekly' && (
                            <div className="form-group">
                                <label>
                                    Days of Week <span className="required">*</span>
                                </label>
                                <div className="days-selector">
                                    {DAYS_OF_WEEK.map(day => (
                                        <label key={day} className="day-checkbox">
                                            <input
                                                type="checkbox"
                                                checked={formData.schedule_days
                                                    .split(',')
                                                    .includes(day.toLowerCase())}
                                                onChange={() => handleDayToggle(day)}
                                            />
                                            {day.substring(0, 3)}
                                        </label>
                                    ))}
                                </div>
                            </div>
                        )}

                        {formData.frequency === 'monthly' && (
                            <div className="form-group">
                                <label htmlFor="schedule_days">
                                    Day of Month (1-31) <span className="required">*</span>
                                </label>
                                <input
                                    id="schedule_days"
                                    type="number"
                                    name="schedule_days"
                                    min="1"
                                    max="31"
                                    value={formData.schedule_days}
                                    onChange={handleInputChange}
                                    placeholder="e.g., 15"
                                />
                            </div>
                        )}

                        <div className="form-group">
                            <label htmlFor="send_time">
                                Send Time <span className="required">*</span>
                            </label>
                            <input
                                id="send_time"
                                type="time"
                                name="send_time"
                                value={formData.send_time}
                                onChange={handleInputChange}
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="recipient_emails">
                                Recipient Emails (comma-separated) <span className="required">*</span>
                            </label>
                            <textarea
                                id="recipient_emails"
                                name="recipient_emails"
                                value={formData.recipient_emails}
                                onChange={handleInputChange}
                                placeholder="email1@example.com, email2@example.com"
                                rows="3"
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="branch_id">Branch Filter (Optional)</label>
                            <select
                                id="branch_id"
                                name="branch_id"
                                value={formData.branch_id}
                                onChange={handleInputChange}
                            >
                                <option value="">All Branches</option>
                                {branches.map(b => (
                                    <option key={b.id} value={b.id}>
                                        {b.branch_name}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className="form-group checkbox">
                            <label>
                                <input
                                    type="checkbox"
                                    name="is_active"
                                    checked={formData.is_active}
                                    onChange={handleInputChange}
                                />
                                Active
                            </label>
                        </div>

                        <div className="form-actions">
                            <button
                                type="submit"
                                className="btn-primary"
                                disabled={loading}
                            >
                                {loading ? 'Saving...' : editingId ? 'Update Schedule' : 'Create Schedule'}
                            </button>
                            <button
                                type="button"
                                className="btn-secondary"
                                onClick={handleCancel}
                                disabled={loading}
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="schedules-list">
                {loading && !showForm ? (
                    <div className="loading">Loading schedules...</div>
                ) : schedules.length === 0 ? (
                    <div className="empty-state">
                        <p>No schedules created yet</p>
                    </div>
                ) : (
                    <div className="schedules-grid">
                        {schedules.map(schedule => (
                            <div key={schedule.id} className="schedule-card">
                                <div className="schedule-header">
                                    <h3>{schedule.target_user?.full_name}</h3>
                                    <span className={`status ${schedule.is_active ? 'active' : 'inactive'}`}>
                                        {schedule.is_active ? 'Active' : 'Inactive'}
                                    </span>
                                </div>

                                <div className="schedule-details">
                                    <p><strong>Report For:</strong> {schedule.target_user?.email}</p>
                                    <p><strong>Schedule:</strong> {getScheduleDescription(schedule)}</p>
                                    <p><strong>Recipients:</strong> {schedule.recipient_emails}</p>
                                    {schedule.branch?.branch_name && (
                                        <p><strong>Branch:</strong> {schedule.branch.branch_name}</p>
                                    )}
                                    {schedule.last_sent_at && (
                                        <p><strong>Last Sent:</strong> {new Date(schedule.last_sent_at).toLocaleString()}</p>
                                    )}
                                    {schedule.next_send_at && (
                                        <p><strong>Next Send:</strong> {new Date(schedule.next_send_at).toLocaleString()}</p>
                                    )}
                                </div>

                                <div className="schedule-created-info">
                                    <small>Created by: {schedule.created_by_user?.full_name}</small>
                                    <small>{new Date(schedule.created_at).toLocaleDateString()}</small>
                                </div>

                                <div className="schedule-actions">
                                    <button
                                        className="btn-edit"
                                        onClick={() => handleEdit(schedule)}
                                        disabled={loading}
                                    >
                                        Edit
                                    </button>
                                    <button
                                        className="btn-delete"
                                        onClick={() => handleDelete(schedule.id)}
                                        disabled={loading}
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
};

export default VideoProgressScheduler;
