import React, { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { auth, db } from './firebase';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query as fbQuery,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';

const todayISO = () => new Date().toISOString().slice(0, 10);

const toDateOnly = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  if (value?.toDate) return value.toDate().toISOString().slice(0, 10);
  return '';
};

const getWeekRange = (dateString = todayISO()) => {
  const date = new Date(`${dateString}T00:00:00`);
  const day = date.getDay() || 7;
  const monday = new Date(date);
  monday.setDate(date.getDate() - day + 1);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday.toISOString().slice(0, 10),
    end: sunday.toISOString().slice(0, 10),
  };
};

const monthStart = () => {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`;
};

const formatNumber = (value) => new Intl.NumberFormat('vi-VN').format(value || 0);

const normalizeClassList = (value) =>
  String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

const sumBy = (items, keyFn, valueFn) => {
  const map = new Map();
  items.forEach((item) => {
    const key = keyFn(item) || 'Chưa phân loại';
    const current = map.get(key) || { key, count: 0, point: 0 };
    current.count += 1;
    current.point += Number(valueFn(item) || 0);
    map.set(key, current);
  });
  return Array.from(map.values()).sort((a, b) => b.point - a.point || a.key.localeCompare(b.key, 'vi'));
};

function App() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [violationTypes, setViolationTypes] = useState([]);
  const [violations, setViolations] = useState([]);
  const [users, setUsers] = useState([]);

  const [activeTab, setActiveTab] = useState('dashboard');

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoadingAuth(false);
      if (!currentUser) {
        setProfile(null);
        setActiveTab('dashboard');
      }
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user?.uid) return undefined;
    const unsub = onSnapshot(doc(db, 'users', user.uid), (snapshot) => {
      setProfile(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
    });
    return unsub;
  }, [user?.uid]);

  useEffect(() => {
    if (!user) return undefined;

    const unsubs = [
      onSnapshot(fbQuery(collection(db, 'classes'), orderBy('className', 'asc')), (snapshot) => {
        setClasses(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      }),
      onSnapshot(collection(db, 'students'), (snapshot) => {
        const rows = snapshot.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .sort((a, b) => `${a.className || ''} ${a.fullName || ''}`.localeCompare(`${b.className || ''} ${b.fullName || ''}`, 'vi'));
        setStudents(rows);
      }),
      onSnapshot(fbQuery(collection(db, 'violationTypes'), orderBy('name', 'asc')), (snapshot) => {
        setViolationTypes(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      }),
      onSnapshot(fbQuery(collection(db, 'violations'), orderBy('date', 'desc')), (snapshot) => {
        setViolations(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      }),
      onSnapshot(fbQuery(collection(db, 'users'), orderBy('name', 'asc')), (snapshot) => {
        setUsers(snapshot.docs.map((item) => ({ id: item.id, ...item.data() })));
      }),
    ];

    return () => unsubs.forEach((unsub) => unsub());
  }, [user]);

  const isAdmin = profile?.role === 'admin';

  const allowedClassNames = useMemo(() => {
    if (isAdmin) return classes.map((item) => item.className);
    const assigned = profile?.assignedClasses || [];
    const homeroom = profile?.homeroomClass ? [profile.homeroomClass] : [];
    return Array.from(new Set([...assigned, ...homeroom])).filter(Boolean);
  }, [classes, isAdmin, profile]);

  const allowedClasses = useMemo(() => {
    if (isAdmin) return classes;
    return classes.filter((item) => allowedClassNames.includes(item.className));
  }, [classes, isAdmin, allowedClassNames]);

  const scopedViolations = useMemo(() => {
    if (isAdmin) return violations;
    if (allowedClassNames.length === 0) return [];
    return violations.filter((item) => allowedClassNames.includes(item.className));
  }, [violations, isAdmin, allowedClassNames]);

  if (loadingAuth) {
    return <FullPageMessage title="Đang tải ứng dụng..." />;
  }

  if (!user) {
    return <AuthView />;
  }

  if (!profile) {
    return <FullPageMessage title="Đang tải hồ sơ tài khoản..." note="Nếu chờ quá lâu, hãy kiểm tra Firestore rules hoặc đăng xuất rồi đăng nhập lại." />;
  }

  const tabs = isAdmin
    ? [
        ['dashboard', 'Tổng quan'],
        ['classes', 'Lớp học'],
        ['students', 'Học sinh'],
        ['types', 'Danh mục lỗi'],
        ['entry', 'Nhập lỗi'],
        ['stats', 'Thống kê'],
        ['users', 'Tài khoản'],
      ]
    : [
        ['dashboard', 'Tổng quan'],
        ['entry', 'Nhập lỗi'],
        ['stats', 'Thống kê'],
      ];

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">TH&THCS Lạc An</p>
          <h1>Quản lí nề nếp học sinh</h1>
          <p className="muted">Theo dõi vi phạm, điểm nề nếp, thống kê lớp và toàn trường.</p>
        </div>
        <div className="account-box">
          <strong>{profile.name || user.email}</strong>
          <span>{profile.role === 'admin' ? 'Quản trị viên' : 'Giáo viên'}</span>
          <button className="ghost-button" onClick={() => signOut(auth)}>Đăng xuất</button>
        </div>
      </header>

      <nav className="tabbar">
        {tabs.map(([key, label]) => (
          <button key={key} className={activeTab === key ? 'active' : ''} onClick={() => setActiveTab(key)}>
            {label}
          </button>
        ))}
      </nav>

      {activeTab === 'dashboard' && (
        <Dashboard
          classes={allowedClasses}
          students={students}
          violations={scopedViolations}
          violationTypes={violationTypes}
          isAdmin={isAdmin}
        />
      )}
      {activeTab === 'classes' && isAdmin && <ClassManager classes={classes} />}
      {activeTab === 'students' && isAdmin && <StudentManager classes={classes} students={students} />}
      {activeTab === 'types' && isAdmin && <ViolationTypeManager violationTypes={violationTypes} />}
      {activeTab === 'entry' && (
        <ViolationEntry
          profile={profile}
          classes={allowedClasses}
          students={students}
          violationTypes={violationTypes}
          allowedClassNames={allowedClassNames}
          isAdmin={isAdmin}
        />
      )}
      {activeTab === 'stats' && (
        <StatsPage
          classes={allowedClasses}
          students={students}
          violations={scopedViolations}
          isAdmin={isAdmin}
        />
      )}
      {activeTab === 'users' && isAdmin && <UserManager users={users} classes={classes} />}
    </div>
  );
}

function FullPageMessage({ title, note }) {
  return (
    <div className="full-page">
      <div className="card narrow-card center">
        <div className="loader" />
        <h2>{title}</h2>
        {note && <p className="muted">{note}</p>}
      </div>
    </div>
  );
}

function AuthView() {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '', adminCode: '' });
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const update = (key, value) => setForm((prev) => ({ ...prev, [key]: value }));

  const handleLogin = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      await signInWithEmailAndPassword(auth, form.email.trim(), form.password);
    } catch (error) {
      setMessage('Không đăng nhập được. Hãy kiểm tra email, mật khẩu hoặc cấu hình Firebase.');
      console.error(error);
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const credential = await createUserWithEmailAndPassword(auth, form.email.trim(), form.password);
      const usersSnapshot = await getDocs(fbQuery(collection(db, 'users'), limit(1)));
      const isFirstUser = usersSnapshot.empty;
      const adminCode = import.meta.env.VITE_ADMIN_INVITE_CODE || '';
      const shouldBeAdmin = isFirstUser || (adminCode && form.adminCode === adminCode);

      await setDoc(doc(db, 'users', credential.user.uid), {
        name: form.name.trim() || form.email.trim(),
        email: form.email.trim(),
        role: shouldBeAdmin ? 'admin' : 'teacher',
        homeroomClass: '',
        assignedClasses: [],
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      setMessage('Không tạo được tài khoản. Hãy kiểm tra email, mật khẩu hoặc Firestore rules.');
      console.error(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-page">
      <section className="hero-panel">
        <p className="eyebrow">Nề nếp học sinh</p>
        <h1>Quản lí vi phạm, điểm thi đua và báo cáo lớp nhanh hơn.</h1>
        <p>
          Bản này hỗ trợ đăng nhập Admin/Giáo viên, tạo lớp, thêm học sinh, tạo danh mục lỗi, nhập lỗi,
          thống kê lớp 7B/toàn trường và xuất báo cáo Excel/PDF.
        </p>
        <div className="feature-grid small">
          <span>Admin quản lí dữ liệu</span>
          <span>Giáo viên nhập lỗi</span>
          <span>Thống kê theo lớp</span>
          <span>Xuất Excel/PDF</span>
        </div>
      </section>

      <section className="card auth-card">
        <div className="auth-switch">
          <button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Đăng nhập</button>
          <button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Tạo tài khoản</button>
        </div>

        <form onSubmit={mode === 'login' ? handleLogin : handleRegister} className="form-stack">
          {mode === 'register' && (
            <label>
              Họ và tên
              <input value={form.name} onChange={(event) => update('name', event.target.value)} placeholder="VD: Nguyễn Văn A" />
            </label>
          )}
          <label>
            Email
            <input type="email" required value={form.email} onChange={(event) => update('email', event.target.value)} placeholder="email@truong.edu.vn" />
          </label>
          <label>
            Mật khẩu
            <input type="password" required minLength={6} value={form.password} onChange={(event) => update('password', event.target.value)} placeholder="Tối thiểu 6 kí tự" />
          </label>
          {mode === 'register' && (
            <label>
              Mã tạo Admin, nếu có
              <input value={form.adminCode} onChange={(event) => update('adminCode', event.target.value)} placeholder="VD: ADMIN2026" />
              <small>Tài khoản đầu tiên sẽ tự là Admin. Các tài khoản sau mặc định là Giáo viên.</small>
            </label>
          )}

          {message && <p className="error-box">{message}</p>}
          <button className="primary-button" disabled={busy}>{busy ? 'Đang xử lí...' : mode === 'login' ? 'Đăng nhập' : 'Tạo tài khoản'}</button>
        </form>
      </section>
    </div>
  );
}

function Dashboard({ classes, students, violations, violationTypes, isAdmin }) {
  const today = todayISO();
  const week = getWeekRange(today);
  const month = monthStart();

  const todayItems = violations.filter((item) => item.date === today);
  const weekItems = violations.filter((item) => item.date >= week.start && item.date <= week.end);
  const monthItems = violations.filter((item) => item.date >= month && item.date <= today);
  const activeStudents = students.filter((item) => item.status !== 'inactive');
  const byClass = sumBy(monthItems, (item) => item.className, (item) => item.point);

  return (
    <main className="content-grid">
      <section className="stat-grid">
        <StatCard label="Số lớp đang theo dõi" value={classes.length} note={isAdmin ? 'Toàn trường' : 'Lớp được phân công'} />
        <StatCard label="Học sinh đang quản lí" value={activeStudents.length} note="Trạng thái đang học" />
        <StatCard label="Lỗi hôm nay" value={todayItems.length} note={today} />
        <StatCard label="Lỗi trong tuần" value={weekItems.length} note={`${week.start} đến ${week.end}`} />
        <StatCard label="Điểm trừ trong tháng" value={monthItems.reduce((sum, item) => sum + Number(item.point || 0), 0)} note="Tổng điểm âm/dương" />
        <StatCard label="Danh mục lỗi" value={violationTypes.length} note="Admin có thể chỉnh sửa" />
      </section>

      <section className="card">
        <div className="section-title">
          <div>
            <h2>Xếp hạng điểm nề nếp theo lớp trong tháng</h2>
            <p>Lớp có tổng điểm ít bị trừ hơn sẽ nằm phía trên.</p>
          </div>
        </div>
        <DataTable
          emptyText="Chưa có dữ liệu vi phạm trong tháng."
          headers={['Hạng', 'Lớp', 'Số lỗi', 'Tổng điểm']}
          rows={byClass.map((item, index) => [index + 1, item.key, item.count, item.point])}
        />
      </section>

      <section className="card">
        <div className="section-title">
          <div>
            <h2>Lỗi mới nhất</h2>
            <p>Danh sách 10 ghi nhận gần nhất.</p>
          </div>
        </div>
        <DataTable
          emptyText="Chưa có lỗi nào được ghi nhận."
          headers={['Ngày', 'Lớp', 'Học sinh', 'Lỗi', 'Điểm', 'Ghi chú']}
          rows={violations.slice(0, 10).map((item) => [item.date, item.className, item.studentName, item.typeName, item.point, item.note || ''])}
        />
      </section>
    </main>
  );
}

function StatCard({ label, value, note }) {
  return (
    <article className="stat-card">
      <span>{label}</span>
      <strong>{formatNumber(value)}</strong>
      <small>{note}</small>
    </article>
  );
}

function ClassManager({ classes }) {
  const [form, setForm] = useState({ className: '', grade: '7', homeroomTeacher: '' });
  const [editingId, setEditingId] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    const payload = {
      className: form.className.trim().toUpperCase(),
      grade: form.grade.trim(),
      homeroomTeacher: form.homeroomTeacher.trim(),
      updatedAt: serverTimestamp(),
    };
    if (!payload.className) return;

    if (editingId) {
      await updateDoc(doc(db, 'classes', editingId), payload);
    } else {
      await addDoc(collection(db, 'classes'), { ...payload, createdAt: serverTimestamp() });
    }
    setEditingId(null);
    setForm({ className: '', grade: '7', homeroomTeacher: '' });
  };

  const edit = (item) => {
    setEditingId(item.id);
    setForm({ className: item.className || '', grade: item.grade || '', homeroomTeacher: item.homeroomTeacher || '' });
  };

  return (
    <main className="two-column">
      <section className="card">
        <h2>{editingId ? 'Cập nhật lớp' : 'Tạo lớp học'}</h2>
        <form className="form-stack" onSubmit={submit}>
          <label>
            Tên lớp
            <input required value={form.className} onChange={(event) => setForm({ ...form, className: event.target.value })} placeholder="VD: 7B" />
          </label>
          <label>
            Khối
            <input value={form.grade} onChange={(event) => setForm({ ...form, grade: event.target.value })} placeholder="VD: 7" />
          </label>
          <label>
            Giáo viên chủ nhiệm
            <input value={form.homeroomTeacher} onChange={(event) => setForm({ ...form, homeroomTeacher: event.target.value })} placeholder="Tên GVCN" />
          </label>
          <button className="primary-button">{editingId ? 'Lưu cập nhật' : 'Thêm lớp'}</button>
          {editingId && <button type="button" className="ghost-button" onClick={() => { setEditingId(null); setForm({ className: '', grade: '7', homeroomTeacher: '' }); }}>Hủy sửa</button>}
        </form>
      </section>

      <section className="card wide-card">
        <h2>Danh sách lớp</h2>
        <DataTable
          emptyText="Chưa có lớp học."
          headers={['Lớp', 'Khối', 'GVCN', 'Thao tác']}
          rows={classes.map((item) => [
            item.className,
            item.grade,
            item.homeroomTeacher,
            <RowActions key={item.id} onEdit={() => edit(item)} onDelete={() => deleteDoc(doc(db, 'classes', item.id))} />,
          ])}
        />
      </section>
    </main>
  );
}

function StudentManager({ classes, students }) {
  const [form, setForm] = useState({ fullName: '', className: classes[0]?.className || '', gender: '', parentPhone: '' });
  const [filterClass, setFilterClass] = useState('all');
  const [bulkText, setBulkText] = useState('');
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    if (!form.className && classes[0]?.className) setForm((prev) => ({ ...prev, className: classes[0].className }));
  }, [classes, form.className]);

  const filteredStudents = filterClass === 'all' ? students : students.filter((item) => item.className === filterClass);

  const submit = async (event) => {
    event.preventDefault();
    const payload = {
      fullName: form.fullName.trim(),
      className: form.className,
      gender: form.gender,
      parentPhone: form.parentPhone.trim(),
      status: 'active',
      updatedAt: serverTimestamp(),
    };
    if (!payload.fullName || !payload.className) return;

    if (editingId) {
      await updateDoc(doc(db, 'students', editingId), payload);
    } else {
      await addDoc(collection(db, 'students'), { ...payload, createdAt: serverTimestamp() });
    }
    setEditingId(null);
    setForm({ fullName: '', className: payload.className, gender: '', parentPhone: '' });
  };

  const importBulk = async () => {
    const className = form.className || classes[0]?.className;
    if (!className || !bulkText.trim()) return;
    const lines = bulkText.split('\n').map((line) => line.trim()).filter(Boolean);
    for (const line of lines) {
      const [fullName, gender = '', parentPhone = ''] = line.split('|').map((part) => part.trim());
      if (fullName) {
        await addDoc(collection(db, 'students'), {
          fullName,
          gender,
          parentPhone,
          className,
          status: 'active',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }
    setBulkText('');
  };

  const edit = (item) => {
    setEditingId(item.id);
    setForm({ fullName: item.fullName || '', className: item.className || '', gender: item.gender || '', parentPhone: item.parentPhone || '' });
  };

  return (
    <main className="content-grid">
      <section className="two-column">
        <div className="card">
          <h2>{editingId ? 'Cập nhật học sinh' : 'Thêm học sinh'}</h2>
          <form className="form-stack" onSubmit={submit}>
            <label>
              Họ tên học sinh
              <input required value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} placeholder="VD: Nguyễn Anh Tuấn" />
            </label>
            <label>
              Lớp
              <select required value={form.className} onChange={(event) => setForm({ ...form, className: event.target.value })}>
                <option value="">Chọn lớp</option>
                {classes.map((item) => <option key={item.id} value={item.className}>{item.className}</option>)}
              </select>
            </label>
            <label>
              Giới tính
              <select value={form.gender} onChange={(event) => setForm({ ...form, gender: event.target.value })}>
                <option value="">Chưa chọn</option>
                <option value="Nam">Nam</option>
                <option value="Nữ">Nữ</option>
              </select>
            </label>
            <label>
              SĐT phụ huynh
              <input value={form.parentPhone} onChange={(event) => setForm({ ...form, parentPhone: event.target.value })} placeholder="Không bắt buộc" />
            </label>
            <button className="primary-button">{editingId ? 'Lưu cập nhật' : 'Thêm học sinh'}</button>
            {editingId && <button type="button" className="ghost-button" onClick={() => { setEditingId(null); setForm({ fullName: '', className: form.className, gender: '', parentPhone: '' }); }}>Hủy sửa</button>}
          </form>
        </div>

        <div className="card">
          <h2>Nhập nhanh danh sách</h2>
          <p className="muted">Mỗi dòng một học sinh. Có thể nhập: Họ tên | Giới tính | SĐT phụ huynh</p>
          <textarea rows="8" value={bulkText} onChange={(event) => setBulkText(event.target.value)} placeholder={'Nguyễn Văn A | Nam | 09...\nTrần Thị B | Nữ | 09...'} />
          <button className="primary-button" onClick={importBulk}>Nhập nhanh vào lớp {form.className || 'đã chọn'}</button>
        </div>
      </section>

      <section className="card">
        <div className="section-title">
          <div>
            <h2>Danh sách học sinh</h2>
            <p>Tổng: {filteredStudents.length} học sinh.</p>
          </div>
          <select value={filterClass} onChange={(event) => setFilterClass(event.target.value)}>
            <option value="all">Tất cả lớp</option>
            {classes.map((item) => <option key={item.id} value={item.className}>{item.className}</option>)}
          </select>
        </div>
        <DataTable
          emptyText="Chưa có học sinh."
          headers={['Họ tên', 'Lớp', 'Giới tính', 'SĐT PH', 'Trạng thái', 'Thao tác']}
          rows={filteredStudents.map((item) => [
            item.fullName,
            item.className,
            item.gender,
            item.parentPhone,
            item.status === 'inactive' ? 'Đã nghỉ' : 'Đang học',
            <RowActions
              key={item.id}
              onEdit={() => edit(item)}
              onDelete={() => updateDoc(doc(db, 'students', item.id), { status: 'inactive', updatedAt: serverTimestamp() })}
              deleteLabel="Cho nghỉ"
            />,
          ])}
        />
      </section>
    </main>
  );
}

function ViolationTypeManager({ violationTypes }) {
  const [form, setForm] = useState({ name: '', point: '-1', category: 'Nề nếp' });
  const [editingId, setEditingId] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    const payload = {
      name: form.name.trim(),
      point: Number(form.point),
      category: form.category.trim() || 'Nề nếp',
      active: true,
      updatedAt: serverTimestamp(),
    };
    if (!payload.name) return;

    if (editingId) {
      await updateDoc(doc(db, 'violationTypes', editingId), payload);
    } else {
      await addDoc(collection(db, 'violationTypes'), { ...payload, createdAt: serverTimestamp() });
    }
    setEditingId(null);
    setForm({ name: '', point: '-1', category: 'Nề nếp' });
  };

  const seedDefaultTypes = async () => {
    const defaults = [
      ['Đi học muộn', -2, 'Chuyên cần'],
      ['Không đeo khăn quàng/thẻ học sinh', -1, 'Trang phục'],
      ['Mất trật tự trong giờ học', -2, 'Ý thức'],
      ['Không làm bài tập', -2, 'Học tập'],
      ['Nói tục, ứng xử chưa phù hợp', -3, 'Đạo đức'],
      ['Không vệ sinh lớp/khu vực được phân công', -2, 'Lao động'],
      ['Sử dụng điện thoại không đúng quy định', -3, 'Kỷ luật'],
      ['Gây gổ, xô xát', -5, 'Kỷ luật'],
    ];
    for (const [name, point, category] of defaults) {
      await addDoc(collection(db, 'violationTypes'), {
        name,
        point,
        category,
        active: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  };

  const edit = (item) => {
    setEditingId(item.id);
    setForm({ name: item.name || '', point: String(item.point ?? -1), category: item.category || 'Nề nếp' });
  };

  return (
    <main className="two-column">
      <section className="card">
        <h2>{editingId ? 'Cập nhật lỗi nề nếp' : 'Tạo danh mục lỗi'}</h2>
        <form className="form-stack" onSubmit={submit}>
          <label>
            Tên lỗi
            <input required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="VD: Đi học muộn" />
          </label>
          <label>
            Điểm trừ
            <input type="number" value={form.point} onChange={(event) => setForm({ ...form, point: event.target.value })} />
          </label>
          <label>
            Nhóm lỗi
            <input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} placeholder="VD: Chuyên cần" />
          </label>
          <button className="primary-button">{editingId ? 'Lưu cập nhật' : 'Thêm lỗi'}</button>
          {editingId && <button type="button" className="ghost-button" onClick={() => { setEditingId(null); setForm({ name: '', point: '-1', category: 'Nề nếp' }); }}>Hủy sửa</button>}
        </form>
        <button className="ghost-button full-width" onClick={seedDefaultTypes}>Tạo nhanh bộ lỗi mẫu</button>
      </section>

      <section className="card wide-card">
        <h2>Danh mục lỗi nề nếp</h2>
        <DataTable
          emptyText="Chưa có danh mục lỗi."
          headers={['Tên lỗi', 'Nhóm', 'Điểm', 'Trạng thái', 'Thao tác']}
          rows={violationTypes.map((item) => [
            item.name,
            item.category,
            item.point,
            item.active ? 'Đang dùng' : 'Tạm ẩn',
            <div className="row-actions" key={item.id}>
              <button onClick={() => edit(item)}>Sửa</button>
              <button onClick={() => updateDoc(doc(db, 'violationTypes', item.id), { active: !item.active, updatedAt: serverTimestamp() })}>{item.active ? 'Ẩn' : 'Bật'}</button>
              <button className="danger" onClick={() => deleteDoc(doc(db, 'violationTypes', item.id))}>Xóa</button>
            </div>,
          ])}
        />
      </section>
    </main>
  );
}

function ViolationEntry({ profile, classes, students, violationTypes, allowedClassNames, isAdmin }) {
  const [form, setForm] = useState({ date: todayISO(), className: '', studentId: '', typeId: '', note: '' });
  const [message, setMessage] = useState('');

  const activeTypes = violationTypes.filter((item) => item.active !== false);
  const classOptions = isAdmin ? classes.map((item) => item.className) : allowedClassNames;
  const studentOptions = students.filter((item) => item.status !== 'inactive' && item.className === form.className);

  useEffect(() => {
    if (!form.className && classOptions[0]) setForm((prev) => ({ ...prev, className: classOptions[0] }));
  }, [classOptions, form.className]);

  const submit = async (event) => {
    event.preventDefault();
    setMessage('');
    const student = students.find((item) => item.id === form.studentId);
    const type = activeTypes.find((item) => item.id === form.typeId);
    if (!student || !type) {
      setMessage('Vui lòng chọn học sinh và lỗi nề nếp.');
      return;
    }

    await addDoc(collection(db, 'violations'), {
      date: form.date,
      className: student.className,
      studentId: student.id,
      studentName: student.fullName,
      typeId: type.id,
      typeName: type.name,
      category: type.category || '',
      point: Number(type.point || 0),
      note: form.note.trim(),
      createdBy: {
        uid: profile.id,
        name: profile.name || profile.email,
        email: profile.email,
      },
      createdAt: serverTimestamp(),
    });
    setMessage(`Đã ghi nhận lỗi cho ${student.fullName}.`);
    setForm((prev) => ({ ...prev, studentId: '', typeId: '', note: '' }));
  };

  return (
    <main className="two-column">
      <section className="card">
        <h2>Nhập lỗi nề nếp</h2>
        {classOptions.length === 0 && <p className="warning-box">Tài khoản giáo viên này chưa được phân công lớp. Admin cần vào mục Tài khoản để gán lớp.</p>}
        <form className="form-stack" onSubmit={submit}>
          <label>
            Ngày ghi nhận
            <input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
          </label>
          <label>
            Lớp
            <select required value={form.className} onChange={(event) => setForm({ ...form, className: event.target.value, studentId: '' })}>
              <option value="">Chọn lớp</option>
              {classOptions.map((className) => <option key={className} value={className}>{className}</option>)}
            </select>
          </label>
          <label>
            Học sinh
            <select required value={form.studentId} onChange={(event) => setForm({ ...form, studentId: event.target.value })}>
              <option value="">Chọn học sinh</option>
              {studentOptions.map((item) => <option key={item.id} value={item.id}>{item.fullName}</option>)}
            </select>
          </label>
          <label>
            Lỗi nề nếp
            <select required value={form.typeId} onChange={(event) => setForm({ ...form, typeId: event.target.value })}>
              <option value="">Chọn lỗi</option>
              {activeTypes.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.point} điểm)</option>)}
            </select>
          </label>
          <label>
            Ghi chú
            <textarea rows="4" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder="VD: Ghi nhận trong tiết 2, đã nhắc nhở riêng." />
          </label>
          {message && <p className="success-box">{message}</p>}
          <button className="primary-button">Lưu ghi nhận</button>
        </form>
      </section>

      <section className="card wide-card">
        <h2>Gợi ý quy trình nhập</h2>
        <ol className="soft-list">
          <li>Chọn đúng ngày và lớp.</li>
          <li>Chọn học sinh cần ghi nhận.</li>
          <li>Chọn lỗi nề nếp tương ứng với danh mục đã tạo.</li>
          <li>Thêm ghi chú ngắn, khách quan, tránh dùng từ nặng nề.</li>
          <li>Cuối tuần vào Thống kê để xem điểm lớp 7B hoặc toàn trường.</li>
        </ol>
      </section>
    </main>
  );
}

function StatsPage({ classes, students, violations, isAdmin }) {
  const week = getWeekRange(todayISO());
  const [filters, setFilters] = useState({ className: 'all', from: week.start, to: week.end });

  const classNames = classes.map((item) => item.className);
  const filtered = violations.filter((item) => {
    const byClass = filters.className === 'all' || item.className === filters.className;
    const byFrom = !filters.from || item.date >= filters.from;
    const byTo = !filters.to || item.date <= filters.to;
    return byClass && byFrom && byTo;
  });

  const byClass = sumBy(filtered, (item) => item.className, (item) => item.point);
  const byStudent = sumBy(filtered, (item) => `${item.className} - ${item.studentName}`, (item) => item.point);

  const exportExcel = () => {
    const detailRows = filtered.map((item) => ({
      Ngày: item.date,
      Lớp: item.className,
      'Học sinh': item.studentName,
      'Lỗi nề nếp': item.typeName,
      Nhóm: item.category || '',
      Điểm: item.point,
      'Ghi chú': item.note || '',
      'Người nhập': item.createdBy?.name || '',
    }));

    const classRows = byClass.map((item, index) => ({ Hạng: index + 1, Lớp: item.key, 'Số lỗi': item.count, 'Tổng điểm': item.point }));
    const studentRows = byStudent.map((item, index) => ({ STT: index + 1, 'Lớp - Học sinh': item.key, 'Số lỗi': item.count, 'Tổng điểm': item.point }));

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(classRows), 'Tong hop lop');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(studentRows), 'Tong hop hoc sinh');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailRows), 'Chi tiet loi');
    XLSX.writeFile(wb, `bao-cao-ne-nep-${filters.from}-den-${filters.to}.xlsx`);
  };

  const exportPDF = () => {
    const rowsHtml = filtered.map((item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${item.date || ''}</td>
        <td>${item.className || ''}</td>
        <td>${item.studentName || ''}</td>
        <td>${item.typeName || ''}</td>
        <td>${item.point || 0}</td>
        <td>${item.note || ''}</td>
      </tr>
    `).join('');

    const summaryHtml = byClass.map((item, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${item.key}</td>
        <td>${item.count}</td>
        <td>${item.point}</td>
      </tr>
    `).join('');

    const popup = window.open('', '_blank');
    popup.document.write(`
      <html>
        <head>
          <title>Báo cáo nề nếp</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 28px; color: #111827; }
            h1 { font-size: 22px; margin: 0 0 8px; }
            h2 { font-size: 16px; margin-top: 24px; }
            p { margin: 4px 0 16px; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; font-size: 12px; }
            th, td { border: 1px solid #cbd5e1; padding: 7px; text-align: left; vertical-align: top; }
            th { background: #f1f5f9; }
            .sign { margin-top: 40px; display: flex; justify-content: space-between; text-align: center; }
            @media print { button { display: none; } }
          </style>
        </head>
        <body>
          <button onclick="window.print()">In / Lưu PDF</button>
          <h1>BÁO CÁO THEO DÕI NỀ NẾP HỌC SINH</h1>
          <p>Thời gian: ${filters.from || '...'} đến ${filters.to || '...'}</p>
          <p>Phạm vi: ${filters.className === 'all' ? (isAdmin ? 'Toàn trường' : 'Các lớp được phân công') : `Lớp ${filters.className}`}</p>

          <h2>1. Tổng hợp theo lớp</h2>
          <table>
            <thead><tr><th>Hạng</th><th>Lớp</th><th>Số lỗi</th><th>Tổng điểm</th></tr></thead>
            <tbody>${summaryHtml || '<tr><td colspan="4">Chưa có dữ liệu.</td></tr>'}</tbody>
          </table>

          <h2>2. Chi tiết ghi nhận</h2>
          <table>
            <thead><tr><th>STT</th><th>Ngày</th><th>Lớp</th><th>Học sinh</th><th>Lỗi</th><th>Điểm</th><th>Ghi chú</th></tr></thead>
            <tbody>${rowsHtml || '<tr><td colspan="7">Chưa có dữ liệu.</td></tr>'}</tbody>
          </table>

          <div class="sign">
            <div>Người lập báo cáo<br/><br/><br/>........................</div>
            <div>Ban nề nếp / GVCN<br/><br/><br/>........................</div>
          </div>
        </body>
      </html>
    `);
    popup.document.close();
  };

  return (
    <main className="content-grid">
      <section className="card">
        <div className="section-title">
          <div>
            <h2>Thống kê nề nếp</h2>
            <p>Lọc theo lớp 7B hoặc xem toàn bộ dữ liệu được phân quyền.</p>
          </div>
          <div className="button-row">
            <button className="ghost-button" onClick={exportExcel}>Xuất Excel</button>
            <button className="primary-button" onClick={exportPDF}>Xuất PDF</button>
          </div>
        </div>

        <div className="filter-grid">
          <label>
            Phạm vi lớp
            <select value={filters.className} onChange={(event) => setFilters({ ...filters, className: event.target.value })}>
              <option value="all">{isAdmin ? 'Toàn trường' : 'Các lớp được phân công'}</option>
              {classNames.map((className) => <option key={className} value={className}>{className}</option>)}
            </select>
          </label>
          <label>
            Từ ngày
            <input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} />
          </label>
          <label>
            Đến ngày
            <input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} />
          </label>
        </div>
      </section>

      <section className="stat-grid">
        <StatCard label="Tổng lỗi" value={filtered.length} note="Theo bộ lọc hiện tại" />
        <StatCard label="Tổng điểm" value={filtered.reduce((sum, item) => sum + Number(item.point || 0), 0)} note="Điểm âm là điểm trừ" />
        <StatCard label="Số lớp có ghi nhận" value={new Set(filtered.map((item) => item.className)).size} note="Trong khoảng thời gian lọc" />
        <StatCard label="Số học sinh có ghi nhận" value={new Set(filtered.map((item) => item.studentId)).size} note={`Tổng HS hệ thống: ${students.length}`} />
      </section>

      <section className="card">
        <h2>Tổng hợp theo lớp</h2>
        <DataTable
          emptyText="Chưa có dữ liệu theo bộ lọc."
          headers={['Hạng', 'Lớp', 'Số lỗi', 'Tổng điểm']}
          rows={byClass.map((item, index) => [index + 1, item.key, item.count, item.point])}
        />
      </section>

      <section className="card">
        <h2>Tổng hợp theo học sinh</h2>
        <DataTable
          emptyText="Chưa có dữ liệu theo bộ lọc."
          headers={['STT', 'Lớp - Học sinh', 'Số lỗi', 'Tổng điểm']}
          rows={byStudent.map((item, index) => [index + 1, item.key, item.count, item.point])}
        />
      </section>

      <section className="card">
        <h2>Chi tiết lỗi</h2>
        <DataTable
          emptyText="Chưa có dữ liệu theo bộ lọc."
          headers={['Ngày', 'Lớp', 'Học sinh', 'Lỗi', 'Điểm', 'Ghi chú']}
          rows={filtered.map((item) => [item.date, item.className, item.studentName, item.typeName, item.point, item.note || ''])}
        />
      </section>
    </main>
  );
}

function UserManager({ users, classes }) {
  const [editing, setEditing] = useState({});

  const save = async (item) => {
    const next = editing[item.id] || {};
    await updateDoc(doc(db, 'users', item.id), {
      name: next.name ?? item.name ?? '',
      role: next.role ?? item.role ?? 'teacher',
      homeroomClass: next.homeroomClass ?? item.homeroomClass ?? '',
      assignedClasses: normalizeClassList(next.assignedClasses ?? (item.assignedClasses || []).join(', ')),
      updatedAt: serverTimestamp(),
    });
    setEditing((prev) => ({ ...prev, [item.id]: undefined }));
  };

  const updateDraft = (id, key, value) => {
    setEditing((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [key]: value } }));
  };

  const classNames = classes.map((item) => item.className).join(', ');

  return (
    <main className="card">
      <div className="section-title">
        <div>
          <h2>Quản lí tài khoản</h2>
          <p>Gán quyền Admin/Giáo viên và lớp được phép nhập dữ liệu. Lớp hiện có: {classNames || 'chưa có lớp'}.</p>
        </div>
      </div>
      <div className="responsive-table">
        <table>
          <thead>
            <tr>
              <th>Họ tên</th>
              <th>Email</th>
              <th>Vai trò</th>
              <th>Lớp chủ nhiệm</th>
              <th>Lớp được phân công</th>
              <th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {users.map((item) => {
              const draft = editing[item.id] || {};
              return (
                <tr key={item.id}>
                  <td><input value={draft.name ?? item.name ?? ''} onChange={(event) => updateDraft(item.id, 'name', event.target.value)} /></td>
                  <td>{item.email}</td>
                  <td>
                    <select value={draft.role ?? item.role ?? 'teacher'} onChange={(event) => updateDraft(item.id, 'role', event.target.value)}>
                      <option value="teacher">Giáo viên</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td>
                    <select value={draft.homeroomClass ?? item.homeroomClass ?? ''} onChange={(event) => updateDraft(item.id, 'homeroomClass', event.target.value)}>
                      <option value="">Không chọn</option>
                      {classes.map((classItem) => <option key={classItem.id} value={classItem.className}>{classItem.className}</option>)}
                    </select>
                  </td>
                  <td><input value={draft.assignedClasses ?? (item.assignedClasses || []).join(', ')} onChange={(event) => updateDraft(item.id, 'assignedClasses', event.target.value)} placeholder="VD: 7A, 7B" /></td>
                  <td><button className="primary-button compact" onClick={() => save(item)}>Lưu</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}

function RowActions({ onEdit, onDelete, deleteLabel = 'Xóa' }) {
  return (
    <div className="row-actions">
      <button onClick={onEdit}>Sửa</button>
      <button className="danger" onClick={onDelete}>{deleteLabel}</button>
    </div>
  );
}

function DataTable({ headers, rows, emptyText }) {
  return (
    <div className="responsive-table">
      <table>
        <thead>
          <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={headers.length} className="empty-cell">{emptyText}</td></tr>
          ) : rows.map((row, index) => (
            <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default App;
