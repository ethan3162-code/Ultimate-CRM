import { useEffect, useState } from 'react';
import { api } from '../api';

/** "Next step" tasks attached to a single record (HubSpot/monday.com-style checklist). */
export default function TaskList({ relatedType, relatedId }) {
  const [tasks, setTasks] = useState(null);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [directory, setDirectory] = useState([]);

  function load() {
    api.tasks({ related_type: relatedType, related_id: relatedId }).then(setTasks);
  }
  useEffect(load, [relatedType, relatedId]);
  useEffect(() => { api.usersDirectory().then(setDirectory).catch(() => setDirectory([])); }, []);

  async function addTask(e) {
    e.preventDefault();
    if (!title.trim()) return;
    await api.createTask({
      related_type: relatedType, related_id: relatedId, title: title.trim(),
      due_date: dueDate || null, assigned_user_id: assignedTo ? Number(assignedTo) : null,
    });
    setTitle('');
    setDueDate('');
    setAssignedTo('');
    load();
  }

  async function toggle(task) {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, done: t.done ? 0 : 1 } : t)));
    await api.updateTask(task.id, { done: task.done ? 0 : 1 });
  }

  async function remove(id) {
    await api.deleteTask(id);
    load();
  }

  if (!tasks) return null;

  const today = new Date().toISOString().slice(0, 10);
  const open = tasks.filter((t) => !t.done);
  const done = tasks.filter((t) => t.done);

  return (
    <div className="task-list">
      <form onSubmit={addTask} className="row" style={{ gap: 6, marginBottom: 10 }}>
        <input
          placeholder="Add a next step…" value={title} onChange={(e) => setTitle(e.target.value)}
          style={{ flex: 1, border: '1px solid var(--line)', borderRadius: 8, padding: '6px 10px', background: 'var(--paper)' }}
        />
        <input
          type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
          style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '6px 8px', background: 'var(--paper)' }}
        />
        <select
          value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} title="Assign to — emails them a reminder if there's also a due date"
          style={{ border: '1px solid var(--line)', borderRadius: 8, padding: '6px 8px', background: 'var(--paper)', maxWidth: 130 }}
        >
          <option value="">Unassigned</option>
          {directory.map((u) => <option key={u.id} value={u.id}>{u.username}</option>)}
        </select>
        <button className="btn sm" type="submit">Add</button>
      </form>

      {open.length === 0 && done.length === 0 && <div className="empty" style={{ padding: '6px 0' }}>No tasks yet.</div>}

      {open.map((t) => (
        <label key={t.id} className="task-row">
          <input type="checkbox" checked={!!t.done} onChange={() => toggle(t)} />
          <span className="task-title">{t.title}</span>
          {t.assigned_username && <span className="pill" title="Assigned to">{t.assigned_username}</span>}
          {t.due_date && <span className={'task-due' + (t.due_date < today ? ' overdue' : '')}>{t.due_date}</span>}
          <button type="button" className="btn subtle sm" onClick={() => remove(t.id)}>✕</button>
        </label>
      ))}

      {done.length > 0 && (
        <details style={{ marginTop: 8 }}>
          <summary className="muted" style={{ fontSize: 12.5, cursor: 'pointer' }}>{done.length} done</summary>
          {done.map((t) => (
            <label key={t.id} className="task-row done">
              <input type="checkbox" checked={!!t.done} onChange={() => toggle(t)} />
              <span className="task-title">{t.title}</span>
              <button type="button" className="btn subtle sm" onClick={() => remove(t.id)}>✕</button>
            </label>
          ))}
        </details>
      )}
    </div>
  );
}
